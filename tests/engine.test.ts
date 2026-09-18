import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { attrMod, computeContext } from '../src/engine/context';
import { resolveOption, tierFor } from '../src/engine/resolve';
import { CATASTROPHE_BAND, THRESHOLDS } from '../src/engine/balance';
import type { Rng } from '../src/engine/rng';
import type { EpisodeOption, MatchState, Player } from '../src/engine/types';
import { initVoiceTrace } from '../src/engine/voices';

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
    flags: [], marks: {}, voices: initVoiceTrace(), log: [],
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
  it('катастрофа — по сырым кубикам, полоса зависит только от формы риска', () => {
    for (const pos of ['controlled', 'risky', 'desperate'] as const) {
      const band = CATASTROPHE_BAND[pos];
      expect(tierFor(pos, band, 99)).toBe('badFail');          // никакой score не спасает
      expect(tierFor(pos, band + 1, -99)).not.toBe('badFail'); // а выше полосы катастрофы нет
    }
    expect(CATASTROPHE_BAND.controlled).toBeLessThan(CATASTROPHE_BAND.risky);
    expect(CATASTROPHE_BAND.risky).toBeLessThan(CATASTROPHE_BAND.desperate);
  });

  it('границы fail и cost читаются по таблице, без смещений на единицу', () => {
    for (const pos of ['controlled', 'risky', 'desperate'] as const) {
      const t = THRESHOLDS[pos];
      const safeRoll = CATASTROPHE_BAND[pos] + 1;
      expect(tierFor(pos, safeRoll, t.fail)).toBe('fail');
      expect(tierFor(pos, safeRoll, t.fail + 1)).toBe('cost');
      expect(tierFor(pos, safeRoll, t.cost)).toBe('cost');
      expect(tierFor(pos, safeRoll, t.cost + 1)).toBe('clean');
    }
  });

  it('складність двигает оба порога, но не полосу катастрофы', () => {
    const t = THRESHOLDS.risky;
    const safeRoll = CATASTROPHE_BAND.risky + 1;
    expect(tierFor('risky', safeRoll, t.cost + 1, 0)).toBe('clean');
    expect(tierFor('risky', safeRoll, t.cost + 1, 3)).toBe('cost');     // важче: те же кубики — уже «але»
    expect(tierFor('risky', safeRoll, t.cost + 4, 3)).toBe('clean');
    expect(tierFor('risky', safeRoll, t.fail + 1, 3)).toBe('fail');
    expect(tierFor('risky', safeRoll, t.cost - 2, -3)).toBe('clean');   // легше: чисто там, где было «але»
    expect(tierFor('risky', CATASTROPHE_BAND.risky, 99, -3)).toBe('badFail'); // катастрофа не выкупается
    expect(tierFor('risky', 20, -99, 4)).toBe('clean');
  });

  it('двадцать на кубиках — чисто при любом score', () => {
    expect(tierFor('desperate', 20, -5)).toBe('clean');
  });

  it('скилл не выкупает риск: сильный атрибут на риске всё равно проигрывает надёжному по катастрофам', () => {
    // Полный перебор 2d10: доля катастроф не зависит от модификатора.
    const share = (pos: 'controlled' | 'risky' | 'desperate', mod: number) => {
      let bad = 0;
      for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) if (tierFor(pos, a + b, a + b + mod) === 'badFail') bad++;
      return bad / 100;
    };
    expect(share('risky', 4)).toBe(share('risky', 0));
    expect(share('controlled', 0)).toBeLessThan(share('risky', 4));
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

  it('кураж входит в score симметрично: до +2 и не ниже −2', () => {
    expect(computeContext(state({ momentum: 3 }), player, option(), 'attack').flat).toBe(2);
    expect(computeContext(state({ momentum: -2 }), player, option(), 'attack').flat).toBe(-2);
    expect(computeContext(state({ momentum: -3 }), player, option(), 'attack').flat).toBe(-2);
  });

  it('после провала следующий бросок на −1 — сверх куража', () => {
    const failed = state({ log: [{ minute: 10, kind: 'episode', text: '', tier: 'fail' }] });
    const mods = computeContext(failed, player, option(), 'attack').mods;
    expect(mods.find((m) => m.label === 'після провалу')?.value).toBe(-1);
    const fine = state({ log: [{ minute: 10, kind: 'episode', text: '', tier: 'cost' }] });
    expect(computeContext(fine, player, option(), 'attack').mods.find((m) => m.label === 'після провалу')).toBeUndefined();
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

describe('кубики и модификаторы', () => {
  const fixedDie = (n: number): Rng => ({ ...makeRng(1), roll: () => n });

  it('score = кубики + модификаторы, кубики показываются как выпали', () => {
    const res = resolveOption(state({ stamina: 80 }), player, option({ basePosition: 'controlled' }), 'attack', fixedDie(9));
    expect(res.rawRoll).toBe(9);
    expect(res.totalScore).toBe(9 + attrMod(player.attrs.passing) + 1);
    expect(res.critical).toBeNull();
  });

  it('катастрофа на надёжном варианте — только двойка на кубиках, минусы контекста её не делают', () => {
    // Минусы бьют по score, а не по полосе катастрофы. (Дорогой вариант при севших ногах
    // сдвинулся бы в «ризиковано» — это отдельный, видимый игроку механизм, см. shift.)
    const wrecked = state({ stamina: 5, momentum: -3 });
    expect(resolveOption(wrecked, player, option({ basePosition: 'controlled', staminaCost: 2 }), 'attack', fixedDie(3)).tier).toBe('fail');
    const res = resolveOption(state(), player, option({ basePosition: 'controlled' }), 'attack', fixedDie(2));
    expect(res.tier).toBe('badFail');
    expect(res.critical).toBe('fail');
  });
});
