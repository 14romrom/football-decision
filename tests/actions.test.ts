// Дія Реєса на полі (engine/action.ts, content/actions.json — генерує tools/actions.ts): у кожного
// варіанта кожної сцени є шаблон руху зі словника, місця сцен і адресати — зони, які поле вміє
// поставити. Нова сцена без перегенерації валить тест: інакше поле мовчки показало б «стояти».
import { describe, it, expect } from 'vitest';
import actions from '../src/content/actions.json';
import ends from '../src/content/action-ends.json';
import { EPISODES } from '../src/content';
import { ACTION_BEATS, ACTION_TEMPLATES } from '../src/engine/action';
import { placePoint } from '../src/ui/pitchDirector';

const A = actions as { places: Record<string, string>; options: Record<string, string>; targets: Record<string, string> };

describe('дія Реєса на полі', () => {
  it('у кожного варіанта — шаблон зі словника (npx tsx tools/actions.ts після нової сцени)', () => {
    const missing = EPISODES.flatMap((e) => e.options.map((o) => `${e.id}/${o.id}`)).filter((k) => !A.options[k]);
    expect(missing).toEqual([]);
    for (const [k, t] of Object.entries(A.options)) expect(ACTION_TEMPLATES, k).toContain(t);
  });
  it('місця сцен і адресати — зони, які поле ставить', () => {
    for (const [k, z] of Object.entries(A.places)) expect(placePoint(z), `${k}: ${z}`).not.toBeNull();
    for (const [k, z] of Object.entries(A.targets)) expect(placePoint(z), `${k}: ${z}`).not.toBeNull();
  });
  it('кінцівки ісходів (npx tsx tools/action-ends.ts) — живі ключі й слова зі словника', () => {
    const keys = new Set(EPISODES.flatMap((e) => e.options.flatMap((o) => Object.keys(o.outcomes).map((t) => `${e.id}/${o.id}/${t}`))));
    const who = ['@them', '@striker', '@partner', '@cb', '@cb2', '@dm', '@winger', '@lb', '@rb'];
    for (const [k, line] of Object.entries(ends as Record<string, string>)) {
      expect(keys.has(k), `${k}: ісходу більше немає — перегенерувати`).toBe(true);
      for (const b of line.split(' ')) expect([...ACTION_BEATS, ...who], `${k}: ${b}`).toContain(b);
    }
  });
});
