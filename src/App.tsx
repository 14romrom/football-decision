import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVITIES, EPISODES_RAW, FLAG_RULES, FLAVOR, OPPONENTS, PLAYER, ROSTER, WEEK_SCENES, rosterFor } from './content';
import { fillNamesDeep } from './engine/names';
import { applyWeek, coachLocksCity, finishWeek, planWeek, weekContext, weekPending, weekVoiceSees, type Activity, type WeekOffer, type WeekPick } from './engine/week';
import { WeekScreen } from './ui/WeekScreen';
import { generateConditions, toneFromHistory } from './engine/conditions';
import { readHistory, episodeMemory, recentFeed, recentFlavor, recentPosts, recordPosts, recordResult } from './telemetry/history';
import { buildFeed, buildPostContext, postQuota, type Post, type PostGroup } from './engine/posts';
import { PostsScreen } from './ui/PostsScreen';
import { fillNames, opponentTraits } from './engine/names';
import { BALANCE } from './engine/balance';
import { BriefingScreen } from './ui/BriefingScreen';
import { PlayerCard } from './ui/PlayerCard';
import { LevelUpScreen } from './ui/LevelUpScreen';
import { makeRng, type Rng } from './engine/rng';
import { resolveOption } from './engine/resolve';
import {
  applyChoice, createMatch, finishMatch, nextEpisode, sceneInsights,
  type MatchSession, type MatchSummary,
} from './engine/match';
import {
  applyMatchToCareer, consumeStartPenalty, effectivePlayer, spendPoint, xpForMatch,
  type Career,
} from './engine/career';
import { readCareer, writeCareer } from './telemetry/career-storage';
import { readSeason, writeSeason } from './telemetry/season-storage';
import {
  createSeason, isSeasonOver, ourFixture, ourRow, recordRound, seasonVerdict, SEASON_ROUNDS, US, type Season,
} from './engine/season';
import { SeasonScreen } from './ui/SeasonScreen';
import { dominantVoice } from './engine/voices';
import type { Attribute, Episode, EpisodeOption, Resolution, TimelineEvent, VoiceKey } from './engine/types';
import { logDecision } from './telemetry/log';
import { MatchScreen } from './ui/MatchScreen';
import { EpisodeCard } from './ui/EpisodeCard';
import { RollView } from './ui/RollView';
import { ResultScreen } from './ui/ResultScreen';
import { StatsScreen } from './ui/StatsScreen';
import { DebugPanel } from './ui/DebugPanel';

type Stage =
  | { k: 'menu' }
  | { k: 'briefing'; carryoverNote?: string }
  | { k: 'feed' }
  | { k: 'episode'; episode: Episode; minute: number; link: boolean }
  | { k: 'roll'; episode: Episode; option: EpisodeOption; res: Resolution; events: TimelineEvent[]; continues?: string }
  | { k: 'result'; summary: MatchSummary; xpEarned: number; leveledFrom: number; leveledTo: number }
  | { k: 'season'; leveledFrom: number; leveledTo: number }
  | { k: 'posts'; posts: Post[]; leveledFrom: number; leveledTo: number }
  | { k: 'week'; days: WeekOffer[][]; news: Post[]; locked: boolean; leveledFrom: number; leveledTo: number }
  | { k: 'levelup'; fromLevel: number; toLevel: number };

type Pending =
  | { kind: 'episode'; episode: Episode; minute: number; link: boolean }
  | { kind: 'result'; summary: MatchSummary; xpEarned: number; leveledFrom: number; leveledTo: number };

/** Подпись на кнопке «Далі», когда цепочка сработала: куда ведёт сцена. */
const CHAIN_NEXT: Record<string, string> = {
  fin_shot: 'удар', fin_penalty: 'удар з позначки', fin_penalty_wait: 'гра нервів', ep_free_kick_close: 'штрафний', ep_rebound_follow_up: 'добивання',
};

/** Пауза на событие ленты: гол должен успеть прозвучать, проходной момент — нет. */
function delayFor(e: TimelineEvent): number {
  if (e.kind === 'goalUs' || e.kind === 'goalThem') return 2400;
  if (e.kind === 'halftime' || e.kind === 'kickoff') return 1800;
  if (e.kind === 'episode') return 0;   // исход уже показан на экране броска
  return 1900;
}

function Game() {
  const sessionRef = useRef<MatchSession | null>(null);
  const rngRef = useRef<Rng | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const shownAtRef = useRef(0);
  // career — состояние для UI (уровень/опыт на экранах) и ref для чтения из колбэков
  // без устаревших замыканий, тот же приём, что и sessionRef/rngRef.
  const careerRef = useRef<Career>(readCareer());
  const [career, setCareer] = useState<Career>(careerRef.current);
  const setCareerBoth = useCallback((c: Career) => { careerRef.current = c; writeCareer(c); setCareer(c); }, []);

  // Сезон: расписание и таблица (M5-лайт). Создаётся при первом заходе, живёт в localStorage.
  const seasonRef = useRef<Season>(readSeason() ?? createSeason(Math.floor(Math.random() * 1e9), Object.keys(OPPONENTS)));
  const [season, setSeason] = useState<Season>(seasonRef.current);
  const setSeasonBoth = useCallback((sn: Season) => { seasonRef.current = sn; writeSeason(sn); setSeason(sn); }, []);
  useEffect(() => { writeSeason(seasonRef.current); }, []);
  const clubName = useCallback((key: string) => (key === US ? ROSTER.us.name.nom : OPPONENTS[key]?.name.nom ?? key), []);

  const [stage, setStage] = useState<Stage>({ k: 'menu' });
  const [shown, setShown] = useState<TimelineEvent[]>([]);
  const [queue, setQueue] = useState<TimelineEvent[]>([]);

  const proceed = useCallback((lead: TimelineEvent[] = []) => {
    const session = sessionRef.current!;
    const rng = rngRef.current!;
    const next = nextEpisode(session, rng);
    if (next) {
      // Звено цепочки приходит без ленты: та же минута, сцена продолжается.
      pendingRef.current = { kind: 'episode', episode: next.episode, minute: next.minute, link: session.chainLinks > 0 && next.events.length === 0 };
      setQueue([...lead, ...next.events]);
    } else {
      const { events, summary } = finishMatch(session, rng);
      // Тонус, память эпизодов и прочитанные реплики — для следующего матча.
      recordResult(summary.scoreUs, summary.scoreThem, session.usedEpisodeIds, [...session.flavorSeen], [...session.feedSeen]);

      const before = careerRef.current;
      const hadDominantVoice = dominantVoice(session.state.voices) !== null;
      const xpEarned = xpForMatch(summary, hadDominantVoice);
      const after = applyMatchToCareer(before, session.state, summary, hadDominantVoice, session.conditions.opponentKey);
      setCareerBoth(after);

      // Тур закрыт: наш результат настоящий, чужие матчи — по силе клубов (свой rng по сиду сезона и туру).
      const sn = seasonRef.current;
      if (!isSeasonOver(sn)) {
        const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
        setSeasonBoth(recordRound(sn, {
          scoreUs: summary.scoreUs, scoreThem: summary.scoreThem,
          goals: summary.stats.goals, assists: summary.stats.assists,
          coachRating: summary.coachRating, fanRating: summary.fanRating,
          scorers: summary.goals.filter((g) => g.side === 'us').map((g) => g.scorer),
          moments: summary.moments ?? {},
        }, strengths, makeRng(sn.seed + sn.round * 7919)));
      }

      pendingRef.current = {
        kind: 'result', summary, xpEarned, leveledFrom: before.level, leveledTo: after.level,
      };
      setQueue([...lead, ...events]);
    }
    setStage({ k: 'feed' });
  }, [setCareerBoth]);

  const start = useCallback(() => {
    // ?seed= воспроизводит конкретный матч, но только первый: иначе «Ще матч»
    // раз за разом даёт ту же игру, и кажется, что эпизодов всего десять.
    const params = new URLSearchParams(location.search);
    const fromUrl = Number(params.get('seed'));
    const seed = Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : Math.floor(Math.random() * 1e9);
    if (params.has('seed')) history.replaceState(null, '', location.pathname + location.hash);
    const rng = makeRng(seed);
    // Условия матча — по сиду и расписанию сезона, тонус — из истории этого устройства.
    const fixture = ourFixture(seasonRef.current) ?? undefined;
    const conditions = generateConditions(rng, OPPONENTS, toneFromHistory(readHistory().map((h) => h.result)), fixture);

    // Перенос из карьеры: травма/карточка прошлого матча бьют по старту этого,
    // доверие тренера продолжается (с регрессией), а не сбрасывается на 55.
    const { career: consumedCareer, penalty } = consumeStartPenalty(careerRef.current);
    setCareerBoth(consumedCareer);
    const player = effectivePlayer(PLAYER, consumedCareer, penalty.attrBonus);

    const session = createMatch(
      `${Date.now().toString(36)}-${seed}`, seed, player, rng, EPISODES_RAW, rosterFor(conditions.opponentKey, rng), conditions,
      episodeMemory(BALANCE.match.memory.horizon), FLAG_RULES,
      {
        coachTrust: consumedCareer.coachTrust, staminaPenalty: penalty.staminaPenalty,
        coachTrustPenalty: penalty.coachTrustPenalty, flags: penalty.flags,
        flavorSeen: recentFlavor(BALANCE.match.memory.horizon), feedSeen: recentFeed(BALANCE.match.memory.horizon),
        startDelta: penalty.startDelta,
        voiceStreak: penalty.voiceStreak, voiceMute: penalty.voiceMute, injuriesSeason: consumedCareer.injuriesSeason,
      },
    );
    rngRef.current = rng;
    sessionRef.current = session;
    setShown([]);
    setStage({ k: 'briefing', carryoverNote: penalty.note });
  }, [setCareerBoth, setSeasonBoth]);

  const newSeason = useCallback(() => {
    const prev = seasonRef.current;
    setSeasonBoth(createSeason(Math.floor(Math.random() * 1e9), Object.keys(OPPONENTS), prev.number + 1));
    setCareerBoth({ ...careerRef.current, injuriesSeason: 0 });   // лимит травм — на сезон
  }, [setSeasonBoth]);

  /** Стрічка по текущему состоянию сезона: посты с именами следующего соперника. quota — сколько
   *  и каких групп; seedSalt — чтобы стрічка після таблиці и пости між днями не совпадали. */
  const buildPosts = useCallback((quota: Record<PostGroup, number>, seedSalt: number): Post[] => {
    const sn = seasonRef.current;
    const fixture = isSeasonOver(sn) ? null : ourFixture(sn);
    const nextKey = fixture?.opponentKey ?? Object.keys(OPPONENTS)[0];
    const rng = makeRng(sn.seed + sn.round * 30011 + seedSalt);
    const roster = rosterFor(nextKey, rng);
    const ctx = buildPostContext(sn, careerRef.current, fixture
      ? { opponentKey: fixture.opponentKey, venue: fixture.venue, strength: OPPONENTS[fixture.opponentKey].strength, traits: opponentTraits(roster.them) }
      : null);
    if (!ctx) return [];
    const club = (key: string) => (key === US ? ROSTER.us.name : OPPONENTS[key].name);
    const last = ctx.lastOpponentKey ? club(ctx.lastOpponentKey) : club(nextKey);
    const extra: Record<string, string> = {
      last: last.nom, 'last.gen': last.gen,
      leader: club(ctx.leaderKey).nom, 'leader.gen': club(ctx.leaderKey).gen,
      bottom: club(ctx.bottomKey).nom, 'bottom.gen': club(ctx.bottomKey).gen,
      score: ctx.scoreUs + ':' + ctx.scoreThem, position: String(ctx.position), round: String(ctx.round),
    };
    const seen = new Set(recentPosts());
    const raw = buildFeed(ctx, rng, seen, undefined, quota);
    recordPosts(raw.map((p) => p.text));
    const fill = (t: string) => fillNames(t, roster, extra);
    return raw.map((p) => ({
      ...p, text: fill(p.text), account: { ...p.account, name: fill(p.account.name) },
      reply: p.reply ? { account: { ...p.reply.account, name: fill(p.reply.account.name) }, text: fill(p.reply.text) } : undefined,
    }));
  }, []);

  /** Ещё не закрытая неделя после последнего тура: три дня по три дела и их исходы —
   *  детерминированно по сиду, перезагрузка показывает те же карточки и те же вечера. */
  const pendingWeek = useCallback(() => {
    const sn = seasonRef.current;
    const career = careerRef.current;
    const ctx = weekContext(sn, career, ourRow(sn).position);
    if (!ctx || isSeasonOver(sn) || !weekPending(career, ctx)) return null;
    const days = planWeek(ACTIVITIES, effectivePlayer(PLAYER, career), ctx, career, makeRng(sn.seed + sn.round * 104729 + 7));
    return { days, ctx, locked: coachLocksCity(ctx) };
  }, []);

  const afterPosts = useCallback((leveledFrom: number, leveledTo: number) => {
    const w = pendingWeek();
    // Пости між днями — тільки світові: свій тур уже обговорили у стрічці.
    if (w) setStage({ k: 'week', days: w.days, news: buildPosts({ self: 0, league: 0, world: BALANCE.week.days - 1, cross: 0, meta: 0 }, 11), locked: w.locked, leveledFrom, leveledTo });
    else setStage(BALANCE.growth.levels && leveledTo > leveledFrom ? { k: 'levelup', fromLevel: leveledFrom, toLevel: leveledTo } : { k: 'menu' });
  }, [pendingWeek, buildPosts]);

  /** Стрічка після таблиці: пости про тур, лігу, наступного суперника і великий футбол.
   *  Имена — ростер следующего соперника; клубы таблицы и последний соперник — через extra. */
  const afterSeason = useCallback((leveledFrom: number, leveledTo: number) => {
    const sn = seasonRef.current;
    if (isSeasonOver(sn)) { afterPosts(leveledFrom, leveledTo); return; }
    setStage({ k: 'posts', posts: buildPosts(postQuota(sn.number), 3), leveledFrom, leveledTo });
  }, [afterPosts, buildPosts]);

  const confirmLevelUp = useCallback((attr: Attribute) => {
    const after = spendPoint(careerRef.current, attr);
    setCareerBoth(after);
    // Два уровня за матч — два очка, экран покажется ещё раз.
    setStage(after.unspentPoints > 0 ? { k: 'levelup', fromLevel: after.level - after.unspentPoints, toLevel: after.level } : { k: 'menu' });
  }, [setCareerBoth]);

  const kickoff = useCallback(() => {
    proceed(sessionRef.current!.state.log.slice());   // стартовый свисток уже лежит в логе
  }, [proceed]);

  // Проигрывание ленты: по одному событию, пока очередь не опустеет.
  useEffect(() => {
    if (stage.k !== 'feed') return;
    if (queue.length === 0) {
      const p = pendingRef.current;
      pendingRef.current = null;
      if (!p) return;
      if (p.kind === 'episode') {
        shownAtRef.current = performance.now();
        setStage({ k: 'episode', episode: p.episode, minute: p.minute, link: p.link });
      } else {
        setStage({ k: 'result', summary: p.summary, xpEarned: p.xpEarned, leveledFrom: p.leveledFrom, leveledTo: p.leveledTo });
      }
      return;
    }
    const t = setTimeout(() => {
      setShown((s) => [...s, queue[0]]);
      setQueue((q) => q.slice(1));
    }, delayFor(queue[0]));
    return () => clearTimeout(t);
  }, [stage.k, queue]);

  const skip = useCallback(() => {
    setShown((s) => [...s, ...queue]);
    setQueue([]);
  }, [queue]);

  const choose = useCallback((option: EpisodeOption) => {
    if (stage.k !== 'episode') return;
    const session = sessionRef.current!;
    const rng = rngRef.current!;
    const res = resolveOption(session.state, session.player, option, stage.episode.phase, rng, session.conditions, session.flagRules);

    logDecision({
      matchId: session.matchId,
      seed: session.seed,
      episodeId: stage.episode.id,
      optionId: option.id,
      optionLabel: option.label,
      minute: stage.minute,
      conditions: `${session.conditions.venue}/${session.conditions.strength}/${session.conditions.instruction}/${session.conditions.weather}`,
      stamina: Math.round(session.state.stamina),
      scoreDiff: session.state.scoreUs - session.state.scoreThem,
      momentum: session.state.momentum,
      roll: res.roll,
      totalScore: res.totalScore,
      position: res.position,
      tier: res.tier,
      msToDecide: Math.round(performance.now() - shownAtRef.current),
      at: Date.now(),
      version: __APP_VERSION__,
      insights: sceneInsights(stage.episode, session.state, session.player).map((v) => v.who),
    });

    // Исход применяется сразу: реплика после броска должна знать счёт и минуту
    // уже с учётом этого исхода. В ленту события попадают по кнопке «Далі».
    const { events } = applyChoice(session, stage.episode, option, res, rng, FLAVOR);
    const continues = session.pendingFollowUp ? CHAIN_NEXT[session.pendingFollowUp] ?? 'далі' : undefined;
    setStage({ k: 'roll', episode: stage.episode, option, res, events, continues });
  }, [stage]);

  const afterRoll = useCallback(() => {
    if (stage.k !== 'roll') return;
    setShown((s) => [...s, ...stage.events]);
    proceed();
  }, [stage, proceed]);

  // Перезагрузка на экране недели: меню сначала отдаёт незакрытую неделю — через stage, не рендером
  // на месте (выбор меняет карьеру, и неделя перестала бы быть «незакрытой» до показа итога).
  useEffect(() => {
    if (stage.k !== 'menu') return;
    const w = pendingWeek();
    if (w) setStage({ k: 'week', days: w.days, news: buildPosts({ self: 0, league: 0, world: BALANCE.week.days - 1, cross: 0, meta: 0 }, 11), locked: w.locked, leveledFrom: career.level, leveledTo: career.level });
  }, [stage.k, career.level, pendingWeek, buildPosts]);

  if (stage.k === 'menu' && pendingWeek()) return null;

  if (stage.k === 'menu' && career.unspentPoints > 0) {
    // Непотраченное очко уровня — сначала оно, потом меню: иначе после перезагрузки оно пропадало.
    return <LevelUpScreen player={PLAYER} career={career} fromLevel={career.level - career.unspentPoints} toLevel={career.level} onConfirm={confirmLevelUp} />;
  }

  if (stage.k === 'menu') {
    const fixture = ourFixture(season);
    const row = ourRow(season);
    return (
      <div className="menu">
        <h1>Сезон {season.number}</h1>
        <p>
          Ти — {PLAYER.name}, {PLAYER.position} «{ROSTER.us.name.gen}».
          Дев’ять моментів за матч, і в кожному треба обирати. Переграти не можна.
        </p>
        {fixture ? (
          <p className="season-note">
            Тур {fixture.round + 1} з {SEASON_ROUNDS}: «{clubName(fixture.opponentKey)}», {fixture.venue === 'home' ? 'вдома' : 'на виїзді'}.
            {season.round > 0 && ` Зараз ${row.position}-е місце, ${row.points} оч.`}
          </p>
        ) : (
          <p className="season-note">Сезон завершено.</p>
        )}
        <p className="muted">
          Тренер і трибуни хочуть від тебе різного. Сили майже не відновлюються — хіба що в перерві.
        </p>
        {fixture
          ? <button className="primary" onClick={start}>До матчу</button>
          : <button className="primary" onClick={() => setStage({ k: 'season', leveledFrom: career.level, leveledTo: career.level })}>Підсумки сезону</button>}
        <a className="link" href="#/player">Картка гравця</a>
        <a className="link" href="#/stats">Розподіл виборів</a>
      </div>
    );
  }

  if (stage.k === 'briefing') {
    const session = sessionRef.current!;
    return (
      <>
        <BriefingScreen
          conditions={session.conditions}
          opponent={OPPONENTS[session.conditions.opponentKey]}
          player={session.player}
          carryoverNote={stage.carryoverNote}
          onStart={kickoff}
        />
        <DebugPanel session={session} />
      </>
    );
  }

  if (stage.k === 'result') {
    return (
      <>
        <ResultScreen
          summary={stage.summary}
          roster={sessionRef.current!.roster}
          playerName={PLAYER.name}
          xpEarned={stage.xpEarned}
          onRestart={() => setStage({ k: 'season', leveledFrom: stage.leveledFrom, leveledTo: stage.leveledTo })}
        />
        <DebugPanel session={sessionRef.current} />
      </>
    );
  }

  if (stage.k === 'season') {
    const leveled = stage.leveledTo > stage.leveledFrom;
    const over = isSeasonOver(season);
    return (
      <SeasonScreen
        season={season}
        clubName={clubName}
        teamGen={ROSTER.us.name.gen}
        playerName={ROSTER.us.players.self.nom}
        verdict={over ? seasonVerdict(season, career.coachTrust) : undefined}
        onNext={() => afterSeason(stage.leveledFrom, stage.leveledTo)}
        onNewSeason={() => { newSeason(); setStage(BALANCE.growth.levels && leveled ? { k: 'levelup', fromLevel: stage.leveledFrom, toLevel: stage.leveledTo } : { k: 'menu' }); }}
      />
    );
  }

  if (stage.k === 'posts') {
    return (
      <PostsScreen
        posts={stage.posts}
        self={{ name: ROSTER.us.players.self.nom, handle: '@reyes10' }}
        onReply={(_post, option) => {
          // Ответ в стрічці — последствия как у дела недели: через applyWeek, чтобы бирки,
          // флаги и старт следующего матча считались в одном месте. Неделя потом дольёт своё.
          const activity: Activity = { id: 'reply', voice: 'ego', title: 'Відповідь у стрічці', line: option.text, effect: option.effect };
          const { career: after, tags } = applyWeek(careerRef.current, [{ activity }]);
          setCareerBoth(after);
          return tags;
        }}
        onNext={() => afterPosts(stage.leveledFrom, stage.leveledTo)}
      />
    );
  }

  if (stage.k === 'week') {
    const sn = seasonRef.current;
    const fixture = ourFixture(sn);
    const roster = rosterFor(fixture?.opponentKey ?? Object.keys(OPPONENTS)[0], makeRng(sn.seed + sn.round));
    const { leveledFrom, leveledTo } = stage;
    const ctx = weekContext(sn, careerRef.current, ourRow(sn).position)!;
    const player = effectivePlayer(PLAYER, careerRef.current);
    return (
      <WeekScreen
        key={sn.number + ':' + sn.round}
        days={fillNamesDeep(stage.days, roster)}
        scenes={fillNamesDeep(WEEK_SCENES, roster)}
        sees={(who: VoiceKey) => weekVoiceSees(who, player, ctx, careerRef.current)}
        news={stage.news}
        locked={stage.locked}
        onFinish={(picks: WeekPick[]) => {
          // Применяем по исходным (без имён) делам и сценам: эффекты те же, id те же.
          const { career: after, tags } = finishWeek(careerRef.current, ctx, stage.days, picks, WEEK_SCENES);
          setCareerBoth(after);
          return tags;
        }}
        onNext={() => setStage(BALANCE.growth.levels && leveledTo > leveledFrom ? { k: 'levelup', fromLevel: leveledFrom, toLevel: leveledTo } : { k: 'menu' })}
      />
    );
  }

  if (stage.k === 'levelup') {
    return <LevelUpScreen player={PLAYER} career={career} fromLevel={stage.fromLevel} toLevel={stage.toLevel} onConfirm={confirmLevelUp} />;
  }

  const session = sessionRef.current!;
  return (
    <>
      <MatchScreen
        state={session.state}
        roster={session.roster}
        shown={shown}
        waiting={stage.k === 'feed' && queue.length > 0}
        onSkip={skip}
      >
        {stage.k === 'episode' && (
          <EpisodeCard
            episode={stage.episode}
            minute={stage.minute}
            state={session.state}
            player={session.player}
            conditions={session.conditions}
            flagRules={session.flagRules}
            link={stage.link}
            onChoose={choose}
          />
        )}
        {stage.k === 'roll' && (
          <RollView
            option={stage.option}
            res={stage.res}
            flavor={stage.events.find((e) => e.kind === 'episode')?.flavor}
            flavorVoice={stage.events.find((e) => e.kind === 'episode')?.flavorVoice}
            badges={stage.events.find((e) => e.kind === 'episode')?.badges}
            continues={stage.continues}
            onNext={afterRoll}
          />
        )}
      </MatchScreen>
      <DebugPanel session={session} />
    </>
  );
}

export function App() {
  const [route, setRoute] = useState(() => location.hash);
  useEffect(() => {
    const onHash = () => setRoute(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (route.startsWith('#/stats')) return <StatsScreen />;
  // Карточка вне активного матча читает карьеру напрямую из хранилища — она не
  // синхронизирована «вживую» с сессией Game (там своя копия в рефе), но для
  // самостоятельного экрана свежего чтения при заходе достаточно.
  if (route.startsWith('#/player')) {
    return (
      <PlayerCard
        player={PLAYER} career={readCareer()} season={readSeason()} history={readHistory()} club={ROSTER.us.name.nom}
        onBack={() => { location.hash = '#/'; }}
      />
    );
  }
  return <Game />;
}
