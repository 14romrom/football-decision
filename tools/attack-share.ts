// Какую долю решений матча занимает атака. Лог карьеры (26.09): 57 решений из 179 в атакующих семьях —
// треть у атакующего полузащитника, при том что в пуле таких эпизодов половина. Значит дело в планировщике
// (квота обороны, веса), а не в пуле, и мерить надо планы, а не содержимое episodes.json.
//   npx tsx tools/attack-share.ts 400

import { EPISODES, ROSTER, FLAG_RULES, PLAYER } from '../src/content';
import { createMatch } from '../src/engine/match';
import { neutralConditions } from '../src/engine/conditions';
import { makeRng } from '../src/engine/rng';

const ATTACK = ['edge_shot', 'one_on_one', 'finishing', 'through', 'wing', 'corner_attack', 'counter', 'penalty', 'free_kick'];
const N = Number(process.argv[2] ?? 400);
const family = new Map(EPISODES.map((e) => [e.id, e.family ?? '?']));
const phase = new Map(EPISODES.map((e) => [e.id, e.phase]));

let slots = 0;
const byFamily: Record<string, number> = {};
const byPhase: Record<string, number> = {};

for (let i = 0; i < N; i++) {
  const seed = 3000 + i;
  const s = createMatch('m' + i, seed, PLAYER, makeRng(seed), EPISODES, ROSTER, neutralConditions(), [], FLAG_RULES);
  for (const id of s.plan) {
    slots++;
    const f = family.get(id) ?? '?';
    byFamily[f] = (byFamily[f] ?? 0) + 1;
    const p = phase.get(id) ?? '?';
    byPhase[p] = (byPhase[p] ?? 0) + 1;
  }
}

const pc = (n: number) => ((100 * n) / slots).toFixed(1) + '%';
const attack = ATTACK.reduce((sum, f) => sum + (byFamily[f] ?? 0), 0);
console.log(`Доля атаки в плане матча: ${N} матчей, пул ${EPISODES.length}\n`);
console.log(`атакующие семьи: ${pc(attack)} (${(attack / N).toFixed(1)} решений из ${(slots / N).toFixed(1)})`);
console.log(`по фазе:         ${Object.entries(byPhase).map(([k, v]) => `${k} ${pc(v)}`).join(', ')}`);
console.log('\nсемьи:');
for (const [f, v] of Object.entries(byFamily).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${f.padEnd(16)} ${pc(v).padStart(6)}${ATTACK.includes(f) ? '  ←' : ''}`);
}
