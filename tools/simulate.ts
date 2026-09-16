// Балансный прогон: N матчей на фиксированных сидах четырьмя ботовыми политиками.
// Гонять после каждого изменения balance.ts:  npm run sim -- 2000

import { makeRng } from '../src/engine/rng';
import { resolveOption } from '../src/engine/resolve';
import { applyChoice, createMatch, finishMatch, nextEpisode } from '../src/engine/match';
import type { MatchSummary } from '../src/engine/match';
import { EPISODES, PLAYER, ROSTER } from '../src/content';
import { POSITION_ORDER } from '../src/engine/balance';
import type { EpisodeOption, Tier } from '../src/engine/types';

export type PolicyName = 'always_safe' | 'always_risky' | 'greedy_personal' | 'random' | 'max_cost';

const risk = (o: EpisodeOption) => POSITION_ORDER.indexOf(o.basePosition);

export const POLICIES: Record<PolicyName, (options: EpisodeOption[], pick: (n: number) => number) => EpisodeOption> = {
  always_safe: (o) => [...o].sort((a, b) => risk(a) - risk(b) || a.staminaCost - b.staminaCost)[0],
  // Ничьи по риску разрешаем в сторону дешёвой опции: иначе «рискованный» бот
  // одновременно оказывается и «самым затратным», и политики перестают быть независимыми.
  always_risky: (o) => [...o].sort((a, b) => risk(b) - risk(a) || a.staminaCost - b.staminaCost)[0],
  greedy_personal: (o) => [...o].sort((a, b) => b.goals.personal - a.goals.personal || risk(b) - risk(a))[0],
  random: (o, pick) => o[pick(o.length)],
  max_cost: (o) => [...o].sort((a, b) => b.staminaCost - a.staminaCost)[0],
};

export type MatchRun = {
  summary: MatchSummary;
  tiers: Tier[];
  /** Минута, на которой стамина впервые упала до нуля (null — не упала). */
  emptyAtMinute: number | null;
};

export function runMatch(seed: number, policy: PolicyName): MatchRun {
  const rng = makeRng(seed);
  const session = createMatch(`sim-${policy}-${seed}`, seed, PLAYER, rng, EPISODES, ROSTER);
  const tiers: Tier[] = [];
  let emptyAtMinute: number | null = null;

  for (;;) {
    const next = nextEpisode(session, EPISODES, rng);
    if (!next) break;
    const option = POLICIES[policy](next.episode.options, (n) => rng.int(0, n - 1));
    const res = resolveOption(session.state, session.player, option, next.episode.phase, rng);
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

export function report(policy: PolicyName, seeds: number[]): PolicyReport {
  const runs = seeds.map((s) => runMatch(s, policy));
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

export function runSuite(n: number) {
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i);
  return SPEC_POLICIES.map((p) => report(p, seeds));
}

// ——— вывод ————————————————————————————————————————————————————————

function pad(v: string | number, w: number, right = false) {
  const s = String(v);
  return right ? s.padStart(w) : s.padEnd(w);
}

function main() {
  const n = Number(process.argv[2] ?? 1000);
  const reports = runSuite(n);

  console.log(`\nБалансный прогон: ${n} матчей на политику, сиды 1000..${1000 + n - 1}\n`);
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
  const medianOk = pooledMedian <= 1 && p99 >= 2 && p99 <= 3 && scored > 0.2 && scored < 0.6;
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
