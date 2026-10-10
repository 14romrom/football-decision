// Переклад (M47). Тест стоїть між перекладом і посиланням: `pages.yml` ганяє його перед викладкою,
// тому на Pages і в APK фізично не може потрапити переклад із загубленим плейсхолдером або
// недоперекладеним рядком. Та сама логіка, що тримає «ніяких відсотків» і «імена плейсхолдерами».
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { collect, rawCodeStrings, srcHash as toolHash } from '../tools/i18n';
import { srcHash } from '../src/content/i18n';
import { fillNames, type Roster } from '../src/engine/names';

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

  // Перевірка проти того, що вже сталося: інструмент рахував 100%, а в англійській збірці
  // лишалася кирилиця. Дірка — не про старанність, а про те, що звіт про неї не знав.
  // Пари «кожен ключ віднесено до прози або до даних» тут більше немає: вона тримала ворота
  // «проза лише під відомим ключем», а саме ці ворота й виявилися джерелом шести дірок — тепер
  // кириличне значення вважається текстом за умовчанням, і тихо викинути його нема чим.
  it('у коді немає кирилиці поза t() і tf()', () => {
    // Шаблонний рядок із підстановкою і текст прямо в JSX виглядають як переклад, але карта їх
    // не бачить: 137 таких рядків лишалися українськими, коли DESIGN уже казав «код закрито».
    const raw = rawCodeStrings().map((r) => `${r.file}:${r.line} (${r.kind}) ${r.text}`);
    expect(raw, 'обгорнути в tf() або позначити i18n-skip').toEqual([]);
  });

  it('вставка відповідає мовою свого рядка', () => {
    // Паралельна версія, а не правки в базовій: переклад **не має права** змінювати вже написаний
    // текст. Поки він частковий, у збірці іншою мовою половина рядків базові — і підставити в них
    // цільове ім'я означає зробити «Their dribbler б'є з-за штрафного». Інваріант перевіряємо на
    // самому механізмі: ростеру чіпляємо двійника і дивимось, кого візьме `fillNames`.
    const uk = { nom: 'Мораес', gen: 'Мораеса', dat: 'Мораесу', ins: 'Мораесом' };
    const en = { nom: 'Moraes', gen: 'Moraes', dat: 'Moraes', ins: 'Moraes' };
    const team = (p: typeof uk) => ({ name: { nom: 'Вальмара', gen: 'Вальмари' }, players: { partner: p }, scorers: ['partner'] });
    const base = { us: team(uk), them: team(uk) } as unknown as Roster;
    const roster = { us: team(en), them: team(en), base } as unknown as Roster;

    expect(fillNames('{partner.dat} віддали м’яч.', roster)).toBe('Мораесу віддали м’яч.');
    expect(fillNames('They gave the ball to {partner.dat}.', roster)).toBe('They gave the ball to Moraes.');
    // `extra` як функція мови: назви клубів у стрічці приходять тим самим шляхом.
    const extra = (_lang: 'uk' | 'en', r: Roster) => ({ leader: r === base ? 'Порту-Бланко' : 'Porto Blanco' });
    expect(fillNames('Лідер — {leader}.', roster, extra)).toBe('Лідер — Порту-Бланко.');
    expect(fillNames('The leader is {leader}.', roster, extra)).toBe('The leader is Porto Blanco.');
    // Без двійника (базова збірка) поведінка та сама, що до появи перекладу.
    expect(fillNames('{partner.dat} віддали м’яч.', { us: team(uk), them: team(uk) } as unknown as Roster)).toBe('Мораесу віддали м’яч.');
  });

  it('реальних людей по імені немає і в перекладі', () => {
    // Правило CLAUDE.md діє **в кожній мові окремо**: клуби можна, людей — лише під спотвореними,
    // але вузнаваними іменами. В українському контенті це тримає `tests/posts.test.ts`; тут —
    // англійські написання, бо переклад легко повертає правильне ім'я назад (Коналду → Ronaldo).
    const REAL = /\bMbapp|\bRonaldo|\bMessi|\bHaaland|\bSalah|\bVinicius|\bMaguire|\bFernandes|\bNunez|\bKane\b|\bGuardiola|\bMourinho|\bConte\b|\bLukaku|\bNeymar|\bOnana|\bCasemiro|\bRice\b|\bPulisic|\bEmery|\bPerez\b|\bKlopp|\bArteta|\bAncelotti|\bFlick\b|\bInfantino|\bRomano\b|\bPutin/i;
    const bad = Object.entries(EN).filter(([, v]) => REAL.test(v)).map(([h, v]) => `${h}: ${v.slice(0, 70)}`);
    expect(bad, 'спотворити ім\'я, як в українському джерелі').toEqual([]);
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
