// Пролог — тиждень нуль (M12): три розвороти зі стікерами голосів, наслідки через applyWeek,
// лава примусово, Спокою серед стікерів немає, жарт Тібо — не флаг.
import { describe, it, expect } from 'vitest';
import { defaultCareer } from '../src/engine/career';
import { finishPrologue, prologuePending, type ProloguePick } from '../src/engine/prologue';
import { VOICE_ATTRS } from '../src/engine/week';
import { FLAG_RULES, PROLOGUE, ROSTER } from '../src/content';
import { fillNamesDeep } from '../src/engine/names';

const KNOWN_FLAGS = new Set(FLAG_RULES.map((f) => f.id));
const pick = (option: string, attr?: ProloguePick['attr']): ProloguePick => {
  const spread = PROLOGUE.find((s) => s.options.some((o) => o.id === option))!;
  return { spread: spread.id, option, ...(attr ? { attr } : {}) };
};

describe('контент прологу', () => {
  it('три розвороти: скаут, дзвінок, база; у кожного лист оповідача і 3–4 стікери з унікальними id', () => {
    expect(PROLOGUE.map((s) => s.id)).toEqual(['scout', 'call', 'base']);
    const ids = new Set<string>();
    for (const s of PROLOGUE) {
      expect(s.sheet.length, s.id).toBeGreaterThanOrEqual(1);
      expect(s.sheet.join(' ').length, s.id).toBeGreaterThan(80);
      expect(s.options.length, s.id).toBeGreaterThanOrEqual(3);
      expect(s.options.length, s.id).toBeLessThanOrEqual(4);
      expect(new Set(s.options.map((o) => o.voice)).size, `${s.id}: голоси різні`).toBe(s.options.length);
      for (const o of s.options) {
        expect(ids.has(o.id), o.id).toBe(false); ids.add(o.id);
        expect(o.say.length, o.id).toBeGreaterThan(5);
        expect(o.line.length, o.id).toBeGreaterThan(5);
        expect(o.mark.length, o.id).toBeGreaterThan(5);
        expect(o.effect.note.length, o.id).toBeGreaterThan(10);
        for (const f of o.effect.flags ?? []) expect(KNOWN_FLAGS.has(f.flag), `${o.id}: флаг ${f.flag}`).toBe(true);
        if (o.point) expect(VOICE_ATTRS[o.voice].length, `${o.id}: пункт без атрибутів голосу`).toBeGreaterThan(0);
      }
    }
  });

  it('Спокою серед стікерів немає: за лором це голос, якого Реєс не чує', () => {
    for (const s of PROLOGUE) expect(s.options.some((o) => o.voice === 'composure'), s.id).toBe(false);
  });

  it('без «!» і без цифр — тон гри; плейсхолдери розв’язуються, фамілій своїх немає', () => {
    const raw = JSON.stringify(PROLOGUE);
    const texts = PROLOGUE.flatMap((s) => [s.title, s.sub, s.tab, ...s.sheet, ...s.options.flatMap((o) => [o.say, o.line, o.mark, o.effect.note])]).join('\n');
    expect(texts).not.toMatch(/!/);
    expect(texts).not.toMatch(/\d/);
    const surnames = Object.values(ROSTER.us.players).flatMap((p) => [p.nom, p.gen, p.dat, p.ins]);
    for (const s of surnames) expect(raw, s).not.toContain(s);
    expect(() => fillNamesDeep(PROLOGUE, ROSTER)).not.toThrow();
    expect(JSON.stringify(fillNamesDeep(PROLOGUE, ROSTER))).not.toMatch(/\{[a-z.]+\}/);
  });
});

describe('finishPrologue', () => {
  it('пролог чекає тільки нову кар’єру; після нього — лава, запис і бирки', () => {
    const c0 = defaultCareer();
    expect(prologuePending(c0)).toBe(true);
    expect(prologuePending({ ...c0, matchesPlayed: 3 })).toBe(false);
    const { career, tags } = finishPrologue(c0, PROLOGUE, [pick('scout_vision', 'positioning'), pick('call_ego'), pick('base_vision')]);
    expect(prologuePending(career)).toBe(false);
    expect(career.benched).toBe(true);
    expect(career.prologue).toEqual({ scout: 'scout_vision', call: 'call_ego', base: 'base_vision' });
    expect(tags.length).toBeGreaterThanOrEqual(4);
  });

  it('скаут: голос гучніше на перший матч і атрибутний пункт назавжди — з вибраного атрибута', () => {
    const { career, tags } = finishPrologue(defaultCareer(), PROLOGUE, [pick('scout_vision', 'positioning')]);
    expect(career.attrPoints.positioning).toBe(1);
    expect(career.nextMatch?.attrBonus?.vision).toBeGreaterThan(0);
    expect(tags).toContain('Бачення гучніше');
    expect(tags.some((t) => t.includes('назавжди'))).toBe(true);
    // Атрибут не з голосу — береться перший атрибут голосу, а не чужий.
    const wrong = finishPrologue(defaultCareer(), PROLOGUE, [pick('scout_body', 'vision')]);
    expect(wrong.career.attrPoints.vision).toBeUndefined();
    expect(wrong.career.attrPoints.pace).toBe(1);
    // Его — без пункту, зате трибуни і серія.
    const ego = finishPrologue(defaultCareer(), PROLOGUE, [pick('scout_ego')]);
    expect(Object.keys(ego.career.attrPoints)).toHaveLength(0);
    expect(ego.career.nextMatch?.voiceStreak?.who).toBe('ego');
    expect(ego.career.nextMatch?.start?.fanHype).toBeGreaterThan(0);
  });

  it('дзвінок: Его — довіра нижча і дублер у спину «ще до сезону»; Команда — вища; Бачення — партнер', () => {
    const base = defaultCareer();
    const ego = finishPrologue(base, PROLOGUE, [pick('call_ego')]).career;
    expect(ego.coachTrust).toBeLessThan(base.coachTrust);
    const flag = ego.carriedFlags?.find((f) => f.flag === 'sub_threat');
    expect(flag?.mark.whenText).toBe('ще до сезону');
    const team = finishPrologue(base, PROLOGUE, [pick('call_team')]).career;
    expect(team.coachTrust).toBeGreaterThan(base.coachTrust);
    const vision = finishPrologue(base, PROLOGUE, [pick('call_vision')]);
    expect(vision.career.partnerBond).toBe(1);
    expect(vision.tags).toContain('партнер: є привід довіряти');
  });

  it('база: Спокій на старт нижчий у всіх, крім сміху; жарт Тібо — у career.prologue, не флаг', () => {
    for (const s of PROLOGUE.find((x) => x.id === 'base')!.options) {
      const { career } = finishPrologue(defaultCareer(), PROLOGUE, [pick(s.id)]);
      const composure = career.nextMatch?.start?.composure ?? 0;
      if (s.id === 'base_team') expect(composure, s.id).toBe(0); else expect(composure, s.id).toBeLessThan(0);
      expect(career.carriedFlags ?? []).toHaveLength(0);
      expect(career.prologue?.base).toBe(s.id);
    }
  });
});
