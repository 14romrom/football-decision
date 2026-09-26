// Розділювачі глав (M24): чотири глави за сезонами — пролог, перший сезон, другий сезон, епілог.
// Кожна відкривається раз за кар'єру; відсотків проходження немає — це правило проєкту.
import { describe, it, expect } from 'vitest';
import { CHAPTERS, SHOTS, shotFor } from '../src/content';
import { WEEK_SCENES } from '../src/content';
import { ANCHOR_SCENES } from '../src/engine/week';

describe('глави й кадри якорів', () => {
  it('глав рівно чотири, і вони збігаються з сезонами', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(['prologue', 'season1', 'season2', 'epilogue']);
    for (const c of CHAPTERS) {
      expect(c.title.length, c.id).toBeGreaterThan(3);
      expect(c.line, c.id).not.toContain('!');
      // rom — «Глава I/II» лише в сезонів: у пролога й епілога назва сама і є частиною, другий рядок дублював би її.
      expect(typeof c.rom, c.id).toBe('string');
    }
  });

  it('кадр глави існує в мапі кадрів', () => {
    for (const c of CHAPTERS) {
      if (!c.shot) continue;
      expect(shotFor(c.shot), `${c.id} → ${c.shot}`).not.toBeNull();
    }
  });

  it('кадри прив’язані до реальних сцен, розворотів або до майбутніх сцен M28', () => {
    const scenes = new Set(WEEK_SCENES.map((s) => s.id));
    // Розвороти прологу (scout / call / base) і кадри, намальовані наперед до сцен медогляду (M28).
    const planned = new Set(['sc_night_before', 'sc_pitch_no_date', 'sc_medical', 'scout', 'call', 'base']);
    for (const id of Object.keys(SHOTS)) {
      expect(scenes.has(id) || planned.has(id), `кадр ${id} нікуди не веде`).toBe(true);
    }
  });

  it('у кожного якоря є або кадр, або підпис — інакше лист не відрізнити від звичайного вечора', () => {
    const byId = new Map(WEEK_SCENES.map((s) => [s.id, s]));
    for (const a of ANCHOR_SCENES) {
      const scene = byId.get(a.scene);
      expect(scene, `сцена ${a.scene} не знайдена`).toBeTruthy();
      const marked = !!scene!.head || !!SHOTS[a.scene];
      expect(marked, `${a.scene}: немає ні кадру, ні підпису`).toBe(true);
    }
  });

  it('focus кадру — пара відсотків object-position, а не довільний рядок', () => {
    for (const [id, s] of Object.entries(SHOTS)) {
      if (!s.focus) continue;
      expect(s.focus, id).toMatch(/^\d{1,3}% \d{1,3}%$/);
    }
  });
});
