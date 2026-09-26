// Сколько сцен «мы андердоги» (`requires.league: "top"`) реально попадает в матч второго сезона.
// Лог карьеры (26.09): 12 таких решений из 90 за сезон, в двух матчах из десяти — ни одной, хотя
// написано 16 эпизодов. Мерим долю и матчи без единой такой сцены.
//   npx tsx tools/top-share.ts 400

import { EPISODES, ROSTER, FLAG_RULES, PLAYER, OPPONENT_KEYS } from '../src/content';
import { createMatch } from '../src/engine/match';
import { neutralConditions } from '../src/engine/conditions';
import { makeRng } from '../src/engine/rng';

const N = Number(process.argv[2] ?? 400);
const topIds = new Set(EPISODES.filter((e) => e.requires?.league === 'top').map((e) => e.id));

let slots = 0, hits = 0, matchesWithout = 0;
const perMatch: number[] = [];

for (let i = 0; i < N; i++) {
  const seed = 7000 + i;
  const conditions = { ...neutralConditions(), league: 'top' as const, opponentKey: OPPONENT_KEYS.top[i % OPPONENT_KEYS.top.length] };
  const s = createMatch('m' + i, seed, PLAYER, makeRng(seed), EPISODES, ROSTER, conditions, [], FLAG_RULES);
  const n = s.plan.filter((id) => topIds.has(id)).length;
  perMatch.push(n);
  slots += s.plan.length;
  hits += n;
  if (n === 0) matchesWithout++;
}

const avg = (perMatch.reduce((a, b) => a + b, 0) / N).toFixed(2);
console.log(`Сцены вищої ліги: ${N} матчей, пул ${EPISODES.length}, таких эпизодов ${topIds.size}\n`);
console.log(`доля слотов:            ${((100 * hits) / slots).toFixed(1)}%`);
console.log(`на матч:                ${avg}`);
console.log(`матчей без единой:      ${matchesWithout} (${((100 * matchesWithout) / N).toFixed(1)}%)`);
console.log(`распределение по матчу: ${[0, 1, 2, 3, 4].map((k) => `${k}: ${perMatch.filter((x) => x === k).length}`).join(', ')}`);
