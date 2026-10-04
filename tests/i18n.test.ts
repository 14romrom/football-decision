// Переклад (M47). Тест стоїть між перекладом і посиланням: `pages.yml` ганяє його перед викладкою,
// тому на Pages і в APK фізично не може потрапити переклад із загубленим плейсхолдером або
// недоперекладеним рядком. Та сама логіка, що тримає «ніяких відсотків» і «імена плейсхолдерами».
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { collect, rawCodeStrings, srcHash as toolHash, unknownKeys } from '../tools/i18n';
import { srcHash } from '../src/content/i18n';

const EN = JSON.parse(readFileSync('src/content/i18n/en.json', 'utf8')) as Record<string, string>;
const rows = collect();
const bySrc = new Map(rows.map((r) => [r.hash, r]));

/** Імена плейсхолдерів без відмінка: в англійській відмінків немає, тому `{dm.gen}` стає `{dm}` —
 *  це нормальна адаптація. А от загублений чи вигаданий плейсхолдер — помилка. */
const bases = (s: string): string[] =>
  [...s.matchAll(/\{([a-z0-9]+)(?:\.[a-z]+)*\}/g)].map((m) => m[1]).sort();

/** `⟨ціна⟩` і `⟨чутка⟩` (engine/market.ts) шукає регулярка, а не перекладач: токен лишається
 *  українським і в англійському тексті справи. Загублений — і в рядку назавжди порожньо. */
const tokens = (s: string): string[] => [...s.matchAll(/⟨([^⟩]+)⟩/g)].map((m) => m[1]).sort();

describe('переклад', () => {
  it('хеш у рушії і в інструменті — один і той самий', () => {
    // Розійдуться — карта мовчки перестане підходити до всього контенту.
    for (const r of rows.slice(0, 200)) expect(toolHash(r.src), r.src.slice(0, 40)).toBe(srcHash(r.src));
  });

  it('кожен запис карти має живий оригінал', () => {
    // Оригінал змінили — переклад мовчки відкотився б на українську; тест каже про це вголос.
    const orphans = Object.keys(EN).filter((h) => !bySrc.has(h));
    expect(orphans, `записів без оригіналу: ${orphans.length}`).toEqual([]);
  });

  it('в англійських рядках немає кирилиці', () => {
    const left = Object.entries(EN).filter(([, v]) => /[а-яіїєґА-ЯІЇЄҐ]/.test(v));
    expect(left.map(([h, v]) => `${h}: ${v.slice(0, 60)}`)).toEqual([]);
  });

  it('плейсхолдери не загублені й не вигадані', () => {
    const bad: string[] = [];
    for (const [h, v] of Object.entries(EN)) {
      const src = bySrc.get(h);
      if (!src) continue;
      const a = [...bases(src.src), ...tokens(src.src)], b = [...bases(v), ...tokens(v)];
      if (a.join(',') !== b.join(',')) bad.push(`${h}\n  укр: ${a.join(' ')}\n  анг: ${b.join(' ')}\n  ${v.slice(0, 70)}`);
    }
    expect(bad).toEqual([]);
  });

  it('тон: не кричати там, де оригінал не кричить', () => {
    // Правило «без знаків оклику» стосується прози, а не вигуку на полі: в українському
    // «ГОЛ!!» вони є, і переклад має право їх зберегти. Заборонено саме додавати свої.
    const shouty = Object.entries(EN).filter(([h, v]) => v.includes('!') && !bySrc.get(h)?.src.includes('!'));
    expect(shouty.map(([h, v]) => `${h}: ${v.slice(0, 60)}`)).toEqual([]);
  });

  // Дві перевірки проти того, що вже сталося: інструмент рахував 100%, а в англійській збірці
  // лишалася кирилиця. Обидві дірки — не про старанність, а про те, що звіт про них не знав.
  it('кожен ключ контенту віднесено або до прози, або до даних', () => {
    // Ключ, якого немає в жодному списку, `walk` викидає **тихо** — так 90 рядків прологу й
    // відпустки не потрапили ні в переклад, ні у звіт (04.10). Новий ключ має бути названий.
    const unknown = unknownKeys().map((u) => `${u.file} · ${u.key}: ${u.sample}`);
    expect(unknown, 'ключі поза PROSE_KEYS і SKIP_KEYS').toEqual([]);
  });

  it('у коді немає кирилиці поза t() і tf()', () => {
    // Шаблонний рядок із підстановкою і текст прямо в JSX виглядають як переклад, але карта їх
    // не бачить: 137 таких рядків лишалися українськими, коли DESIGN уже казав «код закрито».
    const raw = rawCodeStrings().map((r) => `${r.file}:${r.line} (${r.kind}) ${r.text}`);
    expect(raw, 'обгорнути в tf() або позначити i18n-skip').toEqual([]);
  });

  it('словник термінів: ключові слова перекладені однаково скрізь', () => {
    // Єдність на 11 тисячах рядків тримається не старанням, а списком. Розширювати його тоді,
    // коли термін з'являється в перекладі, а не наперед.
    const glossary: [RegExp, RegExp][] = [
      [/\bдруг(а|ої) лі(га|ги)\b/i, /second division/i],
      [/чемпіонат пивоварень/i, /brewers' league/i],
      [/\bтрамва/i, /\btram\b/i],
      [/\bлав[аиі]\b/i, /\bbench\b/i],
    ];
    const bad: string[] = [];
    for (const [h, v] of Object.entries(EN)) {
      const src = bySrc.get(h);
      if (!src) continue;
      for (const [uk, en] of glossary) {
        if (uk.test(src.src) && !en.test(v)) bad.push(`${h}: «${src.src.slice(0, 50)}» → «${v.slice(0, 50)}»`);
      }
    }
    expect(bad).toEqual([]);
  });
});
