// Состав матча по регистрам: сколько за матч стандартов, разговорных сцен и физической работы.
// Проверка на вопрос «а может ли выпасть матч из одних стандартов».
//   npx tsx tools/match-mix.ts 400
import { makeRng } from '../src/engine/rng';
import { applyChoice, availableOptions, createMatch, finishMatch, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { EPISODES_RAW, OPPONENTS, PLAYER, rosterFor } from '../src/content';
import { generateConditions } from '../src/engine/conditions';
import type { Episode } from '../src/engine/types';

const N = Number(process.argv[2] ?? 400);
const byId = new Map(EPISODES_RAW.map((e: Episode) => [e.id, e]));
/** Регистр сцены: во что она играет. Цена самого дорогого варианта — прокси физической нагрузки. */
const kindOf = (id: string) => {
  const e = byId.get(id);
  if (!e) return '?';
  if (e.phase === 'setpiece') return 'стандарт';
  const max = Math.max(...e.options.map((o) => o.staminaCost));
  return max <= 4 ? 'розмова' : max >= 8 ? 'робота' : 'гра';
};

const perMatch: Record<string, number[]> = { 'стандарт': [], 'розмова': [], 'робота': [], 'гра': [] };
const perPhase: Record<string, number[]> = { attack: [], defense: [], transition: [], setpiece: [] };
const perKind: Record<string, number[]> = { 'плановий': [], 'реактивний': [], 'ланцюжок': [], 'після свистка': [] };
const kindOf2 = (id: string) => {
  const e = byId.get(id);
  if (!e) return 'плановий';
  if (e.followUpOnly) return 'ланцюжок';
  if (e.afterWhistle) return 'після свистка';
  return (e.requires?.flags?.length ?? 0) > 0 ? 'реактивний' : 'плановий';
};
const maxSum: number[] = [];
const decisions: number[] = [];
for (let i = 0; i < N; i++) {
  const rng = makeRng(40000 + i);
  const league = i % 2 ? 'top' as const : 'second' as const;
  const conditions = { ...generateConditions(rng, OPPONENTS, { confidence: 0, fatigue: 0 }), league };
  const s = createMatch(`mix-${i}`, i, PLAYER, rng, EPISODES_RAW, rosterFor(conditions.opponentKey, rng), conditions);
  const ids: string[] = [];
  for (;;) {
    const next = nextEpisode(s, rng);
    if (!next) break;
    const options = availableOptions(next.episode, s.state, s.player);
    const option = options[rng.int(0, options.length - 1)];
    applyChoice(s, next.episode, option, resolveOption(s.state, s.player, option, next.episode.phase, rng), rng);
    ids.push(next.episode.id);
  }
  finishMatch(s, rng);
  const c: Record<string, number> = { 'стандарт': 0, 'розмова': 0, 'робота': 0, 'гра': 0 };
  let sum = 0;
  for (const id of ids) {
    c[kindOf(id)] = (c[kindOf(id)] ?? 0) + 1;
    const e = byId.get(id);
    if (e) sum += Math.max(...e.options.map((o) => o.staminaCost));
  }
  for (const k of Object.keys(perMatch)) perMatch[k].push(c[k]);
  const ph: Record<string, number> = { attack: 0, defense: 0, transition: 0, setpiece: 0 };
  const kd: Record<string, number> = { 'плановий': 0, 'реактивний': 0, 'ланцюжок': 0, 'після свистка': 0 };
  for (const id of ids) { const e = byId.get(id); if (e) ph[e.phase] += 1; kd[kindOf2(id)] += 1; }
  for (const k of Object.keys(perPhase)) perPhase[k].push(ph[k]);
  for (const k of Object.keys(perKind)) perKind[k].push(kd[k]);
  decisions.push(ids.length);
  maxSum.push(sum);
}

const avg = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(2);
const share = (xs: number[], n: number) => `${Math.round((100 * xs.filter((x) => x >= n).length) / N)}%`;
console.log(`\n${N} матчів, випадкова політика\n`);
console.log('регістр      за матч   матчів із 3+   із 4+   із 5+');
for (const k of ['стандарт', 'розмова', 'робота', 'гра']) {
  console.log(`${k.padEnd(12)} ${avg(perMatch[k]).padStart(5)}      ${share(perMatch[k], 3).padStart(5)}   ${share(perMatch[k], 4).padStart(5)}   ${share(perMatch[k], 5).padStart(5)}`);
}
console.log('\nфаза         за матч   матчів із 0');
for (const k of Object.keys(perPhase)) {
  const z = Math.round((100 * perPhase[k].filter((x) => x === 0).length) / N);
  console.log(`${k.padEnd(12)} ${avg(perPhase[k]).padStart(5)}      ${String(z).padStart(4)}%`);
}
console.log('\nтип сцени    за матч');
for (const k of Object.keys(perKind)) console.log(`${k.padEnd(12)} ${avg(perKind[k]).padStart(5)}`);
console.log(`\nрішень за матч: ${avg(decisions)}`);
const sorted = [...maxSum].sort((a, b) => a - b);
console.log(`\nсума найдорожчих варіантів матчу: медіана ${sorted[N >> 1]}, мінімум ${sorted[0]}, 10-й перцентиль ${sorted[Math.floor(N * 0.1)]}`);
console.log('(щоб жадібний бот вигорів, треба ≈ 59 при пасивному розході 0.46)');
