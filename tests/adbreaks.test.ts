// Паузи в матчі під рекламу (M48, content/adbreaks.json): тексти пишуться раніше, ніж показ.
// Форма — як у листа оповідача: сетап, три голоси з шести картки, підпис під «Чекати»; без «!»
// (тон гри — спостереження), імена — плейсхолдерами ростера, і вони розв'язуються.
import { describe, it, expect } from 'vitest';
import { AD_BREAKS, ROSTER } from '../src/content';
import { fillNames } from '../src/engine/names';
import { adBreakFor } from '../src/engine/ads';

const VOICES = ['ego', 'team', 'composure', 'vision', 'instinct', 'body'];

describe('паузи під рекламу', () => {
  it('шість сюжетів, у кожного сетап, три різні голоси й підпис', () => {
    // Шість — другої ліги (перший сезон), п'ять — вищої (другий сезон, 18.10).
    expect(AD_BREAKS.filter((b) => !b.league).map((b) => b.id)).toEqual(['water', 'dog', 'lights', 'flares', 'crossbar', 'invader']);
    expect(AD_BREAKS.filter((b) => b.league === 'top').map((b) => b.id)).toEqual(['var', 'tv', 'drone', 'cheque', 'chipball']);
    for (const b of AD_BREAKS) {
      expect(b.setup.length, b.id).toBeGreaterThan(60);
      expect(b.voices.length, b.id).toBe(3);
      expect(new Set(b.voices.map((v) => v.voice)).size, b.id).toBe(3);
      for (const v of b.voices) expect(VOICES, `${b.id}: ${v.voice}`).toContain(v.voice);
      expect(b.note, b.id).toMatch(/реклам|advert/i);
    }
  });
  it('без «!», і всі плейсхолдери розв’язуються ростером у кожній лізі й кожній погоді', () => {
    for (const league of ['second', 'top'] as const) for (const weather of ['clear', 'rain', 'heat', 'wind']) {
      for (let n = 2; n <= 20; n += 2) {
        const b = adBreakFor(AD_BREAKS, n, league, weather);
        for (const t of [b.setup, b.note, ...b.voices.map((v) => v.line)]) {
          expect(t, b.id).not.toMatch(/!/);
          expect(fillNames(t, ROSTER), `${b.id} ${league} ${weather}`).not.toMatch(/\{[a-z.]+\}/);
        }
      }
    }
  });
  it('у вищій лізі жоден сюжет не каже «друга ліга»', () => {
    for (let n = 12; n <= 20; n += 2) {
      const b = adBreakFor(AD_BREAKS, n, 'top', 'clear');
      expect([b.setup, ...b.voices.map((v) => v.line)].join(' '), b.id).not.toMatch(/[Дд]руг(а|ої) ліг/);
    }
  });
});
