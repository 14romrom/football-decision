// Работает ли вес по силе соперника (M23.3, `Episode.weightBy.strength`): перегрузка фланга должна
// чаще попадать в план против низкого блока (слабые — 4-4-2), а выход из-под прессинга — против сильных.
// Мерит доли этих групп в планах матчей при прочих равных условиях.
//   npx tsx tools/strength-mix.ts 400

import { EPISODES, ROSTER, FLAG_RULES, PLAYER } from '../src/content';
import { createMatch } from '../src/engine/match';
import { neutralConditions, type Strength } from '../src/engine/conditions';
import { makeRng } from '../src/engine/rng';

const N = Number(process.argv[2] ?? 400);
const groups = {
  фланг: EPISODES.filter((e) => e.weightBy?.strength?.weak && e.weightBy.strength.weak > 1).map((e) => e.id),
  білдап: EPISODES.filter((e) => e.weightBy?.strength?.strong && e.weightBy.strength.strong > 1).map((e) => e.id),
};

console.log(`Вес по силе соперника: ${N} матчей на силу, нейтральные условия, пул ${EPISODES.length}`);
console.log(`  фланг: ${groups.фланг.join(', ')}`);
console.log(`  білдап: ${groups.білдап.join(', ')}\n`);
console.log('сила     фланг   білдап');

for (const strength of ['weak', 'even', 'strong'] as Strength[]) {
  const hit = { фланг: 0, білдап: 0 };
  let slots = 0;
  for (let i = 0; i < N; i++) {
    const seed = 5000 + i;
    const session = createMatch('m' + i, seed, PLAYER, makeRng(seed), EPISODES, ROSTER,
      { ...neutralConditions(), strength }, [], FLAG_RULES);
    for (const id of session.plan) {
      slots++;
      for (const [name, ids] of Object.entries(groups)) if (ids.includes(id)) hit[name as keyof typeof hit]++;
    }
  }
  const pc = (n: number) => ((100 * n) / slots).toFixed(1) + '%';
  console.log(`${strength.padEnd(8)} ${pc(hit.фланг).padStart(5)}   ${pc(hit.білдап).padStart(5)}`);
}
