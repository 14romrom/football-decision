// Камбеки й розгроми (19.10, плейтест: «якщо Вальмара програє, відігратися майже неможливо» і 7:0 удома
// проти слабких). Рахує на випадковій політиці з випадковими умовами:
//  - відігралися: матчі, де ми поступалися, а закінчили внічию чи перемогою; і дзеркально — у них;
//  - середній модифікатор контексту (без атрибута) і частка чистих — коли ведемо, рівно, поступаємося;
//  - розгроми (різниця 4+) за силою суперника.
//   npx tsx tools/comeback.ts 2000

import { EPISODES, ROSTER, FLAG_RULES, PLAYER, OPPONENTS, rosterFor } from '../src/content';
import { createMatch, nextEpisode, applyChoice, finishMatch, availableOptions } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { computeContext } from '../src/engine/context';
import { generateConditions } from '../src/engine/conditions';
import { makeRng } from '../src/engine/rng';

const N = Number(process.argv[2] ?? 1000);
void ROSTER;
type Bucket = { n: number; mods: number; clean: number };
const by: Record<'ahead' | 'level' | 'behind', Bucket> = { ahead: { n: 0, mods: 0, clean: 0 }, level: { n: 0, mods: 0, clean: 0 }, behind: { n: 0, mods: 0, clean: 0 } };
let trailed = 0, cameBack = 0, wonFromBehind = 0, led = 0, theyCameBack = 0;
const routs: Record<string, { n: number; big: number; goals: number; against: number; w: number; d: number; l: number }> = {};
const lines: Record<string, { n: number; clean: number; m: Record<string, number> }> = {};
const trailedAt: Record<string, { trailed: number; back: number }> = {};

for (let i = 0; i < N; i++) {
  const seed = 31000 + i;
  const rng = makeRng(seed);
  const conditions = generateConditions(rng, OPPONENTS, { confidence: rng.int(-2, 2), fatigue: rng.int(0, 3) });
  const s = createMatch('cb' + i, seed, PLAYER, rng, EPISODES, rosterFor(conditions.opponentKey, rng), conditions, [], FLAG_RULES);
  let wasBehind = false, wasAhead = false, behindFirstMinute = -1;
  const look = () => {
    const d = s.state.scoreUs - s.state.scoreThem;
    if (d < 0 && !wasBehind) { wasBehind = true; behindFirstMinute = s.state.minute; }
    if (d > 0) wasAhead = true;
  };
  for (;;) {
    const next = nextEpisode(s, rng);
    look();
    if (!next) break;
    const ep = next.episode;
    const opts = availableOptions(ep, s.state, s.player);
    if (!opts.length) break;
    const o = opts[rng.int(0, opts.length - 1)];
    const ctx = computeContext(s.state, s.player, o, ep.phase, s.conditions, s.flagRules);
    const situational = ctx.mods.slice(1).reduce((a, m) => a + m.value, 0);
    const d = s.state.scoreUs - s.state.scoreThem;
    const b = by[d > 0 ? 'ahead' : d < 0 ? 'behind' : 'level'];
    const res = resolveOption(s.state, s.player, o, ep.phase, rng, s.conditions, s.flagRules);
    b.n++; b.mods += situational; if (res.tier === 'clean') b.clean++;
    const deficit = d <= -2 ? 'мінус 2+' : d === -1 ? 'мінус 1' : d === 0 ? 'рівно' : d === 1 ? 'плюс 1' : 'плюс 2+';
    const row = (lines[deficit] ??= { n: 0, clean: 0, m: {} as Record<string, number> });
    row.n++; if (res.tier === 'clean') row.clean++;
    for (const m of ctx.mods.slice(1)) row.m[m.label] = (row.m[m.label] ?? 0) + m.value;
    applyChoice(s, ep, o, res, rng);
    look();
    if (s.finished) break;
  }
  finishMatch(s, rng);
  look();
  const d = s.state.scoreUs - s.state.scoreThem;
  if (wasBehind) {
    trailed++; if (d >= 0) cameBack++; if (d > 0) wonFromBehind++;
    const band = behindFirstMinute < 30 ? 'до 30′' : behindFirstMinute < 60 ? '30–60′' : 'після 60′';
    const t = (trailedAt[band] ??= { trailed: 0, back: 0 }); t.trailed++; if (d >= 0) t.back++;
  }
  if (wasAhead) { led++; if (d <= 0) theyCameBack++; }
  const key = `${conditions.strength}/${conditions.venue}`;
  const r = (routs[key] ??= { n: 0, big: 0, goals: 0, against: 0, w: 0, d: 0, l: 0 });
  r.n++; r.goals += s.state.scoreUs; r.against += s.state.scoreThem; if (Math.abs(d) >= 4) r.big++;
  if (d > 0) r.w++; else if (d === 0) r.d++; else r.l++;
}

const pct = (a: number, b: number) => (b ? (100 * a / b).toFixed(1) : '—') + '%';
console.log(`матчів ${N}`);
console.log(`поступалися: ${trailed} — відігралися (нічия/перемога) ${pct(cameBack, trailed)}, перемогли ${pct(wonFromBehind, trailed)}`);
for (const [k, t] of Object.entries(trailedAt)) console.log(`  уперше поступилися ${k}: ${t.trailed}, відігралися ${pct(t.back, t.trailed)}`);
console.log(`вели: ${led} — вони відігралися ${pct(theyCameBack, led)}`);
for (const [k, b] of Object.entries(by)) console.log(`рішення, коли ${k}: ${b.n}, ситуативний мод у середньому ${(b.mods / b.n).toFixed(2)}, чистих ${pct(b.clean, b.n)}`);
for (const [k, r] of Object.entries(routs).sort()) console.log(`${k.padEnd(12)} ${String(r.n).padStart(4)} матчів  W/D/L ${pct(r.w, r.n)}/${pct(r.d, r.n)}/${pct(r.l, r.n)}  голи ${(r.goals / r.n).toFixed(2)}:${(r.against / r.n).toFixed(2)}  різниця 4+ ${pct(r.big, r.n)}`);

for (const k of ['мінус 2+', 'мінус 1', 'рівно', 'плюс 1', 'плюс 2+']) {
  const r = lines[k]; if (!r) continue;
  const top = Object.entries(r.m).map(([l, v]) => [l, v / r.n] as const).filter(([, v]) => Math.abs(v) >= 0.05).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
  console.log(`${k.padEnd(9)} рішень ${r.n}, чистих ${pct(r.clean, r.n)} | ` + top.map(([l, v]) => `${l} ${v > 0 ? '+' : ''}${v.toFixed(2)}`).join(' · '));
}
