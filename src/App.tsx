import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVITIES, EPISODES_RAW, FLAG_RULES, FLAVOR, OPPONENTS, PLAYER, ROSTER, rosterFor } from './content';
import { fillNamesDeep } from './engine/names';
import { applyWeek, coachLocksCity, offerWeek, recordWeek, weekContext, weekPending, type Activity, type WeekChoice } from './engine/week';
import { WeekScreen } from './ui/WeekScreen';
import { generateConditions, toneFromHistory } from './engine/conditions';
import { readHistory, episodeMemory, recentFlavor, recordResult } from './telemetry/history';
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
import type { Attribute, Episode, EpisodeOption, Resolution, TimelineEvent } from './engine/types';
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
  | { k: 'week'; offers: Activity[]; locked: boolean; leveledFrom: number; leveledTo: number }
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
      recordResult(summary.scoreUs, summary.scoreThem, session.usedEpisodeIds, [...session.flavorSeen]);

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
        flavorSeen: recentFlavor(BALANCE.match.memory.horizon), startDelta: penalty.startDelta,
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

  /** Ещё не закрытая неделя после последнего тура: шесть предложений детерминированно по сиду. */
  const pendingWeek = useCallback(() => {
    const sn = seasonRef.current;
    const career = careerRef.current;
    const ctx = weekContext(sn, career, ourRow(sn).position);
    if (!ctx || isSeasonOver(sn) || !weekPending(career, ctx)) return null;
    const offers = offerWeek(ACTIVITIES, ctx, career, makeRng(sn.seed + sn.round * 104729 + 7));
    return { offers, ctx, locked: coachLocksCity(ctx) };
  }, []);

  const afterSeason = useCallback((leveledFrom: number, leveledTo: number) => {
    const w = pendingWeek();
    if (w) setStage({ k: 'week', offers: w.offers, locked: w.locked, leveledFrom, leveledTo });
    else setStage(leveledTo > leveledFrom ? { k: 'levelup', fromLevel: leveledFrom, toLevel: leveledTo } : { k: 'menu' });
  }, [pendingWeek]);

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
    if (w) setStage({ k: 'week', offers: w.offers, locked: w.locked, leveledFrom: career.level, leveledTo: career.level });
  }, [stage.k, career.level, pendingWeek]);

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
        onNewSeason={() => { newSeason(); setStage(leveled ? { k: 'levelup', fromLevel: stage.leveledFrom, toLevel: stage.leveledTo } : { k: 'menu' }); }}
      />
    );
  }

  if (stage.k === 'week') {
    const sn = seasonRef.current;
    const fixture = ourFixture(sn);
    const roster = rosterFor(fixture?.opponentKey ?? Object.keys(OPPONENTS)[0], makeRng(sn.seed + sn.round));
    const { leveledFrom, leveledTo } = stage;
    return (
      <WeekScreen
        key={sn.number + ':' + sn.round}
        offers={fillNamesDeep(stage.offers, roster)}
        locked={stage.locked}
        onConfirm={(choices: WeekChoice[]) => {
          const ctx = weekContext(sn, careerRef.current, ourRow(sn).position)!;
          // Применяем по исходным (без имён) делам: эффекты те же, id те же.
          const raw = choices.map((c) => ({ ...c, activity: stage.offers.find((a) => a.id === c.activity.id)! }));
          const { career: after, tags } = applyWeek(careerRef.current, raw);
          setCareerBoth(recordWeek(after, ctx, stage.offers, raw.map((c) => c.activity)));
          return tags;
        }}
        onNext={() => setStage(leveledTo > leveledFrom ? { k: 'levelup', fromLevel: leveledFrom, toLevel: leveledTo } : { k: 'menu' })}
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
