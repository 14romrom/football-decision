// Паузи в матчі під рекламу (M48, content/adbreaks.json): тексти пишуться раніше, ніж показ.
// Форма — як у листа оповідача: сетап, три голоси з шести картки, підпис під «Чекати»; без «!»
// (тон гри — спостереження), імена — плейсхолдерами ростера, і вони розв'язуються.
import { describe, it, expect } from 'vitest';
import { AD_BREAKS, ROSTER } from '../src/content';
import { fillNames } from '../src/engine/names';

const VOICES = ['ego', 'team', 'composure', 'vision', 'instinct', 'body'];

describe('паузи під рекламу', () => {
  it('шість сюжетів, у кожного сетап, три різні голоси й підпис', () => {
    expect(AD_BREAKS.map((b) => b.id)).toEqual(['water', 'dog', 'lights', 'flares', 'crossbar', 'invader']);
    for (const b of AD_BREAKS) {
      expect(b.setup.length, b.id).toBeGreaterThan(60);
      expect(b.voices.length, b.id).toBe(3);
      expect(new Set(b.voices.map((v) => v.voice)).size, b.id).toBe(3);
      for (const v of b.voices) expect(VOICES, `${b.id}: ${v.voice}`).toContain(v.voice);
      expect(b.note, b.id).toMatch(/реклам|advert/i);
    }
  });
  it('без «!», і всі плейсхолдери розв’язуються ростером', () => {
    for (const b of AD_BREAKS) for (const t of [b.setup, b.note, ...b.voices.map((v) => v.line)]) {
      expect(t, b.id).not.toMatch(/!/);
      expect(fillNames(t, ROSTER), b.id).not.toMatch(/\{[a-z.]+\}/);
    }
  });
});
