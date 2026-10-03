// Профіль кар'єри: два сезони підряд однією політикою, картка росте по ходу (M18.4) — на відміну від
// `sim --verdicts --top`, який бере стартову картку і тому не показує, наскільки вища ліга важча саме
// для виросло́го гравця. Питання користувача 26.09: (1) що буде за чисто обережну / чисто ризиковану /
// змішану гру в першому сезоні, (2) чи помітна різниця ліг з урахуванням росту, (3) повтори справ тижня.
//   npx tsx tools/career-profile.ts 120
import { EPISODES_RAW, FLAG_RULES, OPPONENTS, PLAYER, ROSTER, FLAVOR, ACTIVITIES, OPPONENT_KEYS } from '../src/content';
import { applyChoice, availableOptions, createMatch, finishMatch, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { applyMatchToCareer, consumeStartPenalty, defaultCareer, effectivePlayer, coachGrip, type Career } from '../src/engine/career';
import { createSeason, isSeasonOver, ourFixture, ourRow, recordRound, seasonVerdict, promotion, type OurResult, type Season } from '../src/engine/season';
import { generateConditions } from '../src/engine/conditions';
import { planWeek, applyWeek, weekContext } from '../src/engine/week';
import { makeRng } from '../src/engine/rng';
import { ATTR_MOD } from '../src/engine/balance';
import type { EpisodeOption } from '../src/engine/types';

const N = Number(process.argv[2] ?? 120);
type Policy = 'safe' | 'risky' | 'mixed';
const pick = (policy: Policy, opts: EpisodeOption[], roll: () => number): EpisodeOption => {
  if (policy === 'mixed') return opts[roll() % opts.length];
  const want = policy === 'safe' ? 'controlled' : 'risky';
  return opts.find((o) => o.basePosition === want) ?? opts.find((o) => o.basePosition !== 'controlled') ?? opts[0];
};

type SeasonRow = { position: number; points: number; goals: number; assists: number; coach: number; fan: number; trust: number; verdict: string; grip: number; promo: string };

function runCareer(seed: number, policy: Policy): SeasonRow[] {
  let career: Career = defaultCareer();
  const rows: SeasonRow[] = [];
  let keep: string[] = [];

  for (let num = 1; num <= 2; num++) {
    const keys = num === 1 ? OPPONENT_KEYS.second : [...OPPONENT_KEYS.top, ...OPPONENT_KEYS.second.slice(0, 1)];
    let season: Season = createSeason(seed + num, keys, num, keep);
    let gripMatches = 0;

    while (!isSeasonOver(season)) {
      const rng = makeRng(seed * 31 + num * 977 + season.round);
      const fixture = ourFixture(season) ?? undefined;
      const { career: consumed, penalty } = consumeStartPenalty(career);
      career = consumed;
      const grip = coachGrip(career.coachTrust);
      if (grip.hold || grip.noSetPieces) gripMatches++;
      const conditions = {
        ...generateConditions(rng, OPPONENTS, { confidence: 0, fatigue: 0 }, fixture),
        league: num >= 2 ? ('top' as const) : ('second' as const),
        ...(grip.hold ? { instruction: 'hold' as const } : {}),
        ...(grip.noSetPieces ? { noSetPieces: true } : {}),
      };
      const player = effectivePlayer(PLAYER, career, penalty.attrBonus);
      const session = createMatch(`c-${seed}-${num}-${season.round}`, seed, player, rng, EPISODES_RAW, ROSTER, conditions, [], FLAG_RULES, {
        coachTrust: career.coachTrust, fanHype: career.fanHype, fromBench: penalty.fromBench,
        staminaPenalty: penalty.staminaPenalty, coachTrustPenalty: penalty.coachTrustPenalty,
        flags: penalty.flags, arc: penalty.arc,
      });
      for (;;) {
        const next = nextEpisode(session, rng);
        if (!next) break;
        const opts = availableOptions(next.episode, session.state, session.player);
        if (!opts.length) break;
        const o = pick(policy, opts, () => rng.int(0, 999));
        const res = resolveOption(session.state, session.player, o, next.episode.phase, rng, session.conditions, session.flagRules);
        applyChoice(session, next.episode, o, res, rng, FLAVOR);
        if (session.finished) break;
      }
      const { summary } = finishMatch(session, rng);
      career = applyMatchToCareer(career, session.state, summary, false, conditions.opponentKey);
      const ours: OurResult = { scoreUs: summary.scoreUs, scoreThem: summary.scoreThem, goals: summary.stats.goals, assists: summary.stats.assists, coachRating: summary.coachRating, fanRating: summary.fanRating, scorers: [] };
      season = recordRound(season, ours, Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength])), makeRng(seed + season.round * 7919));

      // Тиждень між матчами: беремо першу пропозицію дня — рівно так, як гравець, що не мудрує.
      if (!isSeasonOver(season)) {
        const ctx = weekContext(season, career, ourRow(season).position);
        if (ctx) {
          const wrng = makeRng(seed * 7 + num * 131 + season.round);
          const days = planWeek(ACTIVITIES, player, ctx, career, wrng);
          // Гравець, що не мудрує: бере першу пропозицію кожного дня.
          const chosen = days.map((d) => d[0]).filter(Boolean);
          career = applyWeek(career, chosen.map((o) => ({ activity: o.activity }))).career;
        }
      }
    }
    const row = ourRow(season);
    const p = season.player;
    const promo = num === 1 ? (promotion(season)?.kind ?? '—') : '—';
    rows.push({
      position: row.position, points: row.points, goals: p.goals, assists: p.assists,
      coach: p.matches ? p.coachSum / p.matches : 0, fan: p.matches ? p.fanSum / p.matches : 0,
      trust: career.coachTrust, verdict: (num === 1 ? seasonVerdict(season, career.coachTrust) : seasonVerdict(season, career.coachTrust)).kind,
      grip: gripMatches, promo,
    });
    keep = [];
  }
  return rows;
}

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const f = (n: number, d = 1) => n.toFixed(d);

console.log(`Профіль кар'єри: ${N} кар'єр на політику, два сезони підряд, картка росте\n`);
console.log('політика   сезон  місце  очки  голи  асисти  тренер  трибуни  довіра  хватка  вердикт (частка)');
for (const policy of ['safe', 'risky', 'mixed'] as Policy[]) {
  const s1: SeasonRow[] = [], s2: SeasonRow[] = [];
  for (let i = 0; i < N; i++) { const [a, b] = runCareer(6000 + i, policy); s1.push(a); s2.push(b); }
  for (const [label, rows] of [['перший', s1], ['другий', s2]] as [string, SeasonRow[]][]) {
    const verdicts: Record<string, number> = {};
    for (const r of rows) verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1;
    const vs = Object.entries(verdicts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((100 * v) / rows.length)}%`).join(', ');
    console.log(
      `${policy.padEnd(9)} ${label.padEnd(6)} ${f(avg(rows.map((r) => r.position)), 1).padStart(5)} ${f(avg(rows.map((r) => r.points)), 1).padStart(5)} ${f(avg(rows.map((r) => r.goals)), 1).padStart(5)} ${f(avg(rows.map((r) => r.assists)), 1).padStart(7)} ${f(avg(rows.map((r) => r.coach)), 2).padStart(7)} ${f(avg(rows.map((r) => r.fan)), 2).padStart(8)} ${f(avg(rows.map((r) => r.trust)), 0).padStart(7)} ${f(avg(rows.map((r) => r.grip)), 1).padStart(7)}  ${vs}`,
    );
  }
  const promos: Record<string, number> = {};
  for (const r of s1) promos[r.promo] = (promos[r.promo] ?? 0) + 1;
  console.log(`${' '.repeat(10)}вихід нагору: ${Object.entries(promos).map(([k, v]) => `${k} ${Math.round((100 * v) / s1.length)}%`).join(', ')}`);
}
console.log(`\nкрок модифікатора картки: ${ATTR_MOD.step}`);
