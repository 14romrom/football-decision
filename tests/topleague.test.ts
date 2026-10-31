// Склад вищої ліги в другому сезоні (31.10, перевірка логіки світу): лише ми, ті, хто піднявся з нами, і клуби
// вищої ліги. До правки туди в 59–79% сезонів потрапляв клуб другої ліги, що не грав із нами й не підвищувався.
import { describe, it, expect } from 'vitest';
import { createSeason, nextSeasonFrom, promotion, SEASON_ROUNDS, US, type Season } from '../src/engine/season';
import { OPPONENT_KEYS } from '../src/content';
import { makeRng } from '../src/engine/rng';

/** Перший сезон, дограний випадковими рахунками. */
function finished(seed: number): Season {
  const s = createSeason(seed, OPPONENT_KEYS.second);
  const rng = makeRng(seed);
  const played = s.fixtures.map((f) => ({ ...f, homeGoals: rng.int(0, 3), awayGoals: rng.int(0, 3) }));
  return { ...s, played, round: SEASON_ROUNDS };
}

describe('вища ліга другого сезону', () => {
  it('лише ми, ті, хто піднявся з нами, і клуби вищої ліги', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s1 = finished(seed);
      const keep = promotion(s1)!.with;
      const { season } = nextSeasonFrom(s1, {}, seed + 7, OPPONENT_KEYS.second, OPPONENT_KEYS.top);
      const allowed = new Set([US, ...keep, ...OPPONENT_KEYS.top]);
      expect(season.clubs.filter((c) => !allowed.has(c)), `сід ${seed}`).toEqual([]);
      expect(season.clubs, `сід ${seed}`).toHaveLength(6);
    }
  });
});
