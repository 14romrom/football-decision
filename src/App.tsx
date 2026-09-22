import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVITIES, ADS, AGENT, EPISODES_RAW, ESPM_COLUMNS, FIRST_MATCH_TUTORIAL, FLAG_RULES, FLAVOR, OPPONENTS, PLAYER, PROLOGUE, ROSTER, WEEK_SCENES, rosterFor, OPPONENT_KEYS, VACATION, syncRoster, ENDING } from './content';
import { adContext, pickAds, playerColumn } from './engine/espm';
import { fillNamesDeep } from './engine/names';
import { applyWeek, coachLocksCity, dominantCareerVoice, finishWeek, planWeek, seenScenes, weekContext, weekPending, weekVoiceSees, type Activity, type WeekOffer, type WeekPick, anchorScene } from './engine/week';
import { WeekScreen } from './ui/WeekScreen';
import { PrologueScreen } from './ui/PrologueScreen';
import { finishPrologue, prologuePending, type ProloguePick } from './engine/prologue';
import { finishVacation, vacationPending } from './engine/vacation';
import { endingPending, finishEnding, partnerBonded, prologueVoice } from './engine/ending';
import { HUNTER, hunterRound } from './engine/programme';
/** Тур другого сезону (0-based, після зими), у якому агент сидить на трибуні (rx_top_agent_in_stands). */
const AGENT_IN_STANDS_ROUND = 6;
/** Тур другого сезону (0-based), у якому тренер міняє тебе на Марена — канвовий показ ep_subbed_off. */
const SUBBED_ROUND = 3;
/** Скільки перших турів першого сезону виходиш із мандражем (M18.3). */
const NERVES_ROUNDS = 2;
import { fillMarket } from './engine/market';
import { type MatchConditions, generateConditions, toneFromHistory } from './engine/conditions';
import { readHistory, episodeMemory, recentFeed, recentFlavor, recentPosts, allSetups, recordPosts, recordResult } from './telemetry/history';
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
  advanceTo, applyChoice, createMatch, finishMatch, nextEpisode, sceneInsights,
  type MatchSession, type MatchSummary,
} from './engine/match';
import { buildEntry, type Entry } from './engine/entry';
import { EntryCard } from './ui/EntryCard';
import {
  applyMatchToCareer, arcStage, consumeStartPenalty, effectivePlayer, spendPoint, xpForMatch,
  metLastYear, type Career, type CarryFacts,
} from './engine/career';
import { readCareer, writeCareer } from './telemetry/career-storage';
import { readSeason, writeSeason } from './telemetry/season-storage';
import { activeSlot } from './telemetry/slots';
import { finaleFor, type FinaleKind } from './engine/finale';
import { programmeNote, traitNote, type ProgrammeInput, coachGoalWord } from './engine/programme';
import { applySettings, readSettings } from './telemetry/settings';
import type { Hint } from './ui/Spotlight';
import { Film } from './ui/Film';
import { AgentScene } from './ui/AgentScene';
import { agentPending, resolveAgent, type AgentChoice } from './engine/agent';
import { TitleScreen } from './ui/TitleScreen';
import { Sticker } from './ui/Sticker';
import { plural } from './ui/pluralize';
import { SlotsScreen } from './ui/SlotsScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { AboutScreen } from './ui/AboutScreen';
import { readSlotSummary } from './telemetry/saves';
import {
  createSeason, firstSeasonVerdict, secondSeasonVerdict, isSeasonOver, monthOfRound, ourFixture, ourRow, playoffPending, promotion, recordPlayoff, recordRound, seasonVerdict, SEASON_ROUNDS, US, WINTER_BREAK_AFTER, withPlayoff, type Season,
} from './engine/season';
import { SeasonScreen } from './ui/SeasonScreen';
import { dominantVoice } from './engine/voices';
import type { Attribute, Episode, EpisodeOption, Resolution, TimelineEvent, VoiceKey } from './engine/types';
import { logDecision } from './telemetry/log';
import { MatchScreen } from './ui/MatchScreen';
import { EpisodeCard } from './ui/EpisodeCard';
import { WhistleCard } from './ui/WhistleCard';
import { buildWhistle, promiseState, whistleContext, type Whistle } from './engine/whistle';
import { RollView } from './ui/RollView';
import { BoardScreen } from './ui/BoardScreen';
import { DeltaScreen } from './ui/DeltaScreen';
import { boardMoments, cardDelta } from './engine/board';
import { StatsScreen } from './ui/StatsScreen';
import { DebugPanel } from './ui/DebugPanel';

type Stage =
  | { k: 'menu' }
  | { k: 'briefing'; carry: CarryFacts }
  | { k: 'feed' }
  | { k: 'episode'; episode: Episode; minute: number; link: boolean }
  | { k: 'roll'; episode: Episode; minute: number; option: EpisodeOption; res: Resolution; events: TimelineEvent[]; continues?: string }
  // Фінальний свисток (M10, 20.09): лист оповідача на полі, потім кнопка «Перейти в роздягальню» → дошка.
  | { k: 'whistle'; whistle: Whistle; summary: MatchSummary; xpEarned: number; leveledFrom: number; leveledTo: number; before: Career; after: Career }
  // Вихід із лави (21.09): лист без кубика на хвилині виходу — сетап, голоси, «Вийти на поле».
  | { k: 'entry'; entry: Entry; minute: number; debut: boolean; lead: TimelineEvent[] }
  // Після матчу (19.09): дошка аналітика → картка з дельтою → таблиця → стрічка → тиждень.
  | { k: 'result'; summary: MatchSummary; xpEarned: number; leveledFrom: number; leveledTo: number; before: Career; after: Career }
  | { k: 'delta'; summary: MatchSummary; before: Career; after: Career; leveledFrom: number; leveledTo: number; card: boolean }
  | { k: 'season'; leveledFrom: number; leveledTo: number }
  | { k: 'posts'; posts: Post[]; leveledFrom: number; leveledTo: number }
  | { k: 'week'; days: WeekOffer[][]; locked: boolean; leveledFrom: number; leveledTo: number }
  // Пролог (M12, 20.09): тиждень нуль у зошиті перед першим матчем нової кар’єри.
  | { k: 'prologue' }
  // Відпустка (M15): три розвороти між сезонами — дзвінок, травма перед медоглядом, база.
  | { k: 'vacation'; leveledFrom: number; leveledTo: number }
  // Останній дзвінок (M16): три розвороти прощання й епілог — кінець першої частини.
  | { k: 'ending' }
  // Сцена агента (M12): після вердикту «трансфер», перед новим сезоном.
  | { k: 'agent'; mode: 'winter' | 'summer'; leveledFrom: number; leveledTo: number }
  | { k: 'levelup'; fromLevel: number; toLevel: number };

type Pending =
  | { kind: 'episode'; episode: Episode; minute: number; link: boolean }
  | { kind: 'entry'; entry: Entry; minute: number; debut: boolean; lead: TimelineEvent[] }
  | { kind: 'result'; whistle: Whistle; summary: MatchSummary; xpEarned: number; leveledFrom: number; leveledTo: number; before: Career; after: Career };

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
  // Дублер пішов після відпустки (M15): ім’я в ростері — за кар’єрою, для всіх, хто читає ROSTER.
  useEffect(() => { syncRoster(!!career.subLeft); }, [career.subLeft]);

  // Сезон: расписание и таблица (M5-лайт). Создаётся при первом заходе, живёт в localStorage.
  const seasonRef = useRef<Season>(readSeason() ?? createSeason(Math.floor(Math.random() * 1e9), OPPONENT_KEYS.second));
  const [season, setSeason] = useState<Season>(seasonRef.current);
  const setSeasonBoth = useCallback((sn: Season) => { seasonRef.current = sn; writeSeason(sn); setSeason(sn); }, []);
  useEffect(() => { writeSeason(seasonRef.current); }, []);
  /** Данные для заметки «Реєс» на програмці (engine/programme.ts): прошлый матч, серии, дела тижня, довіра. */
  const programmeInput = (sn: Season, c: Career, cond: MatchConditions): ProgrammeInput => {
    const played = sn.rounds ?? [];
    const lastRes = sn.round > 0 ? played[sn.round - 1] : undefined;
    const lastFix = sn.round > 0 ? sn.fixtures.find((f) => f.round === sn.round - 1 && (f.home === US || f.away === US)) : undefined;
    const lastKey = lastFix ? (lastFix.home === US ? lastFix.away : lastFix.home) : undefined;
    let scoring = 0; for (let i = played.length - 1; i >= 0; i--) { if ((played[i].goals + played[i].assists) > 0) scoring++; else break; }
    let dry = 0; for (let i = played.length - 1; i >= 0; i--) { if ((played[i].goals + played[i].assists) === 0) dry++; else break; }
    const week = (c.weekLog ?? []).filter((w) => w.season === sn.number && w.round === sn.round).slice(-1)[0];
    const titles = (week?.chosen ?? []).map((id) => { const a = ACTIVITIES.find((x) => x.id === id); return a ? { id, title: a.title } : null; }).filter((a): a is { id: string; title: string } => !!a);
    return {
      round: sn.round + 1, seasonNumber: sn.number,
      last: lastRes && lastKey ? { scoreUs: lastRes.scoreUs, scoreThem: lastRes.scoreThem, opponentGen: OPPONENTS[lastKey]?.name.gen ?? lastKey } : null,
      confidence: cond.tone.confidence, scoringStreak: scoring, dryStreak: dry, weekActivities: titles,
      coachTrust: c.coachTrust, matchesPlayed: c.matchesPlayed, benched: c.benched, arc: arcStage(c), agentEcho: c.agentEcho,
    };
  };
  const clubName = useCallback((key: string) => (key === US ? ROSTER.us.name.nom : OPPONENTS[key]?.name.nom ?? key), []);
  const clubForms = useCallback((key: string) => (key === US ? ROSTER.us.name : OPPONENTS[key]?.name ?? { nom: key, gen: key }), []);

  const [stage, setStage] = useState<Stage>({ k: 'menu' });
  // Краї плівки (ui/Film.tsx): на екранах гри; матч малює свої. Дошка, ESPM і стрічка — без рамки, це «чужі» екрани.
  const film = ['result', 'season', 'posts', 'feed', 'episode', 'roll', 'whistle'].includes(stage.k) ? null : <Film />;
  const [shown, setShown] = useState<TimelineEvent[]>([]);
  // Новий екран — з верху. Хеш-роутер скидає скрол лише на hashchange, а зміни stage всередині #/play — ні:
  // після ESPM з кнопкою внизу стрічка відкривалась прокрученою на 861 px (плейтест 21.09, Б-1).
  useEffect(() => { window.scrollTo(0, 0); }, [stage.k]);
  // Розв’язка на поле: вид по исходу, id — номер броска; ставится со штампом вердикта.
  const [finale, setFinale] = useState<{ kind: FinaleKind; id: number } | null>(null);
  // Остання сцена — для поля між листами (MatchScreen.pitchEpisode): розв’язка грає з її місця після «далі».
  const lastEpisodeRef = useRef<Episode | null>(null);
  const [queue, setQueue] = useState<TimelineEvent[]>([]);

  const proceed = useCallback((lead: TimelineEvent[] = []) => {
    const session = sessionRef.current!;
    const rng = rngRef.current!;
    // Вихід із лави — подія: лента доходить до хвилини виходу і зупиняється на листі «Вийти на поле»;
    // далі proceed() продовжує з тієї ж хвилини до наступного рішення.
    const entryMinute = BALANCE.bench.entryMinute;
    if (session.onBench && session.state.minute < entryMinute && (session.schedule[session.nextIndex] ?? 0) > entryMinute && !session.pendingFollowUp) {
      const events = advanceTo(session, entryMinute, rng);
      // Рядок «виходиш із лави» (benchEnter) — після листа виходу, не до нього: інакше стрічка виводила гравця
      // раніше, ніж він натиснув «Вийти на поле» (плейтест 21.09, Б-9).
      const last = events[events.length - 1];
      const exitLine = last && last.minute === entryMinute && last.kind === 'filler' ? [events.pop()!] : [];
      pendingRef.current = { kind: 'entry', entry: buildEntry(session.state, session.conditions, !!session.tutorial), minute: entryMinute, debut: !!session.tutorial, lead: exitLine };
      setQueue([...lead, ...events]);
      setStage({ k: 'feed' });
      return;
    }
    const next = nextEpisode(session, rng);
    if (next) {
      // Звено цепочки приходит без ленты: та же минута, сцена продолжается.
      pendingRef.current = { kind: 'episode', episode: next.episode, minute: next.minute, link: session.chainLinks > 0 && next.events.length === 0 };
      setQueue([...lead, ...next.events]);
    } else {
      const { events, summary } = finishMatch(session, rng);
      // Лист фінального свистка — з того ж rng і тієї ж пам’яті рядків, що репліки: сезон не повторює його.
      // Рядки свистка з іменами (M13: «{dm} б’є по плечу») — підставляємо під ростер матчу, як репліки.
      const whistle = fillNamesDeep(buildWhistle(
        whistleContext(session.state, summary, session.conditions, promiseState(session.state, session.episodes, session.roster.us.players.self.nom), BALANCE.tiredBelow, careerRef.current.matchesPlayed === 0, session.state.arc, season.number >= 2, session.state.flags.includes('sent_off'), session.state.flags.includes('subbed_off'), playoffPending(seasonRef.current)),
        rng, session.flavorSeen,
      ), session.roster);
      // Тонус, память эпизодов и прочитанные реплики — для следующего матча.
      recordResult(summary.scoreUs, summary.scoreThem, session.usedEpisodeIds, [...session.flavorSeen], [...session.feedSeen], [...session.setupSeenNow]);

      const before = careerRef.current;
      const hadDominantVoice = dominantVoice(session.state.voices) !== null;
      const xpEarned = xpForMatch(summary, hadDominantVoice);
      const after = applyMatchToCareer(before, session.state, summary, hadDominantVoice, session.conditions.opponentKey);
      setCareerBoth(after);

      // Тур закрыт: наш результат настоящий, чужие матчи — по силе клубов (свой rng по сиду сезона и туру).
      const sn = seasonRef.current;
      const ourResult = {
        scoreUs: summary.scoreUs, scoreThem: summary.scoreThem,
        goals: summary.stats.goals, assists: summary.stats.assists,
        coachRating: summary.coachRating, fanRating: summary.fanRating,
        scorers: summary.goals.filter((g) => g.side === 'us').map((g) => g.scorer),
        moments: summary.moments ?? {},
      };
      if (playoffPending(sn)) {
        // Стикові (M19): 11-й матч поза кругом — у таблицю не йде, але сезон закриває саме він.
        setSeasonBoth(recordPlayoff(sn, ourResult));
      } else if (!isSeasonOver(sn)) {
        const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
        setSeasonBoth(withPlayoff(recordRound(sn, ourResult, strengths, makeRng(sn.seed + sn.round * 7919))));
      }

      pendingRef.current = {
        kind: 'result', whistle, summary, xpEarned, leveledFrom: before.level, leveledTo: after.level, before, after,
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
    const conditions = { ...generateConditions(rng, OPPONENTS, toneFromHistory(readHistory().map((h) => h.result)), fixture), league: seasonRef.current.number >= 2 ? 'top' as const : 'second' as const };

    // Перенос из карьеры: травма/карточка прошлого матча бьют по старту этого,
    // доверие тренера продолжается (с регрессией), а не сбрасывается на 55.
    const { career: consumedCareer, penalty } = consumeStartPenalty(careerRef.current);
    setCareerBoth(consumedCareer);
    const player = effectivePlayer(PLAYER, consumedCareer, penalty.attrBonus);

    const session = createMatch(
      `${Date.now().toString(36)}-${seed}`, seed, player, rng, EPISODES_RAW, rosterFor(conditions.opponentKey, rng), conditions,
      episodeMemory(BALANCE.match.memory.horizon), FLAG_RULES,
      {
        coachTrust: consumedCareer.coachTrust, fanHype: consumedCareer.fanHype, fromBench: penalty.fromBench,
        staminaPenalty: penalty.staminaPenalty, coachTrustPenalty: penalty.coachTrustPenalty,
        // «Зустрічалися торік» (M14): флаг матчу для сетапів і реплік, коли суперник був у минулому сезоні.
        flags: [
          ...penalty.flags,
          ...(metLastYear(consumedCareer, conditions.opponentKey) ? [{ flag: 'met_last_year', mark: { minute: 0, episodeId: 'season', optionId: 'met', past: 'грали з ними торік' } }] : []),
          // Колишній дублер у їхній формі (M15): сетапи й репліки знають, хто дихав у спину торік.
          ...(consumedCareer.subLeft && consumedCareer.subClub === conditions.opponentKey ? [{ flag: 'sub_there', mark: { minute: 0, episodeId: 'season', optionId: 'sub', past: 'грав проти колишнього дублера' } }] : []),
          // Другий матч із його клубом (M17): Ларссон виходить з їхньої лави — реактивна сцена rx_top_larsson_from_bench.
          ...(consumedCareer.subLeft && consumedCareer.subClub === conditions.opponentKey && seasonRef.current.played.some((f) => (f.home === US && f.away === consumedCareer.subClub) || (f.away === US && f.home === consumedCareer.subClub))
            ? [{ flag: 'sub_there_again', mark: { minute: 0, episodeId: 'season', optionId: 'sub', past: 'грав проти колишнього дублера вдруге' } }] : []),
          // Мандраж (M18.3): перші два тури першого сезону і перший тур у вищій лізі — поки в сезоні немає
          // жодної результативної дії. Гол або асист знімає його достроково: страх лікується не часом.
          ...((seasonRef.current.number === 1 ? seasonRef.current.round < NERVES_ROUNDS : seasonRef.current.round === 0)
            && (seasonRef.current.player.goals + seasonRef.current.player.assists) === 0
            ? [{ flag: 'nerves', mark: { minute: 0, episodeId: 'season', optionId: 'nerves', past: 'виходив із мандражем' } }] : []),
          // Весна другого сезону (M17, канва): агент на трибуні з чужим шарфом — один матч, після зими, абстрактно.
          ...(seasonRef.current.number >= 2 && seasonRef.current.round === AGENT_IN_STANDS_ROUND ? [{ flag: 'agent_in_stands', mark: { minute: 0, episodeId: 'season', optionId: 'agent', past: 'бачив агента на трибуні' } }] : []),
        ],
        flavorSeen: recentFlavor(BALANCE.match.memory.horizon), feedSeen: recentFeed(BALANCE.match.memory.horizon), setupSeen: allSetups(),
        // Канва не конкурує з вагою (M18.0): два епізоди вищої ліги ставимо в план примусово.
        forceEpisodes: seasonRef.current.number >= 2
          ? [...(seasonRef.current.round === SUBBED_ROUND ? ['ep_subbed_off'] : []),
             ...(seasonRef.current.round === AGENT_IN_STANDS_ROUND ? ['rx_top_agent_in_stands'] : [])]
          : [],
        startDelta: penalty.startDelta,
        voiceStreak: penalty.voiceStreak, voiceMute: penalty.voiceMute, injuriesSeason: consumedCareer.injuriesSeason,
        arc: penalty.arc,
        // Перший матч кар’єри — чотири фіксовані сцени з підказками (M12); далі план як завжди.
        ...(consumedCareer.matchesPlayed === 0 ? { tutorial: FIRST_MATCH_TUTORIAL } : {}),
      },
    );
    rngRef.current = rng;
    sessionRef.current = session;
    setShown([]);
    // Нотатки тижня і прологу зберігаються з плейсхолдерами ({dm}, {sub}) — імена підставляються тут, під ростер матчу.
    setStage({ k: 'briefing', carry: penalty.facts });
  }, [setCareerBoth, setSeasonBoth]);

  const newSeason = useCallback(() => {
    const prev = seasonRef.current;
    // Вердикт «лава» — не текст: новий сезон починаєш із лави (career.benched), поки не вийдеш із неї.
    const benched = seasonVerdict(prev, careerRef.current.coachTrust).kind === 'bench';
    // Регламент підвищення (M14): з нами йдуть ті, хто вище; нові клуби — з тих, кого в першому сезоні не було.
    const promo = promotion(prev);
    // Вища ліга: клуби вищої ліги; якщо місць більше, ніж їх, — добираємо з тих, кого в першому сезоні не було.
    const keep = promo?.with ?? [];
    const rest = OPPONENT_KEYS.second.filter((k) => !prev.clubs.includes(k));
    const pool = prev.number === 1 ? [...keep, ...OPPONENT_KEYS.top, ...rest] : [...OPPONENT_KEYS.top, ...OPPONENT_KEYS.second];
    // Матч із клубом колишнього дублера — на 3-й тур (season.ts:pinFixture), щоб сцена з Ларссоном не потрапила на «не в формі».
    setSeasonBoth(createSeason(Math.floor(Math.random() * 1e9), pool, prev.number + 1, keep, keep[0] ? { club: keep[0], round: 2 } : undefined));
    const c = careerRef.current;
    // Рахунки минулого сезону з кожним суперником — «зустрічалися торік» (програмка, пости, флаг матчу).
    const results: NonNullable<Career['lastSeason']>['results'] = {};
    for (const m of prev.played) {
      if (m.home !== US && m.away !== US) continue;
      const key = m.home === US ? m.away : m.home;
      (results[key] ??= []).push(m.home === US ? { scoreUs: m.homeGoals, scoreThem: m.awayGoals, venue: 'home' } : { scoreUs: m.awayGoals, scoreThem: m.homeGoals, venue: 'away' });
    }
    const lastSeason = { number: prev.number, position: ourRow(prev).position, results };
    // Скандальне підвищення — трибуни не вірять, що ми тут по праву: старт сезону холодніший (рішення 21.09).
    const fanHype = promo?.kind === 'scandal' ? Math.min(c.fanHype ?? BALANCE.fanHypeStart, BALANCE.fanHypeStart - BALANCE.scandalHypeDrop) : c.fanHype;
    setCareerBoth({ ...c, injuriesSeason: 0, benched, lastSeason, ...(promo ? { promotion: promo.kind } : {}), ...(fanHype !== undefined ? { fanHype } : {}) });   // лимит травм — на сезон
  }, [setSeasonBoth]);

  /** Стрічка по текущему состоянию сезона: посты с именами следующего соперника. quota — сколько
   *  и каких групп; seedSalt — соль сида на случай второго вызова за тур. */
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
    if (w) setStage({ k: 'week', days: w.days, locked: w.locked, leveledFrom, leveledTo });
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
      } else if (p.kind === 'entry') {
        setStage({ k: 'entry', entry: p.entry, minute: p.minute, debut: p.debut, lead: p.lead });
      } else {
        setStage({ k: 'whistle', whistle: p.whistle, summary: p.summary, xpEarned: p.xpEarned, leveledFrom: p.leveledFrom, leveledTo: p.leveledTo, before: p.before, after: p.after });
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
    setStage({ k: 'roll', episode: stage.episode, minute: stage.minute, option, res, events, continues });
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
    // Нова кар’єра починається з прологу (M12): три розвороти зошита до першого матчу.
    if (prologuePending(career)) { setStage({ k: 'prologue' }); return; }
    const w = pendingWeek();
    if (w) setStage({ k: 'week', days: w.days, locked: w.locked, leveledFrom: career.level, leveledTo: career.level });
  }, [stage.k, career, pendingWeek, buildPosts]);

  if (stage.k === 'menu' && (prologuePending(career) || pendingWeek())) return null;

  if (stage.k === 'prologue') {
    return (<>{film}
      <PrologueScreen
        spreads={fillNamesDeep(PROLOGUE, ROSTER)}
        onFinish={(picks: ProloguePick[]) => {
          // Наслідки — по контенту без імен: id ті самі, у флагах і бирках імена не потрібні.
          const before = careerRef.current;
          const { career: after, loot } = finishPrologue(before, PROLOGUE, picks);
          setCareerBoth(after);
          return { loot, before: effectivePlayer(PLAYER, before), after: effectivePlayer(PLAYER, after) };
        }}
        onNext={() => setStage({ k: 'menu' })}
      />
    </>);
  }

  if (stage.k === 'vacation') {
    const leveled = stage.leveledTo > stage.leveledFrom;
    return (<>{film}
      <PrologueScreen
        key="vacation"
        spreads={fillNamesDeep(VACATION, ROSTER)}
        header="відпустка · червень — серпень"
        lootTab="ДО НОВОГО СЕЗОНУ"
        lootButton="На базу"
        lootEmpty="Три місяці — і жодної відповіді."
        labels={{ open: 'Вирішити', pick: 'Обери, як вчинити', confirm: 'Так і зробити' }}
        arc={arcStage(career)}
        onFinish={(picks: ProloguePick[]) => {
          const before = careerRef.current;
          const { career: after, loot } = finishVacation(before, VACATION, picks, promotion(seasonRef.current), seasonRef.current.number);
          setCareerBoth(after);
          return { loot, before: effectivePlayer(PLAYER, before), after: effectivePlayer(PLAYER, after) };
        }}
        onNext={() => { newSeason(); setStage(BALANCE.growth.levels && leveled ? { k: 'levelup', fromLevel: stage.leveledFrom, toLevel: stage.leveledTo } : { k: 'menu' }); }}
      />
    </>);
  }

  if (stage.k === 'ending') {
    return (<>{film}
      <PrologueScreen
        key="ending"
        spreads={fillNamesDeep(ENDING.spreads, ROSTER)}
        header="останній тиждень · травень — червень"
        lootButton="Далі буде"
        arc={arcStage(career)}
        firstVoice={prologueVoice(career, PROLOGUE)}
        cold={!partnerBonded(career)}
        epilogue={fillNamesDeep(ENDING.epilogue, ROSTER)}
        labels={{ open: 'Вирішити', pick: 'Обери, як попрощатися', confirm: 'Так і зробити' }}
        onFinish={(picks: ProloguePick[]) => {
          const before = careerRef.current;
          const { career: after } = finishEnding(before, ENDING.spreads, picks, seasonRef.current.number);
          setCareerBoth(after);
          return { loot: [], before: effectivePlayer(PLAYER, before), after: effectivePlayer(PLAYER, after) };
        }}
        onNext={() => { location.hash = '#/'; }}
      />
    </>);
  }

  if (stage.k === 'menu' && career.unspentPoints > 0) {
    // Непотраченное очко уровня — сначала оно, потом меню: иначе после перезагрузки оно пропадало.
    return <LevelUpScreen player={PLAYER} career={career} fromLevel={career.level - career.unspentPoints} toLevel={career.level} onConfirm={confirmLevelUp} />;
  }

  if (stage.k === 'menu' && career.ended) {
    // Епілог (M13): улітку сказав агенту «так» — ця кар’єра дописана; слот можна лише почати заново.
    return (
      <div className="menu">
        {film}
        <div className="card-minute">епілог</div>
        <section className="moment"><div className="scene">
          <span className="minute-tab">{career.ending ? ENDING.epilogue.tab.toUpperCase() : `СЕЗОН ${career.ended.season} · ІНШЕ МІСТО`}</span>
          {career.ending
            ? <>{ENDING.epilogue.text.map((t, k) => <p key={k} className="setup" style={k ? { paddingTop: 0 } : undefined}>{fillNames(t, ROSTER)}</p>)}<p className="nb-aside"><b>{ENDING.epilogue.sign}</b></p></>
            : <p className="setup">{fillNames(AGENT.epilogue, ROSTER)}</p>}
          <button className="primary menu-primary nb-sheet-btn" onClick={() => { location.hash = '#/slots'; }}>Нова кар’єра</button>
        </div></section>
      </div>
    );
  }

  if (stage.k === 'menu') {
    const fixture = ourFixture(season);
    const row = ourRow(season);
    return (
      // Меню кар’єри (19.09, макет «Картка гравця»): компактный стикер сверху — тап открывает картку;
      // абзац-объяснение ушёл, остались тур, соперник и «До матчу».
      <div className="menu">
        {film}
        <Sticker compact player={effectivePlayer(PLAYER, career)} career={career} season={season} dominant={dominantCareerVoice(career)} onOpen={() => { location.hash = '#/player'; }} />
        {fixture ? (
          <p className="season-line menu-fixture">
            <b>Тур {fixture.round + 1} з {SEASON_ROUNDS}.</b> «{clubName(fixture.opponentKey)}», {fixture.venue === 'home' ? 'вдома' : 'на виїзді'}.
            {season.round > 0 && ` ${row.position}-е місце, ${row.points} ${plural(row.points, 'очко', 'очки', 'очок')}.`}
          </p>
        ) : (
          <p className="season-line menu-fixture"><b>Сезон {season.number} завершено.</b></p>
        )}
        {fixture
          ? <button className="primary menu-primary" onClick={start}>До матчу</button>
          : <button className="primary menu-primary" onClick={() => setStage({ k: 'season', leveledFrom: career.level, leveledTo: career.level })}>Підсумки сезону</button>}
        {/* «Розподіл виборів» — инструмент тестеров, живёт в Налаштування → Тестерам (19.09). */}
        <ul className="rows">
          <li><a className="row" href="#/">Головна</a></li>
        </ul>
      </div>
    );
  }

  if (stage.k === 'briefing') {
    const session = sessionRef.current!;
    return (
      <>
        {film}
        <BriefingScreen
          conditions={session.conditions}
          opponent={OPPONENTS[session.conditions.opponentKey]}
          player={session.player}

          round={season.round + 1}
          seasonNumber={season.number}
          promotion={career.promotion}
          lastYear={metLastYear(career, session.conditions.opponentKey)}
          subThere={!!career.subLeft && career.subClub === session.conditions.opponentKey ? ROSTER.us.players.oldsub?.nom ?? null : null}
          guest={hunterRound(season.number, season.round + 1) ? HUNTER.programme : null}
          playoff={playoffPending(season)}
          coachExtra={coachGoalWord(season.number, season.round + 1, season.round > 0 ? ourRow(season).position : 6, SEASON_ROUNDS)}
          usName={ROSTER.us.name.nom}
          note={fillNames(programmeNote({ ...programmeInput(season, career, session.conditions), carry: stage.carry }), session.roster)}
          trait={traitNote(Object.values(OPPONENTS[session.conditions.opponentKey].players).map((p) => p.trait).filter((t): t is string => !!t), session.conditions.venue === 'away' ? 'away' : 'home')}
          onStart={kickoff}
          onBench={!!session.onBench}
        />
        <DebugPanel session={session} />
      </>
    );
  }

  if (stage.k === 'result') {
    const session = sessionRef.current!;
    // Прошлый матч — стёртая надпись на доске; история уже содержит этот матч (recordResult в proceed).
    const prev = readHistory().slice(-2, -1)[0];
    return (
      <>
        <BoardScreen
          summary={stage.summary}
          roster={session.roster}
          moments={boardMoments(session.state, session.episodes)}
          round={season.round}
          prev={prev ? { us: prev.scoreUs, them: prev.scoreThem } : null}
          onNext={() => setStage({ k: 'delta', summary: stage.summary, before: stage.before, after: stage.after, leveledFrom: stage.leveledFrom, leveledTo: stage.leveledTo, card: false })}
        />
        <DebugPanel session={session} />
      </>
    );
  }

  if (stage.k === 'delta') {
    const session = sessionRef.current!;
    // Полная картка — тут же, не через #/player: роут перемонтирует Game и терял бы этап.
    if (stage.card) {
      return (
        <PlayerCard
          player={PLAYER} career={stage.after} season={season} history={readHistory()} club={ROSTER.us.name.nom}
          onBack={() => setStage({ ...stage, card: false })}
        />
      );
    }
    return (
      <DeltaScreen
        player={effectivePlayer(PLAYER, stage.after)}
        career={stage.after}
        season={season}
        dominant={dominantCareerVoice(stage.after)}
        delta={cardDelta(stage.before, stage.after, session.state, stage.summary, PLAYER, session.episodes, session.roster.them.name.nom)}
        onOpenCard={() => setStage({ ...stage, card: true })}
        onNext={() => setStage({ k: 'season', leveledFrom: stage.leveledFrom, leveledTo: stage.leveledTo })}
      />
    );
  }

  if (stage.k === 'season') {
    const leveled = stage.leveledTo > stage.leveledFrom;
    const over = isSeasonOver(season);
    return (
      <SeasonScreen
        season={season}
        club={clubForms}
        playerName={ROSTER.us.players.self.nom}
        playerGen={ROSTER.us.players.self.gen}
        // Реклама по сиду сезона и туру: перезагрузка не меняет банеры; виденные тексты — общая память медиа со стрічкою.
        ads={pickAds(ADS, adContext(season, career.coachTrust), new Set(recentPosts()), makeRng(season.seed + season.round * 6007 + 3))}
        verdict={over ? (season.number === 1 ? firstSeasonVerdict(season, career.coachTrust) : secondSeasonVerdict(season, career.coachTrust)) : undefined}
        nextLabel={season.number >= 2 ? 'Далі' : 'Новий сезон'}
        // Колонка видання про Реєса за станом арки (M13); імена — під наш ростер, пам’ять медіа спільна з постами.
        column={(() => { const c = playerColumn(ESPM_COLUMNS.column, arcStage(career), makeRng(season.seed + season.round * 7331 + 5), new Set(recentPosts())); return c ? fillNamesDeep(c, ROSTER) : undefined; })()}
        onNext={() => afterSeason(stage.leveledFrom, stage.leveledTo)}
        onNewSeason={() => {
          // «Дзвонить агент» — не нагорода, а розвилка: спершу сцена, новий сезон — з неї.
          if (vacationPending(careerRef.current, season.number, over)) { setStage({ k: 'vacation', leveledFrom: stage.leveledFrom, leveledTo: stage.leveledTo }); return; }
          if (endingPending(careerRef.current, season.number, over)) { setStage({ k: 'ending' }); return; }
          const mode = agentPending(careerRef.current, season, over ? seasonVerdict(season, career.coachTrust) : undefined);
          if (mode) { setStage({ k: 'agent', mode, leveledFrom: stage.leveledFrom, leveledTo: stage.leveledTo }); return; }
          newSeason(); setStage(BALANCE.growth.levels && leveled ? { k: 'levelup', fromLevel: stage.leveledFrom, toLevel: stage.leveledTo } : { k: 'menu' });
        }}
      />
    );
  }

  if (stage.k === 'agent') {
    const leveled = stage.leveledTo > stage.leveledFrom;
    return (<>{film}
      <AgentScene
        content={fillNamesDeep(AGENT, ROSTER)}
        mode={stage.mode}
        bonded={(careerRef.current.partnerBond ?? 0) >= BALANCE.people.partnerBonded}
        onChoose={(choice: AgentChoice) => {
          // Обставини зриву — за кар’єрою до нового сезону (травми цього сезону ще не обнулені).
          const { career: after, loot, text, ended } = resolveAgent(careerRef.current, seasonRef.current, AGENT, choice, stage.mode);
          setCareerBoth(after);
          return { text: fillNames(text, ROSTER), loot, ...(ended ? { ended } : {}) };
        }}
        onNext={() => {
          if (careerRef.current.ended) { location.hash = '#/'; return; }
          newSeason(); setStage(BALANCE.growth.levels && leveled ? { k: 'levelup', fromLevel: stage.leveledFrom, toLevel: stage.leveledTo } : { k: 'menu' });
        }}
      />
    </>);
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
    return (<>{film}
      <WeekScreen
        key={sn.number + ':' + sn.round}
        days={fillNamesDeep(fillMarket(stage.days, sn, careerRef.current, ROSTER.us.name.gen), roster)}
        scenes={fillNamesDeep(WEEK_SCENES, roster)}
        anchor={anchorScene(sn.number, sn.round, careerRef.current, fillNamesDeep(WEEK_SCENES, roster))}
        sees={(who: VoiceKey) => weekVoiceSees(who, player, ctx, careerRef.current)}
        locked={stage.locked}
        month={sn.round === WINTER_BREAK_AFTER ? 'зимова перерва · січень' : monthOfRound(sn.round + 1)}   // тиждень живе перед наступним туром
        seen={seenScenes(careerRef.current)}
        seed={sn.seed + sn.round}
        onFinish={(picks: WeekPick[], anchor?: { id: string; option: string }) => {
          // Применяем по исходным (без имён) делам и сценам: эффекты те же, id те же.
          const before = careerRef.current;
          const { career: after, loot } = finishWeek(before, ctx, stage.days, picks, WEEK_SCENES, anchor);
          setCareerBoth(after);
          return { loot, before: effectivePlayer(PLAYER, before), after: effectivePlayer(PLAYER, after) };
        }}
        onNext={() => setStage(BALANCE.growth.levels && leveledTo > leveledFrom ? { k: 'levelup', fromLevel: leveledFrom, toLevel: leveledTo } : { k: 'menu' })}
      />
    </>);
  }

  if (stage.k === 'levelup') {
    return <><Film /><LevelUpScreen player={PLAYER} career={career} fromLevel={stage.fromLevel} toLevel={stage.toLevel} onConfirm={confirmLevelUp} /></>;
  }

  const session = sessionRef.current!;
  /** Підказка-прожектор першого матчу з номером кроку; вимикається в налаштуваннях. */
  const hintFor = (episodeId: string): Hint | undefined => {
    const t = session.tutorial;
    const h = t?.hints[episodeId];
    if (!t || !h || !readSettings().hints) return undefined;
    return { ...h, step: t.plan.indexOf(episodeId) + 1, total: t.plan.length };
  };
  if (stage.k === 'episode' || stage.k === 'roll') lastEpisodeRef.current = stage.episode;
  return (
    <>
      <MatchScreen
        state={session.state}
        roster={session.roster}
        shown={shown}
        waiting={stage.k === 'feed' && queue.length > 0}
        onSkip={skip}
        episode={stage.k === 'episode' || stage.k === 'roll' ? stage.episode : null}
        pitchEpisode={lastEpisodeRef.current}
        sheetMinute={stage.k === 'episode' || stage.k === 'roll' || stage.k === 'entry' ? stage.minute : undefined}
        onBench={!!session.fromBench && (shown.length ? shown[shown.length - 1].minute : 0) < BALANCE.bench.entryMinute}
        player={session.player}
        conditions={session.conditions}
        flagRules={session.flagRules}
        hideDiceZone={stage.k === 'roll'}
        sheet={stage.k === 'whistle' || stage.k === 'entry'}
        finale={finale}
      >
        {stage.k === 'entry' && (
          <EntryCard entry={fillNamesDeep(stage.entry, session.roster)} minute={stage.minute} debut={stage.debut} onNext={() => proceed(stage.lead)} />
        )}
        {stage.k === 'whistle' && (
          <WhistleCard
            whistle={stage.whistle}
            onNext={() => setStage({ k: 'result', summary: stage.summary, xpEarned: stage.xpEarned, leveledFrom: stage.leveledFrom, leveledTo: stage.leveledTo, before: stage.before, after: stage.after })}
          />
        )}
        {stage.k === 'episode' && (
          <EpisodeCard
            episode={stage.episode}
            minute={stage.minute}
            state={session.state}
            player={session.player}
            conditions={session.conditions}
            flagRules={session.flagRules}
            link={stage.link}
            hint={hintFor(stage.episode.id)}
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
            hint={hintFor(stage.episode.id)}
            onNext={afterRoll}
            onVerdict={() => setFinale((f) => ({ kind: finaleFor(stage.episode, stage.option, stage.res, stage.events), id: (f?.id ?? 0) + 1 }))}
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
    applySettings();
    const onHash = () => { setRoute(location.hash); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (hash: string) => { location.hash = hash; };
  // Титул — корень (#/); игра живёт на #/play, чтобы «Назад» с картки и статистики вёл в игру, а не на титул.
  if (route === '' || route === '#' || route === '#/') {
    return (
      <TitleScreen
        onContinue={() => go('#/play')}
        // Первый запуск на пустом устройстве — сразу на поле; слоты показываем, когда есть что беречь.
        onNewCareer={() => go(readSlotSummary(activeSlot()).empty ? '#/play' : '#/slots')}
        onSettings={() => go('#/settings')}
        onAbout={() => go('#/about')}
      />
    );
  }
  if (route.startsWith('#/slots')) return <><Film /><SlotsScreen onStart={() => go('#/play')} onBack={() => go('#/')} /></>;
  if (route.startsWith('#/settings')) return <><Film /><SettingsScreen onBack={() => go('#/')} onWiped={() => go('#/')} /></>;
  if (route.startsWith('#/about')) return <><Film /><AboutScreen onBack={() => go('#/')} /></>;
  if (route.startsWith('#/stats')) return <StatsScreen />;
  // Карточка вне активного матча читает карьеру напрямую из хранилища — она не
  // синхронизирована «вживую» с сессией Game (там своя копия в рефе), но для
  // самостоятельного экрана свежего чтения при заходе достаточно.
  if (route.startsWith('#/player')) {
    return (<>
      <Film />
      <PlayerCard
        player={PLAYER} career={readCareer()} season={readSeason()} history={readHistory()} club={ROSTER.us.name.nom}
        onBack={() => { location.hash = '#/play'; }}
      />
    </>);
  }
  // Слот карьеры (telemetry/slots.ts): Game держит карьеру и сезон в refs, прочитанных при монтировании,
  // поэтому смена слота на титуле — это смена key, а не setState внутри.
  return <Game key={activeSlot()} />;
}
