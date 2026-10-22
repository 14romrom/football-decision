// «Тебе пасуть» (22.10): замір до і після на тих самих матчах. Три стилі гри — змішаний (random),
// спокійний (always_safe), агресивний (always_risky) — у двох ситуаціях: перший сезон, друга ліга,
// стартовий Реєс; другий сезон, вища ліга, Реєс, що виріс (+2 до модифікатора кожного атрибута — це
// приблизно проєкція росту за кар'єру: ~11 очок від матчів і ~6 тренувальних на десять атрибутів).
//   npx tsx tools/marked.ts 600

import { EPISODES_RAW, FLAG_RULES, OPPONENTS, PLAYER, OPPONENT_KEYS, rosterFor } from '../src/content';
import { createMatch, nextEpisode, applyChoice, finishMatch, availableOptions } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { computeContext } from '../src/engine/context';
import { generateConditions } from '../src/engine/conditions';
import { makeRng } from '../src/engine/rng';
import { BALANCE, ATTR_MOD } from '../src/engine/balance';
import { POLICIES, type PolicyName } from './simulate';
import type { Player } from '../src/engine/types';

const N = Number(process.argv[2] ?? 600);
const STYLES: [string, PolicyName][] = [['змішаний', 'random'], ['спокійний', 'always_safe'], ['агресивний', 'always_risky']];
const grown: Player = { ...PLAYER, attrs: Object.fromEntries(Object.entries(PLAYER.attrs).map(([k, v]) => [k, Math.min(99, v + 2 * ATTR_MOD.step)])) as Player['attrs'] };
const SITUATIONS = [
  { name: 'С1 · друга ліга, новачок', league: 'second' as const, keys: OPPONENT_KEYS.second, player: PLAYER },
  { name: 'С2 · вища ліга, виріс', league: 'top' as const, keys: OPPONENT_KEYS.top, player: grown },
];
const MARK = BALANCE.conditions.markedPer;
// --self — порівняти з вужчим варіантом (лише удар і обводка).
if (process.argv.includes('--self')) (BALANCE.conditions as { markedScope: string }).markedScope = 'self';

type Row = { g: number; a: number; w: number; d: number; l: number; coach: number; marked: number; decisions: number; hat: number };
function run(sit: typeof SITUATIONS[number], policy: PolicyName, on: boolean): Row {
  (BALANCE.conditions as { markedPer: number }).markedPer = on ? MARK : 0;
  const r: Row = { g: 0, a: 0, w: 0, d: 0, l: 0, coach: 0, marked: 0, decisions: 0, hat: 0 };
  for (let i = 0; i < N; i++) {
    const seed = 77000 + i;
    const rng = makeRng(seed);
    const key = sit.keys[i % sit.keys.length];
    const conditions = { ...generateConditions(rng, OPPONENTS, { confidence: 0, fatigue: 0 }, { opponentKey: key, venue: i % 2 ? 'home' : 'away' }), league: sit.league };
    const s = createMatch('mk' + i, seed, sit.player, rng, EPISODES_RAW, rosterFor(key, rng), conditions, [], FLAG_RULES);
    for (;;) {
      const next = nextEpisode(s, rng);
      if (!next) break;
      const opts = availableOptions(next.episode, s.state, s.player);
      if (!opts.length) break;
      const o = POLICIES[policy](opts, (n) => rng.int(0, n - 1));
      const ctx = computeContext(s.state, s.player, o, next.episode.phase, s.conditions, s.flagRules);
      r.decisions++;
      if (ctx.mods.some((m) => m.short === 'пасуть')) r.marked++;
      const res = resolveOption(s.state, s.player, o, next.episode.phase, rng, s.conditions, s.flagRules);
      applyChoice(s, next.episode, o, res, rng);
      if (s.finished) break;
    }
    const { summary } = finishMatch(s, rng);
    r.g += s.state.stats.goals; r.a += s.state.stats.assists;
    if (s.state.stats.goals + s.state.stats.assists >= 3) r.hat++;
    r.coach += summary.coachRating;
    if (summary.scoreUs > summary.scoreThem) r.w++; else if (summary.scoreUs < summary.scoreThem) r.l++; else r.d++;
  }
  return r;
}

const f = (x: number) => (x / N).toFixed(2);
const p = (x: number) => (100 * x / N).toFixed(0) + '%';
for (const sit of SITUATIONS) {
  console.log(`\n${sit.name} — ${N} матчів на клітинку`);
  console.log('стиль        правило   голи  асист  г+а   3+ г+а  W/D/L        тренер  «пасуть» у рішеннях');
  for (const [label, pol] of STYLES) {
    for (const on of [false, true]) {
      const r = run(sit, pol, on);
      console.log(`${label.padEnd(12)} ${(on ? 'увімк.' : 'вимк.').padEnd(8)}  ${f(r.g)}  ${f(r.a)}   ${f(r.g + r.a)}  ${p(r.hat).padStart(5)}   ${p(r.w)}/${p(r.d)}/${p(r.l)}  ${(r.coach / N).toFixed(2)}   ${(100 * r.marked / r.decisions).toFixed(0)}%`);
    }
  }
}
(BALANCE.conditions as { markedPer: number }).markedPer = MARK;
