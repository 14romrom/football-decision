// Час у стрічці матчу (31.10, табло з хвилиною, що біжить): хвилини не йдуть назад, перерва одна і стоїть
// між першим і другим таймом, другий тайм — з 46-ї, фінальний свисток — останній і не раніше останнього рядка.
// До правки рядок «Перерва» ставився на початок проміжку, і за ним ішли рядки з 43–44-ї (60% матчів), а гол
// із контратаки «через хвилину» стояв перед рядком самої сцени (64 на 500 матчів).
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { applyChoice, availableOptions, createMatch, finishMatch, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { generateConditions } from '../src/engine/conditions';
import { EPISODES_RAW, FLAG_RULES, OPPONENTS, PLAYER, rosterFor } from '../src/content';

function play(seed: number, fromBench = false) {
  const rng = makeRng(seed);
  const conditions = generateConditions(rng, OPPONENTS, { confidence: rng.int(-2, 2), fatigue: rng.int(0, 3) });
  const s = createMatch('t', seed, PLAYER, rng, EPISODES_RAW, rosterFor(conditions.opponentKey, rng), conditions, [], FLAG_RULES, fromBench ? { fromBench: true } : {});
  for (;;) {
    const next = nextEpisode(s, rng);
    if (!next) break;
    const options = availableOptions(next.episode, s.state, s.player);
    if (!options.length) break;
    const o = options[rng.int(0, options.length - 1)];
    applyChoice(s, next.episode, o, resolveOption(s.state, s.player, o, next.episode.phase, rng, s.conditions, s.flagRules), rng);
    if (s.finished) break;
  }
  finishMatch(s, rng);
  return s.state.log;
}

describe('час у стрічці матчу', () => {
  for (const fromBench of [false, true]) {
    it(fromBench ? 'з лави' : 'з першої хвилини', () => {
      for (let seed = 1; seed <= 150; seed++) {
        const log = play(9000 + seed, fromBench);
        const at = `сід ${9000 + seed}`;
        for (let i = 1; i < log.length; i++) {
          expect(log[i].minute, `${at}: ${log[i - 1].kind} ${log[i - 1].minute}′ → ${log[i].kind} ${log[i].minute}′`).toBeGreaterThanOrEqual(log[i - 1].minute);
        }
        const halves = log.map((e, i) => (e.kind === 'halftime' ? i : -1)).filter((i) => i >= 0);
        expect(halves, at).toHaveLength(1);
        const h = halves[0];
        expect(log.slice(0, h).every((e) => e.minute <= 45), at).toBe(true);
        expect(log.slice(h + 1).every((e) => e.minute >= 46), at).toBe(true);
        expect(log[log.length - 1].kind, at).toBe('fulltime');
      }
    });
  }
});
