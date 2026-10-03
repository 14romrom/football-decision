// Повторы сцен за карьеру: сколько раз игрок видит одну и ту же сцену за два сезона и как это
// расходится по фазам. Мерило для M43a — квоты обороны и правила «невиденное первым».
//   npx tsx tools/repeat-rate.ts 200
//
// Считаем ровно то, на что жаловался тестер: «вынос с линии ворот встречался раза 3 за карьеру».
// Поэтому в выводе — не средняя температура, а доля карьер, где какая-то сцена пришла 3+ раз.

import { makeRng } from '../src/engine/rng';
import { applyChoice, availableOptions, createMatch, finishMatch, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { EPISODES_RAW, OPPONENTS, PLAYER, rosterFor } from '../src/content';
import { generateConditions } from '../src/engine/conditions';
import { BALANCE } from '../src/engine/balance';
import type { Episode } from '../src/engine/types';

const N = Number(process.argv[2] ?? 200);
// `--old` повертає правила, що були до M43a: оборона 3 за матч і добір у вільні слоти, пам'ять лише
// горизонтом. Потрібно, щоб порівняння «до/після» було на тих самих сидах, а не на спогадах.
const OLD = process.argv.includes('--old');
if (OLD) (BALANCE.match as { minDefense: number }).minDefense = 3;
const MATCHES = 20;
const phaseOf = new Map(EPISODES_RAW.map((e: Episode) => [e.id, e.phase]));

function career(seed: number) {
  const seen: string[] = [];
  const memory: string[] = [];
  for (let m = 0; m < MATCHES; m++) {
    const rng = makeRng(seed * 101 + m);
    const league = m >= 10 ? 'top' as const : 'second' as const;
    const conditions = { ...generateConditions(rng, OPPONENTS, { confidence: 0, fatigue: 0 }), league };
    const session = createMatch(`r-${seed}-${m}`, seed + m, PLAYER, rng, EPISODES_RAW,
      rosterFor(conditions.opponentKey, rng), conditions,
      // Пам'ять горизонту — як у грі: останні matches матчів.
      memory.slice(-BALANCE.match.memory.horizon * 9), [],
      { seenEpisodes: OLD ? [] : [...seen] });
    for (;;) {
      const next = nextEpisode(session, rng);
      if (!next) break;
      const options = availableOptions(next.episode, session.state, session.player);
      const option = options[rng.int(0, options.length - 1)];
      const res = resolveOption(session.state, session.player, option, next.episode.phase, rng);
      applyChoice(session, next.episode, option, res, rng);
    }
    finishMatch(session, rng);
    seen.push(...session.usedEpisodeIds);
    memory.push(...session.usedEpisodeIds);
  }
  return seen;
}

const counts: number[] = [];
const threePlus: number[] = [];
const byPhase: Record<string, number> = { attack: 0, defense: 0, transition: 0, setpiece: 0 };
const worst = new Map<string, number>();   // скільки кар'єр бачили цю сцену 3+ рази
let decisions = 0;
let distinct = 0;
for (let i = 0; i < N; i++) {
  const seen = career(7000 + i);
  decisions += seen.length;
  const times = new Map<string, number>();
  for (const id of seen) {
    times.set(id, (times.get(id) ?? 0) + 1);
    const ph = phaseOf.get(id);
    if (ph) byPhase[ph] += 1;
  }
  distinct += times.size;
  counts.push(seen.length - times.size);
  threePlus.push([...times.values()].filter((v) => v >= 3).length);
  for (const [id, v] of times) if (v >= 3) worst.set(id, (worst.get(id) ?? 0) + 1);
}
const avg = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1);
console.log(`\n${N} кар'єр по ${MATCHES} матчів\n`);
console.log(`рішень за кар'єру: ${(decisions / N).toFixed(1)}, різних сцен: ${(distinct / N).toFixed(1)}`);
console.log(`повторних зустрічей: ${avg(counts)}`);
console.log(`сцен, що прийшли 3+ рази: ${avg(threePlus)} (кар'єр без таких: ${Math.round(100 * threePlus.filter((x) => x === 0).length / N)}%)`);
const kind = (id: string) => {
  const e = EPISODES_RAW.find((x: Episode) => x.id === id);
  return e?.followUpOnly ? 'ланцюжок' : (e?.requires?.flags?.length ?? 0) > 0 ? 'реактивний' : e?.afterWhistle ? 'після свистка' : 'плановий';
};
console.log('\nхто приходить 3+ рази (частка кар’єр):');
for (const [id, n] of [...worst.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${id.padEnd(26)} ${String(Math.round((100 * n) / N)).padStart(3)}%  ${kind(id)}`);
}
console.log('\nрішень за фазою на матч:');
for (const k of Object.keys(byPhase)) console.log(`  ${k.padEnd(11)} ${(byPhase[k] / N / MATCHES).toFixed(2)}`);
