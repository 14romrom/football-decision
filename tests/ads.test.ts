import { describe, expect, it } from 'vitest';
import { AD_BREAKS } from '../src/content';
import { adPlan, breakIndex, pauseMinute } from '../src/engine/ads';
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

  it('сюжети пауз ідуть по колу, без повтору шість пауз поспіль', () => {
    const seen = [2, 4, 6, 8, 10, 12].map((n) => breakIndex(n, AD_BREAKS.length));
    expect(new Set(seen).size).toBe(AD_BREAKS.length);
    expect(breakIndex(14, AD_BREAKS.length)).toBe(breakIndex(2, AD_BREAKS.length));
  });

  it('у кожного сюжету є сетап, три голоси й чесний підпис про рекламу', () => {
    for (const b of AD_BREAKS) {
      expect(b.setup.length, b.id).toBeGreaterThan(40);
      expect(b.voices).toHaveLength(3);
      expect(b.note, b.id).toMatch(/реклам/);
    }
  });
});
