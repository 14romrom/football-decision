// Как часто и как долго игрок сидит на лавке за сезон (жалоба пользователя 26.09: «по 3 матча подряд
// с лавки, не могу выйти в старт»). Считаем долю матчей с лавки, максимальную серию подряд и то,
// с какой доверием игрок в них заходит. Прогон — случайная политика, то есть игрок, который не выжимает
// максимум, но и не портит специально.
//   npx tsx tools/bench-rate.ts 300
import { EPISODES_RAW, FLAG_RULES, OPPONENTS, PLAYER, ROSTER, FLAVOR } from '../src/content';
import { applyChoice, availableOptions, createMatch, finishMatch, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { applyMatchToCareer, consumeStartPenalty, defaultCareer, effectivePlayer, type Career } from '../src/engine/career';
import { createSeason, isSeasonOver, ourFixture, recordRound, type OurResult } from '../src/engine/season';
import { generateConditions } from '../src/engine/conditions';
import { makeRng } from '../src/engine/rng';
import { OPPONENT_KEYS } from '../src/content';

const N = Number(process.argv[2] ?? 300);
const rounds: number[] = [];
const streaks: number[] = [];
const trustAtBench: number[] = [];
let benchMatches = 0, matches = 0, seasonsWithBench = 0;

for (let s = 0; s < N; s++) {
  const seed = 4000 + s;
  let career: Career = defaultCareer();
  let season = createSeason(seed, OPPONENT_KEYS.second);
  let streak = 0, best = 0, inSeason = 0;

  while (!isSeasonOver(season)) {
    const rng = makeRng(seed * 31 + season.round);
    const { career: consumed, penalty } = consumeStartPenalty(career);
    career = consumed;
    const benched = penalty.fromBench;
    if (benched) { benchMatches++; inSeason++; streak++; best = Math.max(best, streak); trustAtBench.push(Math.round(career.coachTrust)); }
    else streak = 0;
    matches++;

    const fixture = ourFixture(season) ?? undefined;
    const conditions = { ...generateConditions(rng, OPPONENTS, { confidence: 0, fatigue: 0 }, fixture), league: 'second' as const };
    const player = effectivePlayer(PLAYER, career, penalty.attrBonus);
    const session = createMatch(`b-${seed}-${season.round}`, seed + season.round, player, rng, EPISODES_RAW, ROSTER, conditions, [], FLAG_RULES, {
      coachTrust: career.coachTrust, fanHype: career.fanHype, fromBench: benched,
      staminaPenalty: penalty.staminaPenalty, coachTrustPenalty: penalty.coachTrustPenalty, flags: penalty.flags,
      arc: penalty.arc,
    });
    for (;;) {
      const next = nextEpisode(session, rng);
      if (!next) break;
      const opts = availableOptions(next.episode, session.state, session.player);
      if (!opts.length) break;
      const o = opts[rng.int(0, opts.length - 1)];
      const res = resolveOption(session.state, session.player, o, next.episode.phase, rng, session.conditions, session.flagRules);
      applyChoice(session, next.episode, o, res, rng, FLAVOR);
      if (session.finished) break;
    }
    const { summary } = finishMatch(session, rng);
    career = applyMatchToCareer(career, session.state, summary, false, conditions.opponentKey);
    const ours: OurResult = { scoreUs: summary.scoreUs, scoreThem: summary.scoreThem, goals: summary.stats.goals, assists: summary.stats.assists, coachRating: summary.coachRating, fanRating: summary.fanRating, scorers: [] };
    season = recordRound(season, ours, Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength])), makeRng(seed + season.round * 7919));
  }
  rounds.push(inSeason);
  streaks.push(best);
  if (inSeason > 0) seasonsWithBench++;
}

const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
const share = (n: number) => ((100 * n) / matches).toFixed(1) + '%';
console.log(`Лава: ${N} сезонів, випадкова політика, друга ліга\n`);
console.log(`матчів з лави:        ${benchMatches} із ${matches} (${share(benchMatches)})`);
console.log(`за сезон:             ${avg(rounds)} (макс ${Math.max(...rounds)})`);
console.log(`найдовша серія:       ${avg(streaks)} (макс ${Math.max(...streaks)})`);
console.log(`сезонів із лавою:     ${seasonsWithBench} із ${N} (${((100 * seasonsWithBench) / N).toFixed(0)}%)`);
console.log(`довіра на вході:      ${trustAtBench.length ? avg(trustAtBench) : '—'}`);
const hist: Record<number, number> = {};
for (const r of streaks) hist[r] = (hist[r] ?? 0) + 1;
console.log(`\nсерії поспіль: ${Object.entries(hist).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
