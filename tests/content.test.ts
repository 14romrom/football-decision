import { describe, it, expect } from 'vitest';
import { EPISODES, PLAYER } from '../src/content';
import { BALANCE } from '../src/engine/balance';
import type { Attribute, Episode, Tier } from '../src/engine/types';

const TIERS: Tier[] = ['badFail', 'fail', 'cost', 'clean'];
const ATTRS: Attribute[] = ['finishing', 'passing', 'dribbling', 'first_touch', 'pace', 'strength', 'stamina', 'composure', 'vision', 'positioning'];

/** Эпизод с конфликтом целей: есть явно командный вариант и явно карьерный. */
function hasGoalConflict(e: Episode): boolean {
  const teamFirst = e.options.some((o) => o.goals.team - o.goals.personal >= 2);
  const selfFirst = e.options.some((o) => o.goals.personal - o.goals.team >= 2);
  return teamFirst && selfFirst;
}

describe('форма контента', () => {
  it('в наборе не меньше 20 эпизодов с уникальными id', () => {
    // Пул должен быть заметно больше десяти слотов: иначе второй матч —
    // те же ситуации в другом порядке, и вопрос «хочется ли ещё» измеряет не то.
    expect(EPISODES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(EPISODES.map((e) => e.id)).size).toBe(EPISODES.length);
  });

  it('у каждого эпизода 3–4 опции и все четыре исхода в каждой', () => {
    for (const e of EPISODES) {
      expect(e.options.length, e.id).toBeGreaterThanOrEqual(3);
      expect(e.options.length, e.id).toBeLessThanOrEqual(4);
      expect(new Set(e.options.map((o) => o.id)).size, e.id).toBe(e.options.length);
      for (const o of e.options) {
        for (const t of TIERS) {
          const out = o.outcomes[t];
          expect(out, `${e.id}/${o.id}/${t}`).toBeTruthy();
          expect(out.text.length, `${e.id}/${o.id}/${t}`).toBeGreaterThan(20);
          expect(out.recap.length, `${e.id}/${o.id}/${t}`).toBeGreaterThan(5);
        }
      }
    }
  });

  it('поля опций валидны: атрибут, форма риска, масштаб, стоимость 2..12', () => {
    for (const e of EPISODES) for (const o of e.options) {
      expect(ATTRS, `${e.id}/${o.id}`).toContain(o.attribute);
      expect(['controlled', 'risky', 'desperate']).toContain(o.basePosition);
      expect(['limited', 'standard', 'great']).toContain(o.effect);
      expect(o.staminaCost, `${e.id}/${o.id}`).toBeGreaterThanOrEqual(2);
      expect(o.staminaCost, `${e.id}/${o.id}`).toBeLessThanOrEqual(12);
      expect(o.past.length, `${e.id}/${o.id}`).toBeGreaterThan(3);
      for (const g of [o.goals.team, o.goals.personal]) {
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(3);
      }
    }
  });

  it('в каждом эпизоде формы риска различаются — выбор не сводится к одной шкале', () => {
    for (const e of EPISODES) {
      expect(new Set(e.options.map((o) => o.basePosition)).size, e.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('конфликт целей (п. 6 ТЗ)', () => {
  it('минимум 40% эпизодов содержат командный и карьерный варианты одновременно', () => {
    const conflicted = EPISODES.filter(hasGoalConflict).map((e) => e.id);
    expect(conflicted.length, `эпизоды с конфликтом: ${conflicted.join(', ')}`).toBeGreaterThanOrEqual(Math.ceil(EPISODES.length * 0.4));
  });

  it('есть эпизод, где командный вариант при этом надёжнее карьерного', () => {
    // Ровно та ситуация из ТЗ: пас правильнее и безопаснее, а бить всё равно хочется.
    const found = EPISODES.some((e) => {
      const team = e.options.find((o) => o.goals.team - o.goals.personal >= 2 && o.basePosition === 'controlled');
      const self = e.options.find((o) => o.goals.personal - o.goals.team >= 2 && o.basePosition !== 'controlled');
      return Boolean(team && self);
    });
    expect(found).toBe(true);
  });
});

describe('связность и покрытие расписания', () => {
  it('на каждую минуту расписания есть подходящий эпизод', () => {
    for (const m of BALANCE.match.episodeMinutes) {
      const fits = EPISODES.filter((e) => {
        const r = e.requires;
        if (!r) return true;
        return (r.minMinute ?? 0) <= m && (r.maxMinute ?? 90) >= m;
      });
      expect(fits.length, `минута ${m}`).toBeGreaterThan(0);
    }
  });

  it('последний слот после 85-й минуты закрыт эпизодом концовки', () => {
    const late = EPISODES.filter((e) => (e.requires?.maxMinute ?? 90) >= 86);
    expect(late.length).toBeGreaterThan(0);
  });

  it('эпизодов хватает, чтобы не повториться за матч', () => {
    expect(EPISODES.length).toBeGreaterThanOrEqual(BALANCE.match.episodeMinutes.length);
  });
});

describe('стартовый футболист', () => {
  it('каждый атрибут используется хотя бы одной опцией — иначе он мёртвый на карточке', () => {
    const used = new Set(EPISODES.flatMap((e) => e.options.map((o) => o.attribute)));
    for (const a of ATTRS) if (a !== 'stamina') expect(used.has(a), a).toBe(true);   // витривалість работает через расход сил
  });

  it('атрибуты в стартовом коридоре 45..65', () => {
    for (const [k, v] of Object.entries(PLAYER.attrs)) {
      expect(v, k).toBeGreaterThanOrEqual(45);
      expect(v, k).toBeLessThanOrEqual(65);
    }
  });
});

describe('плейсхолдеры имён', () => {
  it('в сыром контенте нет фамилий из ростера — только плейсхолдеры', async () => {
    const { EPISODES_RAW, ROSTER } = await import('../src/content');
    const surnames = [...Object.values(ROSTER.us.players), ...Object.values(ROSTER.them.players)]
      .flatMap((p) => Object.values(p));
    const raw = JSON.stringify(EPISODES_RAW);
    for (const s of surnames) expect(raw, s).not.toContain(s);
  });

  it('каждый плейсхолдер разрешается в имя', () => {
    // fillNamesDeep бросает на неизвестном ключе при импорте контента;
    // здесь проверяем, что после подстановки фигурных скобок не осталось.
    for (const e of EPISODES) expect(JSON.stringify(e), e.id).not.toMatch(/\{[a-z.]+\}/);
  });
});
