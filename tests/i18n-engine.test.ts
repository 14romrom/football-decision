// Переклад (M47), сьома дірка звіту — і остання, бо тепер її тримає тест.
//
// `tools/i18n.ts` дедуплікує рядки за хешем: однаковий текст у двох сценах дає **один** запис у
// карті, і `collect()` приписує його першій сцені у файлі — часто чужій сім'ї. Тому `fam` казав
// «лишилося 0», а гра показувала український рядок; так за три сесії набралося 19 таких рядків,
// п'ять із них — у сім'ях, зданих як «готові». Звіт цього не бачить за побудовою, бачить лише
// рушій: контент після `tr()`.
//
// Перевірка робить саме це — вантажить контент англійською і шукає кирилицю. Раніше та сама
// перевірка жила процедурою в консолі браузера, і саме тому її забували.
import { describe, it, expect, beforeAll } from 'vitest';

const CYR = /[а-яіїєґА-ЯІЇЄҐ]/;

/** `⟨ціна⟩` і `⟨чутка⟩` шукає регулярка в `engine/market.ts`, тому токени лишаються українськими
 *  в усіх мовах — як і в сусідньому тесті на кирилицю в карті. */
const strip = (s: string): string => s.replace(/⟨[^⟩]+⟩/g, '');

/** Шляхи, де кирилиця — не недоробка, а сама суть. `Roster.base` це базовий двійник ростера: з
 *  нього `fillNames` бере імена для **ще не перекладених** речень, інакше виходить
 *  «Their dribbler б'є з-за штрафного». Він має лишатися українським завжди. */
const BY_DESIGN = /^ROSTER\.base\b/;

let hits: string[] = [];
let seen = 0;

beforeAll(async () => {
  const store: Record<string, string> = {
    'football-decision.settings.v1': JSON.stringify({ lang: 'en' }),
  };
  (globalThis as unknown as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 1,
  };
  // Мова читається один раз при завантаженні модуля, тому імпорт — після підміни, і динамічний.
  const content = await import('../src/content/index');
  const { LANG } = await import('../src/content/i18n');
  expect(LANG, 'підміна налаштувань не доїхала до модуля мови').toBe('en');

  const walk = (v: unknown, path: string): void => {
    if (BY_DESIGN.test(path)) return;
    if (typeof v === 'string') {
      seen++;
      if (CYR.test(strip(v))) hits.push(`${path}: ${v.slice(0, 90)}`);
      return;
    }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`));
  };
  for (const [name, value] of Object.entries(content)) {
    if (name === 'EPISODES') {
      (value as { family: string; id: string }[]).forEach((e) => walk(e, `${e.family}/${e.id}`));
    } else walk(value, name);
  }
});

describe('переклад у рушії', () => {
  it('англійський контент не містить кирилиці — перевірка не звітом, а рушієм', () => {
    // Порожній обхід дав би зелений тест ні про що: контент це десятки тисяч рядків.
    expect(seen, 'обхід контенту не знайшов рядків — перевірка нічого не перевірила').toBeGreaterThan(10000);
    expect(hits, `кириличних рядків: ${hits.length}`).toEqual([]);
  });
});
