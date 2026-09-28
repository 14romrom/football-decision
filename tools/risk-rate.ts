// Замір форми ризику (28.09, питання «за два матчі — пʼять катастроф»): скільки рішень стають
// «відчайдушними» через контекст і скільки це дає катастроф. Політики дві: випадкова (як тестер тикає)
// і смілива (--bold: завжди найризикованіший варіант).
//   npx tsx tools/risk-rate.ts 600 [--bold] [--trust=28]
import { EPISODES_RAW, FLAG_RULES, OPPONENTS, PLAYER, rosterFor } from '../src/content';
import { createMatch, applyChoice, availableOptions, nextEpisode } from '../src/engine/match';
import { computeContext } from '../src/engine/context';
import { resolveOption } from '../src/engine/resolve';
import { generateConditions } from '../src/engine/conditions';
import { makeRng } from '../src/engine/rng';
import { BALANCE } from '../src/engine/balance';

const N = Number(process.argv[2] ?? 600);
const trustArg = process.argv.find((a) => a.startsWith('--trust='));
const startTrust = trustArg ? Number(trustArg.split('=')[1]) : undefined;
// --bonus=N: усі атрибути вище — так видно, чи викуповує майстерність полосу зриву.
const bonus = Number((process.argv.find((a) => a.startsWith('--bonus=')) ?? '--bonus=0').split('=')[1]);

type Row = { base: string; eff: string; tier: string; trust: number; stamina: number; losing: boolean; match: number };
const rows: Row[] = [];
let bought = 0;
const perMatch: number[] = [];

for (let k = 0; k < N; k++) {
  const seed = 4000 + k;
  const rng = makeRng(seed);
  const conditions = generateConditions(rng, OPPONENTS, { confidence: rng.int(-2, 2), fatigue: k % 4 });
  const player = bonus ? { ...PLAYER, attrs: Object.fromEntries(Object.entries(PLAYER.attrs).map(([a, v]) => [a, v + bonus * 2])) } as typeof PLAYER : PLAYER;
  const session = createMatch(`s-${seed}`, seed, player, rng, EPISODES_RAW, rosterFor(conditions.opponentKey, rng), conditions, {}, FLAG_RULES,
    startTrust === undefined ? {} : { coachTrust: startTrust });
  for (;;) {
    const next = nextEpisode(session, rng);
    if (!next) break;
    const options = availableOptions(next.episode, session.state, session.player);
    const ORDER = { controlled: 0, risky: 1, desperate: 2 } as const;
    const bold = process.argv.includes('--bold');
    const option = bold
      ? [...options].sort((a, b) => ORDER[b.basePosition] - ORDER[a.basePosition] || b.goals.personal - a.goals.personal)[0]
      : options[rng.int(0, options.length - 1)];
    const ctx = computeContext(session.state, session.player, option, next.episode.phase, session.conditions, FLAG_RULES);
    if (ctx.attrMod >= 4) bought++;
    const res = resolveOption(session.state, session.player, option, next.episode.phase, rng, session.conditions, FLAG_RULES);
    rows.push({
      base: option.basePosition, eff: ctx.position, tier: res.tier,
      trust: Math.round(session.state.coachTrust), stamina: Math.round(session.state.stamina),
      losing: session.state.scoreUs < session.state.scoreThem, match: k,
    });
    applyChoice(session, next.episode, option, res, rng);
  }
  perMatch.push(rows.filter((r) => r.match === k && r.tier === 'badFail').length);
}

const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) : '0.0') + '%';
const bad = rows.filter((r) => r.tier === 'badFail');
console.log(`рішень ${rows.length}, катастроф ${bad.length} (${pct(bad.length, rows.length)})`);
console.log(`викуп полоси (мод +4 і вище): ${pct(bought, rows.length)}`);
console.log(`довіра на старті: ${startTrust ?? 'як у грі'} · поріг зсуву ${BALANCE.shift.lowTrustBelow}, хватка ${BALANCE.grip.holdTrust}`);

for (const p of ['controlled', 'risky', 'desperate']) {
  const all = rows.filter((r) => r.eff === p);
  const b = all.filter((r) => r.tier === 'badFail');
  console.log(`  ефективна ${p.padEnd(11)} ${String(all.length).padStart(5)} рішень, катастроф ${pct(b.length, all.length)}`);
}

const shifted = rows.filter((r) => r.base !== r.eff);
console.log(`\nзсунуто на крок: ${shifted.length} (${pct(shifted.length, rows.length)}), з них катастроф ${pct(shifted.filter((r) => r.tier === 'badFail').length, shifted.length)}`);
const lowTrust = shifted.filter((r) => r.trust < BALANCE.shift.lowTrustBelow);
const tired = shifted.filter((r) => r.stamina < BALANCE.shift.exhaustedBelow);
console.log(`  причина «низька довіра»: ${pct(lowTrust.length, shifted.length)} · «немає сил»: ${pct(tired.length, shifted.length)} · решта — програємо під кінець`);
const badInTrust = rows.filter((r) => r.trust < BALANCE.shift.lowTrustBelow);
console.log(`\nрішення при довірі нижче порога: ${badInTrust.length} (${pct(badInTrust.length, rows.length)}), катастроф серед них ${pct(badInTrust.filter((r) => r.tier === 'badFail').length, badInTrust.length)}`);

// Скільки катастроф за матч і за пару матчів — щоб «5 за два матчі» мало число, а не відчуття.
const pairs: number[] = [];
for (let i = 0; i + 1 < perMatch.length; i += 2) pairs.push(perMatch[i] + perMatch[i + 1]);
const share = (arr: number[], min: number) => ((arr.filter((n) => n >= min).length / arr.length) * 100).toFixed(1) + '%';
console.log(`
катастроф за матч: середнє ${(perMatch.reduce((a, b) => a + b, 0) / perMatch.length).toFixed(2)}, максимум ${Math.max(...perMatch)}`);
console.log(`  матчів із 3+ катастрофами: ${share(perMatch, 3)} · з 4+: ${share(perMatch, 4)}`);
console.log(`  пар матчів із 5+ катастрофами: ${share(pairs, 5)} · з 6+: ${share(pairs, 6)}`);
