// Балансный прогон: N матчей на фиксированных сидах четырьмя ботовыми политиками.
// Гонять после каждого изменения balance.ts:  npm run sim -- 2000
// Повторы на дистанции сезона:              npm run sim -- --season 12
// Тиждень між матчами, политики недели:     npm run sim -- --weeks 200

import { makeRng } from '../src/engine/rng';
import { resolveOption } from '../src/engine/resolve';
import { applyChoice, availableOptions, createMatch, finishMatch, nextEpisode, optionCost } from '../src/engine/match';
import type { MatchSummary } from '../src/engine/match';
import { EPISODES_RAW, FLAG_RULES, OPPONENTS, PLAYER, rosterFor } from '../src/content';
import { generateConditions, neutralConditions, type MatchConditions } from '../src/engine/conditions';
import { BALANCE, POSITION_ORDER } from '../src/engine/balance';
import type { EpisodeMemory, EpisodeOption, Tier } from '../src/engine/types';
import { ACTIVITIES } from '../src/content';
import { applyMatchToCareer, consumeStartPenalty, defaultCareer, effectivePlayer, type Career } from '../src/engine/career';
import { createSeason, isSeasonOver, ourFixture, ourRow, recordRound, type Season } from '../src/engine/season';
import { applyWeek, offerWeek, recordWeek, weekContext, type Activity } from '../src/engine/week';
import { dominantVoice } from '../src/engine/voices';

export type PolicyName = 'always_safe' | 'always_risky' | 'greedy_personal' | 'random' | 'max_cost';

const risk = (o: EpisodeOption) => POSITION_ORDER.indexOf(o.basePosition);

export const POLICIES: Record<PolicyName, (options: EpisodeOption[], pick: (n: number) => number) => EpisodeOption> = {
  always_safe: (o) => [...o].sort((a, b) => risk(a) - risk(b) || a.staminaCost - b.staminaCost)[0],
  // Ничьи по риску разрешаем в сторону дешёвой опции: иначе «рискованный» бот
  // одновременно оказывается и «самым затратным», и политики перестают быть независимыми.
  always_risky: (o) => [...o].sort((a, b) => risk(b) - risk(a) || a.staminaCost - b.staminaCost)[0],
  greedy_personal: (o) => [...o].sort((a, b) => b.goals.personal - a.goals.personal || risk(b) - risk(a))[0],
  random: (o, pick) => o[pick(o.length)],
  max_cost: (o) => [...o].sort((a, b) => optionCost(b) - optionCost(a))[0],
};

export type MatchRun = {
  summary: MatchSummary;
  tiers: Tier[];
  /** Минута, на которой стамина впервые упала до нуля (null — не упала). */
  emptyAtMinute: number | null;
};

export type ConditionsMode = 'neutral' | 'random';

/** Прогон по умолчанию — на нейтральных условиях, чтобы цифры баланса были сравнимы
 *  между версиями. Режим random проверяет, что условия матча не ломают разрыв политик. */
export function runMatch(seed: number, policy: PolicyName, mode: ConditionsMode = 'neutral'): MatchRun {
  const rng = makeRng(seed);
  const conditions: MatchConditions = mode === 'random'
    ? generateConditions(rng, OPPONENTS, { confidence: rng.int(-2, 2), fatigue: rng.int(0, 3) })
    : neutralConditions();
  const session = createMatch(
    `sim-${policy}-${seed}`, seed, PLAYER, rng, EPISODES_RAW, rosterFor(conditions.opponentKey, rng), conditions, [], FLAG_RULES,
  );
  const tiers: Tier[] = [];
  let emptyAtMinute: number | null = null;

  for (;;) {
    const next = nextEpisode(session, rng);
    if (!next) break;
    const option = POLICIES[policy](availableOptions(next.episode, session.state, session.player), (n) => rng.int(0, n - 1));
    const res = resolveOption(session.state, session.player, option, next.episode.phase, rng, session.conditions, session.flagRules);
    applyChoice(session, next.episode, option, res, rng);
    tiers.push(res.tier);
    if (emptyAtMinute === null && session.state.stamina <= 0) emptyAtMinute = next.minute;
  }

  const { summary } = finishMatch(session, rng);
  return { summary, tiers, emptyAtMinute };
}

// ——— агрегаты ——————————————————————————————————————————————————————

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type PolicyReport = {
  policy: PolicyName;
  matches: number;
  avgResult: number;      // (оценка тренера + оценка трибун) / 2 — сводный «средний результат»
  avgCoach: number;
  avgFan: number;
  avgPoints: number;
  avgGoals: number;
  medianGoals: number;
  maxGoals: number;
  goalDist: Record<number, number>;
  badFailShare: number;
  avgStaminaLeft: number;
};

export function report(policy: PolicyName, seeds: number[], mode: ConditionsMode = 'neutral'): PolicyReport {
  const runs = seeds.map((s) => runMatch(s, policy, mode));
  const goals = runs.map((r) => r.summary.stats.goals);
  const allTiers = runs.flatMap((r) => r.tiers);
  const dist: Record<number, number> = {};
  for (const g of goals) dist[g] = (dist[g] ?? 0) + 1;
  const avg = (f: (r: MatchRun) => number) => runs.reduce((s, r) => s + f(r), 0) / runs.length;

  return {
    policy,
    matches: runs.length,
    avgResult: avg((r) => (r.summary.coachRating + r.summary.fanRating) / 2),
    avgCoach: avg((r) => r.summary.coachRating),
    avgFan: avg((r) => r.summary.fanRating),
    avgPoints: avg((r) => r.summary.points),
    avgGoals: avg((r) => r.summary.stats.goals),
    medianGoals: median(goals),
    maxGoals: Math.max(...goals),
    goalDist: dist,
    badFailShare: allTiers.filter((t) => t === 'badFail').length / allTiers.length,
    avgStaminaLeft: avg((r) => r.summary.staminaLeft),
  };
}

const SPEC_POLICIES: PolicyName[] = ['always_safe', 'always_risky', 'greedy_personal', 'random'];

export function runSuite(n: number, mode: ConditionsMode = 'neutral') {
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i);
  return SPEC_POLICIES.map((p) => report(p, seeds, mode));
}

// ——— повторы на дистанции сезона ————————————————————————————————————

export type SeasonReport = {
  matches: number;
  /** Доля эпизодов k-го матча, уже виденных в матчах 1..k−1 (по индексу k−1). */
  repeatShare: number[];
  /** Доля эпизодов k-го матча, виденных в предыдущих двух (та цифра, что мерилась раньше). */
  repeatShareLast2: number[];
  /** Доля слотов k-го матча, где игрок прочитал уже виденный текст сетапа (варианты сетапа
   *  по ситуации делают повтор id не всегда повтором сцены). */
  repeatSetupShare: number[];
  /** Сколько разных эпизодов увидел игрок за сезон, в среднем. */
  uniqueSeen: number;
  poolSize: number;
};

/** Сезон подряд одним игроком со случайной политикой: память — как в игре
 *  (episodeMemory по горизонту), реактивные эпизоды всплывают по флагам. Считает,
 *  сколько раз игрок читает уже знакомый сетап. */
export function runSeason(seedBase: number, matches: number): { repeats: number[]; repeatsLast2: number[]; repeatsSetup: number[]; unique: number } {
  const history: string[][] = [];
  const setupsSeen = new Set<string>();
  const repeats: number[] = [];
  const repeatsLast2: number[] = [];
  const repeatsSetup: number[] = [];
  for (let k = 0; k < matches; k++) {
    const memory: EpisodeMemory = {};
    const window = history.slice(-BALANCE.match.memory.horizon);
    window.forEach((ids, i) => {
      const age = window.length - i;
      for (const id of ids) memory[id] = Math.min(memory[id] ?? age, age);
    });
    const seed = seedBase + k;
    const rng = makeRng(seed);
    const conditions = generateConditions(rng, OPPONENTS, { confidence: rng.int(-2, 2), fatigue: k % 4 });
    const session = createMatch(`season-${seed}`, seed, PLAYER, rng, EPISODES_RAW, rosterFor(conditions.opponentKey, rng), conditions, memory, FLAG_RULES);
    let setupRepeats = 0;
    let slots = 0;
    for (;;) {
      const next = nextEpisode(session, rng);
      if (!next) break;
      slots += 1;
      // Текст сетапа без имён: смена соперника не должна считаться новой сценой.
      const key = next.episode.id + '|' + next.episode.setup.replace(/\d+-й/g, 'N-й');
      if (setupsSeen.has(key)) setupRepeats += 1;
      setupsSeen.add(key);
      const option = POLICIES.random(availableOptions(next.episode, session.state, session.player), (n) => rng.int(0, n - 1));
      const res = resolveOption(session.state, session.player, option, next.episode.phase, rng, session.conditions, session.flagRules);
      applyChoice(session, next.episode, option, res, rng);
    }
    // Звенья цепочек (fin_*) не планируются — их повторение не считается.
    const links = new Set(EPISODES_RAW.filter((e) => e.followUpOnly).map((e) => e.id));
    const ids = session.usedEpisodeIds.filter((id) => !links.has(id));
    const seenAll = new Set(history.flat());
    const seenLast2 = new Set(history.slice(-2).flat());
    repeats.push(ids.filter((id) => seenAll.has(id)).length / ids.length);
    repeatsLast2.push(ids.filter((id) => seenLast2.has(id)).length / ids.length);
    repeatsSetup.push(setupRepeats / slots);
    history.push(ids);
  }
  return { repeats, repeatsLast2, repeatsSetup, unique: new Set(history.flat()).size };
}

export function seasonReport(matches: number, seasons = 200): SeasonReport {
  const runs = Array.from({ length: seasons }, (_, i) => runSeason(50000 + i * 100, matches));
  const avg = (pick: (r: ReturnType<typeof runSeason>) => number[]) =>
    Array.from({ length: matches }, (_, k) => runs.reduce((s, r) => s + pick(r)[k], 0) / runs.length);
  return {
    matches,
    repeatShare: avg((r) => r.repeats),
    repeatShareLast2: avg((r) => r.repeatsLast2),
    repeatSetupShare: avg((r) => r.repeatsSetup),
    uniqueSeen: runs.reduce((s, r) => s + r.unique, 0) / runs.length,
    poolSize: EPISODES_RAW.length,
  };
}

function printSeason(matches: number) {
  const r = seasonReport(matches);
  console.log(`\nПовторы на дистанции сезона: ${matches} матчей подряд, 200 сезонов, случайная политика, пул ${r.poolSize}\n`);
  console.log(pad('матч', 6) + pad('повторов id (все прошлые)', 26, true) + pad('повторов id (2 последних)', 26, true) + pad('повторов текста сетапа', 24, true));
  for (let k = 0; k < matches; k++) {
    console.log(pad(k + 1, 6) + pad((r.repeatShare[k] * 100).toFixed(0) + '%', 26, true)
      + pad((r.repeatShareLast2[k] * 100).toFixed(0) + '%', 26, true) + pad((r.repeatSetupShare[k] * 100).toFixed(0) + '%', 24, true));
  }
  console.log(`\nРазных эпизодов за сезон: ${r.uniqueSeen.toFixed(1)} из ${r.poolSize} (сыграно ${matches * BALANCE.match.episodeMinutes.length} слотов)\n`);
}

// ——— тиждень між матчами: политики недели на дистанции сезона ————————————————

export type WeekPolicy = 'none' | 'random' | 'always_body' | 'always_ego' | 'always_train' | 'rest_and_video';

/** Кого бот берёт из шести предложений. Матчи — случайной политикой, как в seasonReport. */
const WEEK_POLICIES: Record<WeekPolicy, (offers: Activity[], pick: (n: number) => number) => Activity[]> = {
  none: () => [],
  random: (o, pick) => { const a = [...o]; const out: Activity[] = []; while (a.length && out.length < BALANCE.week.picks) out.push(a.splice(pick(a.length), 1)[0]); return out; },
  always_body: (o) => o.filter((a) => a.voice === 'body' || a.voice === 'instinct').slice(0, BALANCE.week.picks),
  always_ego: (o) => o.filter((a) => a.voice === 'ego' || a.voice === 'team').slice(0, BALANCE.week.picks),
  always_train: (o) => o.filter((a) => a.effect.train).slice(0, BALANCE.week.picks),
  rest_and_video: (o) => o.filter((a) => ['recovery', 'sleep', 'video_analyst', 'watch_opponent'].includes(a.id)).slice(0, BALANCE.week.picks),
};

export type CareerRun = { avgResult: number; avgCoach: number; avgFan: number; points: number; level: number; distinctOffered: number; modsGained: number };

/** Сезон одним игроком: неделя → матч → карьера, как в App. Сила соперника — из расписания. */
export function runCareer(seed: number, policy: WeekPolicy): CareerRun {
  let career: Career = defaultCareer();
  let season: Season = createSeason(seed, Object.keys(OPPONENTS));
  const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
  let sumResult = 0; let sumCoach = 0; let sumFan = 0; let n = 0;
  const offeredAll = new Set<string>();
  while (!isSeasonOver(season)) {
    const fixture = ourFixture(season)!;
    const rng = makeRng(seed * 31 + season.round);
    const conditions = generateConditions(rng, OPPONENTS, { confidence: 0, fatigue: 0 }, fixture);
    const { career: consumed, penalty } = consumeStartPenalty(career);
    career = consumed;
    const player = effectivePlayer(PLAYER, career, penalty.attrBonus);
    const session = createMatch(`career-${seed}-${season.round}`, seed, player, rng, EPISODES_RAW, rosterFor(conditions.opponentKey, rng), conditions, [], FLAG_RULES,
      { coachTrust: career.coachTrust, staminaPenalty: penalty.staminaPenalty, coachTrustPenalty: penalty.coachTrustPenalty, flags: penalty.flags, startDelta: penalty.startDelta });
    for (;;) {
      const next = nextEpisode(session, rng);
      if (!next) break;
      const option = POLICIES.random(availableOptions(next.episode, session.state, session.player), (k) => rng.int(0, k - 1));
      const res = resolveOption(session.state, session.player, option, next.episode.phase, rng, session.conditions, session.flagRules);
      applyChoice(session, next.episode, option, res, rng);
    }
    const { summary } = finishMatch(session, rng);
    career = applyMatchToCareer(career, session.state, summary, dominantVoice(session.state.voices) !== null, conditions.opponentKey);
    season = recordRound(season, {
      scoreUs: summary.scoreUs, scoreThem: summary.scoreThem, goals: summary.stats.goals, assists: summary.stats.assists,
      coachRating: summary.coachRating, fanRating: summary.fanRating, scorers: [],
    }, strengths, makeRng(seed + season.round * 7919));
    sumResult += (summary.coachRating + summary.fanRating) / 2; sumCoach += summary.coachRating; sumFan += summary.fanRating; n += 1;
    if (isSeasonOver(season)) break;
    const ctx = weekContext(season, career, ourRow(season).position)!;
    const wrng = makeRng(seed * 7 + season.round * 104729);
    const offers = offerWeek(ACTIVITIES, ctx, career, wrng);
    offers.forEach((a) => offeredAll.add(a.id));
    const chosen = WEEK_POLICIES[policy](offers, (k) => wrng.int(0, k - 1));
    // Тренировка «на выбор» — первый атрибут голоса.
    const choices = chosen.map((a) => ({ activity: a, ...(a.effect.train === 'choice' ? { trainAttr: (a.voice === 'body' ? 'pace' : 'dribbling') as 'pace' | 'dribbling' } : {}) }));
    career = recordWeek(applyWeek(career, choices).career, ctx, offers, chosen);
  }
  const modsGained = Object.values(career.attrPoints).reduce((s, v) => s + (v ?? 0), 0);
  return { avgResult: sumResult / n, avgCoach: sumCoach / n, avgFan: sumFan / n, points: ourRow(season).points, level: career.level, distinctOffered: offeredAll.size, modsGained };
}

export function weeksReport(seasons: number) {
  const policies: WeekPolicy[] = ['none', 'random', 'always_body', 'always_ego', 'always_train', 'rest_and_video'];
  return policies.map((policy) => {
    const runs = Array.from({ length: seasons }, (_, i) => runCareer(70000 + i, policy));
    const avg = (f: (r: CareerRun) => number) => runs.reduce((s, r) => s + f(r), 0) / runs.length;
    return { policy, avgResult: avg((r) => r.avgResult), avgCoach: avg((r) => r.avgCoach), avgFan: avg((r) => r.avgFan), points: avg((r) => r.points), level: avg((r) => r.level), distinctOffered: avg((r) => r.distinctOffered), modsGained: avg((r) => r.modsGained) };
  });
}

function printWeeks(seasons: number) {
  const rows = weeksReport(seasons);
  console.log(`\nТиждень між матчами: ${seasons} сезонов по 10 матчей на политику недели, матчи — случайной политикой\n`);
  const head = [pad('політика тижня', 16), pad('результат', 10, true), pad('тренер', 8, true), pad('трибуны', 9, true), pad('очки', 6, true), pad('рівень', 7, true), pad('+моди', 6, true), pad('різних справ', 13, true)].join(' ');
  console.log(head); console.log('-'.repeat(head.length));
  for (const r of rows) {
    console.log([pad(r.policy, 16), pad(r.avgResult.toFixed(2), 10, true), pad(r.avgCoach.toFixed(2), 8, true), pad(r.avgFan.toFixed(2), 9, true), pad(r.points.toFixed(1), 6, true), pad(r.level.toFixed(1), 7, true), pad(r.modsGained.toFixed(1), 6, true), pad(r.distinctOffered.toFixed(1), 13, true)].join(' '));
  }
  const results = rows.map((r) => r.avgResult);
  const gap = (Math.max(...results) - Math.min(...results)) / Math.min(...results);
  console.log(`\nРазрыв лучшей и худшей политики недели по результату: ${(gap * 100).toFixed(1)}%  (порог 15%) — ${gap <= 0.15 ? 'ок' : 'МНОГО'}\n`);
}

// ——— вывод ————————————————————————————————————————————————————————

function pad(v: string | number, w: number, right = false) {
  const s = String(v);
  return right ? s.padStart(w) : s.padEnd(w);
}

function main() {
  const seasonAt = process.argv.indexOf('--season');
  if (seasonAt >= 0) { printSeason(Number(process.argv[seasonAt + 1] ?? 12)); return; }
  const weeksAt = process.argv.indexOf('--weeks');
  if (weeksAt >= 0) { printWeeks(Number(process.argv[weeksAt + 1] ?? 200)); return; }
  const n = Number(process.argv[2] ?? 1000);
  const mode: ConditionsMode = process.argv.includes('--random-conditions') ? 'random' : 'neutral';
  const reports = runSuite(n, mode);

  console.log(`\nБалансный прогон: ${n} матчей на политику, сиды 1000..${1000 + n - 1}, условия: ${mode === 'random' ? 'случайные' : 'нейтральные'}\n`);
  const head = [
    pad('политика', 16), pad('результат', 10, true), pad('тренер', 8, true), pad('трибуны', 9, true),
    pad('очки', 6, true), pad('голы ср.', 9, true), pad('мед.', 5, true), pad('макс', 5, true),
    pad('badFail', 8, true), pad('стамина', 9, true),
  ].join(' ');
  console.log(head);
  console.log('-'.repeat(head.length));
  for (const r of reports) {
    console.log([
      pad(r.policy, 16),
      pad(r.avgResult.toFixed(2), 10, true),
      pad(r.avgCoach.toFixed(2), 8, true),
      pad(r.avgFan.toFixed(2), 9, true),
      pad(r.avgPoints.toFixed(2), 6, true),
      pad(r.avgGoals.toFixed(2), 9, true),
      pad(r.medianGoals, 5, true),
      pad(r.maxGoals, 5, true),
      pad((r.badFailShare * 100).toFixed(1) + '%', 8, true),
      pad(r.avgStaminaLeft.toFixed(0), 9, true),
    ].join(' '));
  }

  const best = Math.max(...reports.map((r) => r.avgResult));
  const worst = Math.min(...reports.map((r) => r.avgResult));
  const spread = (best - worst) / worst;
  const badFail = reports.reduce((s, r) => s + r.badFailShare, 0) / reports.length;

  console.log('\nПроверки ТЗ:');
  console.log(`  1. Разрыв лучшей и худшей политики: ${(spread * 100).toFixed(1)}%  ` +
    `(порог 15%) — ${spread <= 0.15 ? 'ок' : 'СЛОМАНО'}`);
  // Распределение голов смотрим по всему прогону: отдельная политика — это бот,
  // а не игрок, и её личная медиана ничего не говорит о балансе.
  const pooledMedian = median(reports.flatMap((r) =>
    Object.entries(r.goalDist).flatMap(([g, c]) => Array<number>(c).fill(Number(g)))));
  const pooledGoals = reports.flatMap((r) =>
    Object.entries(r.goalDist).flatMap(([g, c]) => Array<number>(c).fill(Number(g)))).sort((a, b) => a - b);
  const p99 = pooledGoals[Math.floor(pooledGoals.length * 0.99)];
  const scored = pooledGoals.filter((g) => g > 0).length / pooledGoals.length;
  const medianOk = pooledMedian <= 1 && p99 >= 2 && p99 <= 4 && scored > 0.2 && scored < 0.6;
  console.log(`  2. Голы за матч: медиана ${pooledMedian}, 99-й перцентиль ${p99}, ` +
    `матчей с голом ${(scored * 100).toFixed(0)}% — ${medianOk ? 'ок' : 'ПРОВЕРИТЬ'}`);
  console.log(`  3. Доля badFail: ${(badFail * 100).toFixed(1)}%  (коридор 8–15%) — ` +
    `${badFail >= 0.08 && badFail <= 0.15 ? 'ок' : 'СЛОМАНО'}`);

  console.log('\nРаспределение голов по политикам:');
  for (const r of reports) {
    const total = r.matches;
    const row = Object.keys(r.goalDist).map(Number).sort((a, b) => a - b)
      .map((g) => `${g}:${((r.goalDist[g] / total) * 100).toFixed(0)}%`).join('  ');
    console.log(`  ${pad(r.policy, 16)} ${row}`);
  }
  console.log('');
}

// запускаем только как CLI — тесты импортируют из этого файла функции
if (process.argv[1] && process.argv[1].includes('simulate')) main();
