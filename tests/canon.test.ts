// Канон (28.09, після прогону текстів): сцена, на яку посилається інший текст, зобов'язана дійти до
// гравця. Відсилка на подію, якої з ним не було, читається як дірка в історії — а якорів на сезон
// стає більше, тури скінченні, і черга з них вирішується мовчки, за порядком у ANCHOR_SCENES.
// Тест проганяє видачу якорів по сезону так само, як це робить App: один якір на тиждень, побачене
// не повторюється (seenScenes читає weekLog).
import { describe, it, expect } from 'vitest';
import { anchorScene, ANCHOR_SCENES, CANON_SCENES } from '../src/engine/week';
import { defaultCareer, type Career } from '../src/engine/career';
import { SEASON_ROUNDS } from '../src/engine/season';
import { WEEK_SCENES } from '../src/content';

/** Прогін сезону: кожен тур просимо якір і записуємо його в кар'єру, як робить App. */
function deliver(seasonNumber: number, career: Career): string[] {
  const seen: string[] = [];
  let c = career;
  for (let round = 0; round < SEASON_ROUNDS; round++) {
    const scene = anchorScene(seasonNumber, round, c, WEEK_SCENES);
    if (!scene) continue;
    seen.push(scene.id);
    c = { ...c, weekLog: [...(c.weekLog ?? []), { season: seasonNumber, round, chosen: [], offered: [], scene: { id: scene.id, option: scene.options[0].id } }] };
  }
  return seen;
}

describe('канон історії', () => {
  it('кожна сцена з CANON_SCENES існує і стоїть якорем', () => {
    const scenes = new Set(WEEK_SCENES.map((s) => s.id));
    const anchors = new Set(ANCHOR_SCENES.map((a) => a.scene));
    for (const c of CANON_SCENES) {
      expect(scenes.has(c.scene), `${c.scene}: немає такої сцени`).toBe(true);
      expect(anchors.has(c.scene), `${c.scene}: на неї посилаються (${c.why}), але вона не якір`).toBe(true);
    }
  });

  it('канонічні сцени доходять до гравця за сезон — якорів не більше, ніж турів', () => {
    for (const seasonNumber of [1, 2]) {
      // Кар'єра без особливих станів: стан арки 1, дублер на місці — найгірший випадок для черги.
      const career = { ...defaultCareer(), matchesPlayed: seasonNumber === 1 ? 0 : 10 };
      const seen = deliver(seasonNumber, career);
      for (const c of CANON_SCENES.filter((x) => x.season === seasonNumber)) {
        expect(seen, `${c.scene} не дійшла за сезон ${seasonNumber}: ${c.why}. Видано: ${seen.join(', ')}`).toContain(c.scene);
      }
    }
  });

  it('сцена з ANCHOR_SCENES не приходить двічі за кар\'єру', () => {
    const career = { ...defaultCareer() };
    const first = deliver(1, career);
    expect(new Set(first).size).toBe(first.length);
  });
});
