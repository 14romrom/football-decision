import { describe, expect, it } from 'vitest';
import { AD_BREAKS } from '../src/content';
import { adBreakFor, adPlan, breakIndex, pauseMinute } from '../src/engine/ads';
import { makeRng } from '../src/engine/rng';

// M48: розклад реклами з макету, погодженого 17.10 (перші вісім матчів — таблиця під «Коли реклама»).

describe('розклад реклами', () => {
  it('пролог і перший матч — без реклами', () => {
    expect(adPlan(1)).toEqual({ pause: false, post: false });
  });

  it('пауза в парних матчах, ролик після — у 3-му, 9-му, 15-му', () => {
    const plan = Array.from({ length: 16 }, (_, i) => adPlan(i + 1));
    expect(plan.flatMap((p, i) => (p.pause ? [i + 1] : []))).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
    expect(plan.flatMap((p, i) => (p.post ? [i + 1] : []))).toEqual([3, 9, 15]);
  });

  it('не більше однієї реклами на матч', () => {
    for (let n = 1; n <= 40; n++) {
      const p = adPlan(n);
      expect(p.pause && p.post, `матч ${n}`).toBe(false);
    }
  });

  it('хвилина паузи — кінець першого тайму або другий тайм, і та сама для того самого сиду', () => {
    for (let seed = 1; seed < 300; seed++) {
      const m = pauseMinute(makeRng(seed));
      expect((m >= 36 && m <= 44) || (m >= 55 && m <= 80), `${seed} → ${m}`).toBe(true);
      expect(pauseMinute(makeRng(seed))).toBe(m);
    }
  });

  it('за сезон сюжети пауз не повторюються: перший — другої ліги, другий — свої, вищої', () => {
    const s1 = [2, 4, 6, 8, 10].map((n) => adBreakFor(AD_BREAKS, n, 'second', 'rain').id);
    expect(new Set(s1).size).toBe(5);
    for (const start of [11, 12]) {   // другий сезон після 10 або 11 матчів (стикові)
      const s2 = Array.from({ length: 10 }, (_, i) => start + i).filter((n) => adPlan(n).pause).map((n) => adBreakFor(AD_BREAKS, n, 'top', 'rain').id);
      expect(new Set(s2).size, `з ${start}`).toBe(s2.length);
      for (const id of s2) expect(s1).not.toContain(id);
    }
    expect(breakIndex(14, 6)).toBe(breakIndex(2, 6));
  });
  it('погода в «воді» — з умов матчу', () => {
    expect(adBreakFor(AD_BREAKS, 2, 'second', 'heat').setup).toContain('Спека тут');
    expect(adBreakFor(AD_BREAKS, 2, 'second', 'rain').setup).toContain('дощ');
    expect(adBreakFor(AD_BREAKS, 2, 'second', 'rain').setup).not.toContain('{weather}');
  });

  it('у кожного сюжету є сетап, три голоси й чесний підпис про рекламу', () => {
    for (const b of AD_BREAKS) {
      expect(b.setup.length, b.id).toBeGreaterThan(40);
      expect(b.voices).toHaveLength(3);
      expect(b.note, b.id).toMatch(/реклам/);
    }
  });
});
