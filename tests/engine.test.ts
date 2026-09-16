import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { attrMod, computeContext } from '../src/engine/context';
import { resolveOption, tierForScore } from '../src/engine/resolve';
import { DIE_FLOOR, THRESHOLDS } from '../src/engine/balance';
import type { Rng } from '../src/engine/rng';
import type { EpisodeOption, MatchState, Player } from '../src/engine/types';

const player: Player = {
  name: 'Тест',
  position: 'AM',
  // 45 — нулевой модификатор атрибута: контекстные тесты смотрят только на контекст
  attrs: { finishing: 45, passing: 45, dribbling: 45, first_touch: 45, pace: 45, strength: 45, stamina: 45, composure: 45, vision: 45, positioning: 45 },
};

function state(over: Partial<MatchState> = {}): MatchState {
  return {
    minute: 20, scoreUs: 0, scoreThem: 0,
    stamina: 55, composureNow: 60, coachTrust: 55, fanHype: 45, momentum: 0,
    stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 },
    flags: [], log: [],
    ...over,
  };
}

function option(over: Partial<EpisodeOption> = {}): EpisodeOption {
  return {
    id: 'o', label: 'o', past: 'o',
    attribute: 'passing', basePosition: 'risky', effect: 'standard',
    staminaCost: 5, goals: { team: 1, personal: 1 },
    outcomes: {
      clean: { text: '', recap: '' }, cost: { text: '', recap: '' },
      fail: { text: '', recap: '' }, badFail: { text: '', recap: '' },
    },
    ...over,
  };
}

describe('attrMod', () => {
  it('стартовый коридор 45..65 даёт 0..+5, шаг на каждые 4 пункта, минуса нет', () => {
    expect(attrMod(45)).toBe(0);
    expect(attrMod(48)).toBe(0);
    expect(attrMod(49)).toBe(1);
    expect(attrMod(53)).toBe(2);
    expect(attrMod(62)).toBe(4);
    expect(attrMod(65)).toBe(5);
    expect(attrMod(30)).toBe(0);
  });
  it('сверху зажат ATTR_MOD.max', () => {
    expect(attrMod(99)).toBe(12);
  });
});

describe('пороги исходов', () => {
  // Конкретные числа подобраны балансным прогоном (п. 11 ТЗ) и живут в balance.ts;
  // тест сторожит не их значения, а то, что границы читаются ровно по таблице.
  it('границы читаются по таблице balance.ts, без смещений на единицу', () => {
    for (const pos of ['controlled', 'risky', 'desperate'] as const) {
      const t = THRESHOLDS[pos];
      expect(tierForScore(pos, t.badFail)).toBe('badFail');
      expect(tierForScore(pos, t.badFail + 1)).toBe('fail');
      expect(tierForScore(pos, t.fail)).toBe('fail');
      expect(tierForScore(pos, t.fail + 1)).toBe('cost');
      expect(tierForScore(pos, t.cost)).toBe('cost');
      expect(tierForScore(pos, t.cost + 1)).toBe('clean');
    }
  });

  it('чем рискованнее форма, тем труднее чистый успех и шире полоса неудач', () => {
    expect(THRESHOLDS.controlled.cost).toBeLessThan(THRESHOLDS.risky.cost);
    expect(THRESHOLDS.risky.cost).toBeLessThan(THRESHOLDS.desperate.cost);
    expect(THRESHOLDS.controlled.fail).toBeLessThan(THRESHOLDS.risky.fail);
    expect(THRESHOLDS.risky.fail).toBeLessThan(THRESHOLDS.desperate.fail);
    expect(THRESHOLDS.controlled.badFail).toBeLessThanOrEqual(THRESHOLDS.desperate.badFail);
  });

  it('каждая форма риска даёт все четыре уровня — бинарных исходов нет', () => {
    for (const pos of ['controlled', 'risky', 'desperate'] as const) {
      const tiers = new Set<string>();
      for (let s = -10; s <= 35; s++) tiers.add(tierForScore(pos, s));
      expect(tiers).toEqual(new Set(['badFail', 'fail', 'cost', 'clean']));
      const t = THRESHOLDS[pos];
      expect(t.badFail).toBeLessThan(t.fail);
      expect(t.fail).toBeLessThan(t.cost);
    }
  });
});

describe('контекстные модификаторы', () => {
  it('свежесть даёт +1; усталость −2 и севшие ноги −4 — для дорогого варианта', () => {
    const expensive = option({ staminaCost: 12 });
    expect(computeContext(state({ stamina: 80 }), player, expensive, 'attack').flat).toBe(1);
    expect(computeContext(state({ stamina: 55 }), player, expensive, 'attack').flat).toBe(0);
    expect(computeContext(state({ stamina: 30 }), player, expensive, 'attack').flat).toBe(-2);
    expect(computeContext(state({ stamina: 10 }), player, expensive, 'attack').flat).toBe(-4);
  });

  it('истощение бьёт по цене варианта: дешёвое решение на нулевых силах почти не страдает', () => {
    expect(computeContext(state({ stamina: 5 }), player, option({ staminaCost: 12 }), 'attack').flat).toBe(-4);
    expect(computeContext(state({ stamina: 5 }), player, option({ staminaCost: 6 }), 'attack').flat).toBe(-2);
    expect(computeContext(state({ stamina: 5 }), player, option({ staminaCost: 2 }), 'attack').flat).toBe(-1);
    expect(computeContext(state({ stamina: 30 }), player, option({ staminaCost: 3 }), 'attack').flat).toBe(-1);
  });

  it('кураж входит в score до +3, провалы давят не ниже −2', () => {
    expect(computeContext(state({ momentum: 3 }), player, option(), 'attack').flat).toBe(3);
    expect(computeContext(state({ momentum: -2 }), player, option(), 'attack').flat).toBe(-2);
    expect(computeContext(state({ momentum: -3 }), player, option(), 'attack').flat).toBe(-2);
  });

  it('хладнокровие работает только после 80-й минуты', () => {
    expect(computeContext(state({ minute: 70, composureNow: 90 }), player, option(), 'attack').flat).toBe(0);
    expect(computeContext(state({ minute: 85, composureNow: 90 }), player, option(), 'attack').flat).toBe(2);
    expect(computeContext(state({ minute: 85, composureNow: 10 }), player, option(), 'attack').flat).toBe(-2);
  });

  it('жёлтая мешает только в защитных действиях', () => {
    const booked = state({ flags: ['booked'] });
    expect(computeContext(booked, player, option({ attribute: 'positioning' }), 'attack').flat).toBe(-2);
    expect(computeContext(booked, player, option({ attribute: 'passing' }), 'defense').flat).toBe(-2);
    expect(computeContext(booked, player, option({ attribute: 'passing' }), 'attack').flat).toBe(0);
  });

  it('модификаторы показываются строками — игроку есть что прочитать после броска', () => {
    const ctx = computeContext(state({ stamina: 85, momentum: 2 }), player, option(), 'attack');
    expect(ctx.mods.map((m) => m.label)).toEqual(['пас (45)', 'свіжість', 'кураж']);
  });
});

describe('сдвиги формы риска', () => {
  it('севшие ноги делают дорогую опцию отчаянной', () => {
    const ctx = computeContext(state({ stamina: 20 }), player, option({ staminaCost: 10 }), 'attack');
    expect(ctx.position).toBe('desperate');
  });

  it('дешёвая опция при севших ногах форму не меняет', () => {
    const ctx = computeContext(state({ stamina: 20 }), player, option({ staminaCost: 4 }), 'attack');
    expect(ctx.position).toBe('risky');
  });

  it('нервы в концовке при отставании: риск выше, но и масштаб выше', () => {
    const s = state({ minute: 86, scoreUs: 0, scoreThem: 1 });
    const ctx = computeContext(s, player, option({ goals: { team: 1, personal: 3 }, effect: 'standard' }), 'attack');
    expect(ctx.position).toBe('desperate');
    expect(ctx.effect).toBe('great');
  });

  it('низкое доверие тренера не трогает надёжные опции', () => {
    const s = state({ coachTrust: 20 });
    expect(computeContext(s, player, option({ basePosition: 'controlled' }), 'attack').position).toBe('controlled');
    expect(computeContext(s, player, option({ basePosition: 'risky' }), 'attack').position).toBe('desperate');
  });

  it('несколько условий сразу сдвигают позицию не больше чем на шаг', () => {
    const s = state({ stamina: 10, coachTrust: 10, minute: 86, scoreUs: 0, scoreThem: 2 });
    const ctx = computeContext(s, player, option({ basePosition: 'controlled', staminaCost: 12, goals: { team: 1, personal: 3 } }), 'attack');
    expect(ctx.position).toBe('risky');
  });
});

describe('rng', () => {
  it('воспроизводится по сиду', () => {
    const a = makeRng(42); const b = makeRng(42);
    expect([a.roll(), a.roll(), a.roll()]).toEqual([b.roll(), b.roll(), b.roll()]);
  });

  it('2d10 не выходит за 2..20, покрывает края и держит колокол', () => {
    const rng = makeRng(42);
    const seen = new Set<number>();
    let mid = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = rng.roll();
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(20);
      seen.add(v);
      if (v >= 8 && v <= 14) mid++;
    }
    expect(seen.has(2)).toBe(true);
    expect(seen.has(20)).toBe(true);
    expect(mid / n).toBeGreaterThan(0.55);   // у d20 было бы 0.35
  });
});

describe('планка кубика', () => {
  const fixedDie = (n: number): Rng => ({
    ...makeRng(1), roll: () => n,
  });

  it('на надёжном варианте единица не выпадает — кубик поднимается до планки и это видно строкой', () => {
    const res = resolveOption(state(), player, option({ basePosition: 'controlled' }), 'attack', fixedDie(1));
    expect(res.rawRoll).toBe(1);
    expect(res.roll).toBe(DIE_FLOOR.controlled);
    expect(res.mods[0]).toEqual({ label: 'надійний хід', value: DIE_FLOOR.controlled - 1 });
    expect(res.totalScore).toBe(DIE_FLOOR.controlled + attrMod(player.attrs.passing));
  });

  it('рискованные формы играют честные 2d10', () => {
    for (const basePosition of ['risky', 'desperate'] as const) {
      const res = resolveOption(state(), player, option({ basePosition }), 'attack', fixedDie(2));
      expect(res.roll).toBe(2);
      expect(res.mods.some((m) => m.label === 'надійний хід')).toBe(false);
    }
  });

  it('катастрофа на надёжном варианте возможна только через минусы контекста', () => {
    const fresh = resolveOption(state({ stamina: 55 }), player, option({ basePosition: 'controlled' }), 'attack', fixedDie(1));
    expect(fresh.tier).not.toBe('badFail');
    const wrecked = resolveOption(state({ stamina: 10, momentum: -3 }), player, option({ basePosition: 'controlled' }), 'attack', fixedDie(1));
    expect(wrecked.tier).toBe('badFail');
  });
});
