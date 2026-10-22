// Скільки сцен у матчі дають пряму результативну дію (22.10, відгук тестера: «переважна більшість подій —
// з можливістю гола чи асиста напряму, за 10 матчів г+а ~20; хочеться більше сцен, де ти береш участь,
// але не безпосередньо голом»). Рахує на випадковій і «розумній» політиці (вибір із найкращим чистим
// ісходом за голом/асистом), скільки сцен у плані мають хоч один варіант із goal/assist у будь-якому
// ярусі, і скільки голів+асистів виходить за матч.
//   npx tsx tools/direct-share.ts 400

import { EPISODES, ROSTER, FLAG_RULES, PLAYER, OPPONENTS, rosterFor } from '../src/content';
import { createMatch, nextEpisode, applyChoice, finishMatch, availableOptions } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { generateConditions } from '../src/engine/conditions';
import { makeRng } from '../src/engine/rng';
import type { Episode, EpisodeOption } from '../src/engine/types';

const N = Number(process.argv[2] ?? 300);
void ROSTER;
const direct = (o: EpisodeOption) => Object.values(o.outcomes).some((x) => x && (x.apply?.goal || x.apply?.assist));
const sceneDirect = (e: Episode) => e.options.some(direct);

for (const policy of ['random', 'greedy'] as const) {
  let scenes = 0, directScenes = 0, ga = 0, goals = 0, assists = 0;
  for (let i = 0; i < N; i++) {
    const seed = 52000 + i;
    const rng = makeRng(seed);
    const conditions = generateConditions(rng, OPPONENTS, { confidence: 0, fatigue: 0 });
    const s = createMatch('ds' + i, seed, PLAYER, rng, EPISODES, rosterFor(conditions.opponentKey, rng), conditions, [], FLAG_RULES);
    for (;;) {
      const next = nextEpisode(s, rng);
      if (!next) break;
      const ep = next.episode;
      const opts = availableOptions(ep, s.state, s.player);
      if (!opts.length) break;
      scenes++; if (sceneDirect(ep)) directScenes++;
      const pick = policy === 'greedy' && opts.some(direct) ? opts.filter(direct)[rng.int(0, opts.filter(direct).length - 1)] : opts[rng.int(0, opts.length - 1)];
      const res = resolveOption(s.state, s.player, pick, ep.phase, rng, s.conditions, s.flagRules);
      applyChoice(s, ep, pick, res, rng);
      if (s.finished) break;
    }
    finishMatch(s, rng);
    goals += s.state.stats.goals; assists += s.state.stats.assists; ga += s.state.stats.goals + s.state.stats.assists;
  }
  console.log(`${policy.padEnd(7)} сцен ${scenes}, з прямим голом/асистом ${(100 * directScenes / scenes).toFixed(1)}% · за матч голів ${(goals / N).toFixed(2)}, асистів ${(assists / N).toFixed(2)}, г+а ${(ga / N).toFixed(2)}`);
}
