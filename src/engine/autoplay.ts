// Перемотка кар'єри (M34.2, 03.10): доіграти сезон за гравця, щоб дійти до ключової події за секунду.
//
// Навіщо. Відпустка з медоглядом — на одинадцятому турі, фінал — на двадцять першому. Щоб перевірити
// одну гілку відпустки, треба було зіграти десять матчів руками; щоб перевірити всі — зіграти їх
// стільки ж разів. Контрольна точка (telemetry/checkpoint.ts) рятує тільки там, куди вже дійшов.
//
// Як. Не синтезуємо стан, а **доіграємо тим самим рушієм**: ті самі `createMatch` → `nextEpisode` →
// `resolveOption` → `applyChoice` → `applyMatchToCareer`, той самий тиждень (`planWeek`/`finishWeek`).
// Рішення обираються випадково — як у тестера, що тикає навмання. Інакше (якби ми просто записали
// «тур 10 зіграно») кар'єра лишилася б без пам'яті тижня, флагів і людей, а половина сцен читає саме її.
//
// Чого свідомо не робимо: не пишемо в пам'ять прочитаних реплік, стрічки й вступів. Ці матчі ніхто не
// читав, тож перший справжній матч має починатися зі свіжими текстами, а не з «це вже було».

import { makeRng, type Rng } from './rng';
import { applyChoice, availableOptions, createMatch, finishMatch, nextEpisode } from './match';
import { resolveOption } from './resolve';
import { generateConditions, type MatchConditions, type Strength } from './conditions';
import { applyMatchToCareer, arcStage, coachGrip, consumeStartPenalty, effectivePlayer, spendPoint, type Career } from './career';
import { finishPrologue, prologuePending, type PrologueSpread } from './prologue';
import { finishVacation, vacationPending, type VacationSpread } from './vacation';
import { createSeason, isSeasonOver, nextSeasonFrom, ourFixture, ourRow, playoffPending, promotion, recordPlayoff, recordRound, withPlayoff, type Season } from './season';
import { finishWeek, planWeek, weekContext, type Activity, type WeekPick, type WeekScene } from './week';
import { dominantVoice } from './voices';
import type { Attribute, Episode, FlagRule, Player } from './types';
import type { Roster } from './names';

/** Куди мотаємо. `rounds` — просто N турів уперед. */
export type AutoTarget = { kind: 'rounds'; n: number } | { kind: 'vacation' } | { kind: 'ending' };

export type AutoContent = {
  player: Player;
  episodes: Episode[];
  activities: Activity[];
  scenes: WeekScene[];
  prologue: PrologueSpread[];
  vacation: VacationSpread[];
  flagRules: FlagRule[];
  opponents: Record<string, { strength: Strength }>;
  secondKeys: string[];
  topKeys: string[];
  rosterFor: (key: string, rng: Rng) => Roster;
};

export type AutoResult = {
  career: Career;
  season: Season;
  /** Зіграні тури — щоб UI міг сказати, скільки саме пройдено за гравця. */
  played: number;
  /** Результати матчів у тому ж вигляді, що пише історія: UI складає їх у сховище. */
  matches: { scoreUs: number; scoreThem: number }[];
  /** Відпустку теж пройдено автоматично (ціль «до фіналу»). */
  vacationAuto: boolean;
};

const pick = <T>(rng: Rng, xs: T[]): T => xs[rng.int(0, xs.length - 1)];

/** Один тур: матч випадковою політикою. Повертає підсумок і кар'єру після нього. */
function playMatch(career: Career, season: Season, c: AutoContent, rng: Rng, seen: string[]) {
  const fixture = ourFixture(season)!;
  const grip = coachGrip(career.coachTrust);
  const conditions: MatchConditions = {
    ...generateConditions(rng, c.opponents as never, { confidence: 0, fatigue: 0 }, fixture),
    league: season.number >= 2 ? 'top' : 'second',
    ...(grip.hold ? { instruction: 'hold' as const } : {}),
    ...(grip.noSetPieces ? { noSetPieces: true } : {}),
  };
  const { career: consumed, penalty } = consumeStartPenalty(career);
  const session = createMatch(
    `auto-${season.number}-${season.round}`, rng.int(1, 1e9), effectivePlayer(c.player, consumed, penalty.attrBonus),
    rng, c.episodes, c.rosterFor(conditions.opponentKey, rng), conditions, [], c.flagRules,
    {
      coachTrust: consumed.coachTrust, fanHype: consumed.fanHype, fromBench: penalty.fromBench,
      staminaPenalty: penalty.staminaPenalty, coachTrustPenalty: penalty.coachTrustPenalty,
      flags: penalty.flags, startDelta: penalty.startDelta, voiceStreak: penalty.voiceStreak,
      voiceMute: penalty.voiceMute, injuriesSeason: consumed.injuriesSeason, arc: arcStage(consumed),
      seenEpisodes: seen,
    },
  );
  for (;;) {
    const next = nextEpisode(session, rng);
    if (!next) break;
    const options = availableOptions(next.episode, session.state, session.player);
    const option = pick(rng, options);
    const res = resolveOption(session.state, session.player, option, next.episode.phase, rng, session.conditions, session.flagRules);
    applyChoice(session, next.episode, option, res, rng);
  }
  const { summary } = finishMatch(session, rng);
  let after = applyMatchToCareer(consumed, session.state, summary, dominantVoice(session.state.voices) !== null, conditions.opponentKey);
  const attrs = Object.keys(c.player.attrs) as Attribute[];
  while (after.unspentPoints > 0) after = spendPoint(after, pick(rng, attrs));

  const ours = {
    scoreUs: summary.scoreUs, scoreThem: summary.scoreThem,
    goals: summary.stats.goals, assists: summary.stats.assists,
    coachRating: summary.coachRating, fanRating: summary.fanRating,
    scorers: summary.goals.filter((g) => g.side === 'us').map((g) => g.scorer),
    moments: summary.moments ?? {},
  };
  const strengths = Object.fromEntries(Object.entries(c.opponents).map(([k, o]) => [k, o.strength])) as Record<string, Strength>;
  const nextSeasonState = playoffPending(season)
    ? recordPlayoff(season, ours)
    : withPlayoff(recordRound(season, ours, strengths, makeRng(season.seed + season.round * 7919)));
  return { career: after, season: nextSeasonState, score: { scoreUs: summary.scoreUs, scoreThem: summary.scoreThem }, episodes: session.usedEpisodeIds };
}

/** Тиждень після туру: одна справа на день, випадково. */
function playWeek(career: Career, season: Season, c: AutoContent, rng: Rng): Career {
  const ctx = weekContext(season, career, ourRow(season).position);
  if (!ctx) return career;
  const days = planWeek(c.activities, effectivePlayer(c.player, career), ctx, career, rng);
  const picks: WeekPick[] = days.filter((day) => day.length > 0).map((day, d) => ({ day: d, activityId: pick(rng, day).activity.id }));
  return finishWeek(career, ctx, days, picks, c.scenes).career;
}

/** Перемотка. `start` — поточний стан слота; повертає новий, який UI запише і перемонтує гру. */
export function autoPlay(start: { career: Career; season: Season }, target: AutoTarget, seed: number, c: AutoContent): AutoResult {
  const rng = makeRng(seed);
  let career = start.career;
  let season = start.season;
  const matches: { scoreUs: number; scoreThem: number }[] = [];
  const seenEpisodes: string[] = [];
  let vacationAuto = false;

  // Пролог — теж за гравця: без нього гра відкриється зошитом нульового тижня, а не тим, куди мотали.
  if (prologuePending(career)) {
    const picks = c.prologue.map((s) => ({ spread: s.id, option: pick(rng, s.options).id }));
    career = finishPrologue(career, c.prologue, picks).career;
  }

  const want = target.kind === 'rounds' ? target.n : Infinity;
  const stopAtSeason = target.kind === 'vacation' ? 1 : 2;

  while (matches.length < want) {
    if (isSeasonOver(season)) {
      if (target.kind === 'rounds') break;
      if (season.number >= stopAtSeason && target.kind === 'vacation') break;
      // До фіналу: відпустку теж проходимо навмання — інакше другий сезон не почнеться.
      if (vacationPending(career, season.number, true)) {
        const picks = c.vacation.filter((s) => s.options.length > 0).map((s) => ({ spread: s.id, option: pick(rng, s.options).id }));
        career = finishVacation(career, c.vacation, picks, promotion(season), season.number).career;
        vacationAuto = true;
      }
      if (season.number >= stopAtSeason) break;
      const rolled = nextSeasonFrom(season, career, rng.int(1, 1e9), c.secondKeys, c.topKeys);
      season = rolled.season;
      career = rolled.career as Career;
      continue;
    }
    const round = playMatch(career, season, c, rng, seenEpisodes);
    career = round.career;
    season = round.season;
    seenEpisodes.push(...round.episodes);
    matches.push(round.score);
    if (!isSeasonOver(season)) career = playWeek(career, season, c, rng);
  }

  return { career, season, played: matches.length, matches, vacationAuto };
}

/** Порожній старт — коли мотають із чистого слота. */
export const freshStart = (seed: number, secondKeys: string[]) => createSeason(seed, secondKeys);
