// Реплики титула (content/title.json, engine/title.ts): у каждой ситуации есть строки, безусловный
// пул не пуст, тон — наблюдение без «!», чисел в скобке проверки нет.
import { describe, it, expect } from 'vitest';
import titleJson from '../src/content/title.json';
import { makeRng } from '../src/engine/rng';
import { pickTitleLine, titleContext, titlePool, type TitleRule, type TitleContext } from '../src/engine/title';

const RULES = titleJson as TitleRule[];
const VOICES = ['ego', 'team', 'composure', 'vision', 'instinct', 'body'];

describe('реплики титула', () => {
  it('формат правил: голос из шести, строки без «!», проверка без цифр и процентов', () => {
    for (const r of RULES) {
      expect(VOICES).toContain(r.voice);
      expect(r.lines.length).toBeGreaterThan(0);
      for (const l of r.lines) expect(l, l).not.toMatch(/!/);
      if (r.check) expect(r.check).not.toMatch(/\d|%/);
    }
  });

  it('у каждой ситуации есть что сказать, безусловных ≥ 5', () => {
    const base: TitleContext = { career: 'any', trust: 'ok', idle: false, over: false };
    expect(titlePool(RULES, { ...base, career: 'none' }).length).toBeGreaterThanOrEqual(3);
    expect(RULES.filter((r) => Object.keys(r.when).length === 0).length).toBeGreaterThanOrEqual(5);
    for (const last of ['W', 'D', 'L'] as const) expect(titlePool(RULES, { ...base, last }).some((l) => l.weight > 1)).toBe(true);
    expect(titlePool(RULES, { ...base, trust: 'low' }).some((l) => l.weight > 1)).toBe(true);
    expect(titlePool(RULES, { ...base, idle: true }).some((l) => l.weight > 1)).toBe(true);
    expect(titlePool(RULES, { ...base, over: true }).some((l) => l.weight > 1)).toBe(true);
  });

  it('контекст: без матчей — «none» и без результата; давно не заходил — по времени последнего матча', () => {
    const day = 24 * 3600 * 1000;
    expect(titleContext({ matches: 0, last: 'W', coachTrust: 55, lastAt: null, over: false })).toMatchObject({ career: 'none', last: undefined, idle: false });
    expect(titleContext({ matches: 3, last: 'L', coachTrust: 30, lastAt: Date.now() - 5 * day, over: false })).toMatchObject({ career: 'any', last: 'L', trust: 'low', idle: true });
    expect(titleContext({ matches: 3, last: 'W', coachTrust: 60, lastAt: Date.now() - day, over: false }).idle).toBe(false);
  });

  it('виденные строки уступают свежим: за 12 запусков без карьеры повторов нет, пока есть свежие', () => {
    const ctx = titleContext({ matches: 0, coachTrust: 55, lastAt: null, over: false });
    const pool = titlePool(RULES, ctx).length;
    const seen = new Set<string>();
    const rng = makeRng(42);
    for (let i = 0; i < pool; i++) {
      const l = pickTitleLine(RULES, ctx, seen, rng)!;
      expect(seen.has(l.text)).toBe(false);
      seen.add(l.text);
    }
  });
});
