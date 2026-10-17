// Дія Реєса на полі (engine/action.ts, content/actions.json — генерує tools/actions.ts): у кожного
// варіанта кожної сцени є шаблон руху зі словника, місця сцен і адресати — зони, які поле вміє
// поставити. Нова сцена без перегенерації валить тест: інакше поле мовчки показало б «стояти».
import { describe, it, expect } from 'vitest';
import actions from '../src/content/actions.json';
import { EPISODES } from '../src/content';
import { ACTION_TEMPLATES } from '../src/engine/action';
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
});
