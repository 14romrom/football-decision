// Как часто в матче срабатывает цепочка (`apply.followUp`) и во что она ведёт.
// Лог реальной карьеры (26.09, 179 решений за 20 матчей) показал `fin_shot` один раз и `fin_penalty` один
// раз — подпись игры почти не играет. Здесь считаем, сколько раз цепочка срабатывает у случайной политики
// и сколько раз она не срабатывает из-за лимита, уже сыгранного звена или того, что игрок просто не выбрал
// вариант с цепочкой.
//   npx tsx tools/chain-rate.ts 500

import { EPISODES, ROSTER, FLAG_RULES, PLAYER } from '../src/content';
import { createMatch, nextEpisode, applyChoice, finishMatch, availableOptions } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { makeRng } from '../src/engine/rng';

const N = Number(process.argv[2] ?? 500);
const chainOptions = new Set<string>();
for (const e of EPISODES) for (const o of e.options) {
  for (const v of Object.values(o.outcomes)) if (v?.apply?.followUp) chainOptions.add(e.id + '/' + o.id);
}

let matches = 0, fired = 0, links = 0, shown = 0, chosen = 0;
const target: Record<string, number> = {};
const matchesWithChain = new Set<number>();
const tierOfChosen: Record<string, number> = {};
const lost = { ярусБезЦепочки: 0, лимит: 0, звеноВжеГрало: 0 };

for (let i = 0; i < N; i++) {
  const seed = 9000 + i;
  const rng = makeRng(seed);
  const s = createMatch('m' + i, seed, PLAYER, rng, EPISODES, ROSTER, undefined, [], FLAG_RULES);
  matches++;
  for (;;) {
    const next = nextEpisode(s, rng);
    if (!next) break;
    const ep = next.episode;
    const opts = availableOptions(ep, s.state, s.player);
    if (!opts.length) break;
    for (const o of opts) if (chainOptions.has(ep.id + '/' + o.id)) shown++;
    const o = opts[rng.int(0, opts.length - 1)];
    if (chainOptions.has(ep.id + '/' + o.id)) chosen++;
    const before = s.pendingFollowUp;
    const res = resolveOption(s.state, s.player, o, ep.phase, rng, s.conditions, s.flagRules);
    const isChain = chainOptions.has(ep.id + '/' + o.id);
    const wanted = isChain ? !!o.outcomes[res.tier]?.apply?.followUp : false;
    const limitHit = s.chainLinks >= 2 || (s.chainLinks === 0 && s.chainsUsed >= 2);
    applyChoice(s, ep, o, res, rng);
    if (isChain) {
      tierOfChosen[res.tier] = (tierOfChosen[res.tier] ?? 0) + 1;
      if (!wanted) lost.ярусБезЦепочки++;
      else if (!s.pendingFollowUp && limitHit) lost.лимит++;
      else if (!s.pendingFollowUp) lost.звеноВжеГрало++;
    }
    if (!before && s.pendingFollowUp) {
      fired++; links++;
      target[s.pendingFollowUp] = (target[s.pendingFollowUp] ?? 0) + 1;
      matchesWithChain.add(i);
    }
    if (s.finished) break;
  }
  finishMatch(s, rng);
}

const pc = (n: number, d: number) => ((100 * n) / d).toFixed(1) + '%';
console.log(`Цепочки: ${matches} матчей, случайная политика, пул ${EPISODES.length}\n`);
console.log(`вариантов с цепочкой в пуле: ${chainOptions.size}`);
console.log(`показано таких вариантов:    ${shown} (${(shown / matches).toFixed(1)} на матч)`);
console.log(`выбрано игроком:             ${chosen} (${pc(chosen, shown)} от показанных)`);
console.log(`цепочка сработала:           ${fired} (${(fired / matches).toFixed(2)} на матч, ${pc(chosen ? fired : 0, chosen || 1)} от выбранных)`);
console.log(`матчей хотя бы с одной:      ${matchesWithChain.size} (${pc(matchesWithChain.size, matches)})`);
console.log('\nчто выпало на выбранных вариантах с цепочкой:');
for (const [k, v] of Object.entries(tierOfChosen).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(10)} ${v} (${pc(v, chosen)})`);
console.log('\nпочему не сработала:');
for (const [k, v] of Object.entries(lost)) console.log(`  ${k.padEnd(18)} ${v} (${pc(v, chosen)})`);
console.log('\nкуда вела:');
for (const [k, v] of Object.entries(target).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${v} (${(v / matches).toFixed(2)} на матч)`);
