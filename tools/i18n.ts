// Робочий інструмент перекладу (M47). Витягує рядки, яким потрібен переклад, і рахує покриття.
//   npx tsx tools/i18n.ts stat                 — скільки перекладено, по файлах
//   npx tsx tools/i18n.ts take <файл> [N]      — наступні N неперекладених рядків файлу, з хешами
//   npx tsx tools/i18n.ts orphans              — записи карти, яким більше не відповідає жоден оригінал
//
// Навіщо окремий інструмент: перекладати, читаючи `episodes.json` цілком, — це 600 тисяч знаків
// на кожен підхід. `take` віддає плаский зріз «хеш → український рядок», і цього достатньо:
// ключ у карті — хеш тексту, не шлях, тому структура файлу перекладачеві не потрібна взагалі.
//
// Що НЕ йде в переклад (`skip`): ідентифікатори, ключі голосів і атрибутів, хендли акаунтів,
// `focus` на кадрах, відмінкові форми ростера — вони не текст, а дані. Помилково перекладений
// id ламає гру тихо, тому список свідомо вузький: беремо тільки ключі, у яких лежить проза.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/content';
const MAP = join(DIR, 'i18n/en.json');
const MARKS = ["t('", "tf('"];
const END = String.fromCharCode(39);   // закривна лапка: t('…') закінчується «')», а tf('…', x) — «',»
const SEP = /[\\/]/;
const NL = String.fromCharCode(10);

/** Той самий хеш, що в `src/content/i18n.ts` — тримати синхронно (тест це перевіряє). */
export function srcHash(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return (a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')).slice(0, 12);
}

/** Ключі, під якими лежить проза. Усе інше — дані, і перекладати його не можна. */
const PROSE_KEYS = new Set([
  'text', 'line', 'lines', 'label', 'past', 'recap', 'setup', 'sheet', 'say', 'reply', 'reaction',
  'note', 'title', 'sub', 'tab', 'head', 'mark', 'summary', 'blurb', 'short', 'intent', 'name',
  'whenText', 'column', 'sign', 'textCold', 'sheetCold', 'say', 'line',
]);
/** Ключі, під якими лежать дані, хоч вони і рядки. */
const SKIP_KEYS = new Set([
  'id', 'voice', 'who', 'attribute', 'account', 'handle', 'kind', 'group', 'focus', 'shot',
  'family', 'phase', 'basePosition', 'effect', 'trait', 'tier', 'scorer', 'followUp', 'flag',
  'nom', 'gen', 'dat', 'ins', 'rom', 'position', 'result', 'train', 'target', 'episode',
]);

const isUkr = (s: string) => /[а-яіїєґА-ЯІЇЄҐ]/.test(s) && s.trim().length > 2;

export type Row = { hash: string; file: string; path: string; src: string };

export function collect(): Row[] {
  const out: Row[] = [];
  const seen = new Set<string>();
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
    const data = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
    walk(data, f, '', out, seen);
  }
  // Рядки, що живуть у коді (ярлики кнопок, назви голосів, шматки фраз, які рушій склеює сам),
  // позначені викликом `t('…')` у місці літерала. Беремо рівно їх: усе інше в коді — не текст
  // для гравця, і перекладати його не можна.
  for (const f of srcFiles('src')) {
    // Коментарі прибираємо: приклад `t('…')` у доккоментарі — не рядок гри.
    const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*/g, ' ');
    // Без регулярки: шукаємо літерал t('…') посимвольно — так простіше й надійніше, ніж
    // екранувати лапки в патерні. Перед «t» має стояти не-ідентифікатор, інакше зловимо sort('…').
    for (const MARK of MARKS) {
    let i = code.indexOf(MARK);
    while (i >= 0) {
      const before = i > 0 ? code[i - 1] : ' ';
      const close = code.indexOf(END, i + MARK.length);
      const raw = close < 0 ? '' : code.slice(i + MARK.length, close);
      if (close >= 0 && !/[A-Za-z0-9_$.]/.test(before) && !raw.includes(NL) && isUkr(raw)) {
        const hash = srcHash(raw);
        if (!seen.has(hash)) {
          seen.add(hash);
          out.push({ hash, file: f.split(SEP).join('/'), path: 't()', src: raw });
        }
      }
      i = code.indexOf(MARK, i + MARK.length);
    }
    }
  }
  return out;
}

function srcFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...srcFiles(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

function walk(v: unknown, file: string, path: string, out: Row[], seen: Set<string>, key?: string): void {
  if (typeof v === 'string') {
    if (!isUkr(v)) return;
    if (key && SKIP_KEYS.has(key)) return;
    if (key && !PROSE_KEYS.has(key)) return;
    const hash = srcHash(v);
    if (seen.has(hash)) return;          // однаковий текст — один запис у карті
    seen.add(hash);
    out.push({ hash, file, path, src: v });
    return;
  }
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, file, `${path}[${i}]`, out, seen, key)); return; }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, file, `${path}.${k}`, out, seen, k);
  }
}

export const readMap = (): Record<string, string> => JSON.parse(readFileSync(MAP, 'utf8'));

// CLI виконується тільки при прямому запуску: тест імпортує `collect` і `srcHash` із цього ж
// файлу, і запускати команду під час імпорту не можна.
const isCli = /i18n\.ts$/.test(process.argv[1] ?? '');
const cmd = process.argv[2] ?? 'stat';
if (isCli) {
const rows = collect();
const map = readMap();

if (cmd === 'stat') {
  const per: Record<string, [number, number, number]> = {};
  for (const r of rows) {
    const p = (per[r.file] ??= [0, 0, 0]);
    p[0] += 1; p[2] += r.src.length;
    if (map[r.hash]) p[1] += 1;
  }
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(pad('файл', 22) + pad('рядків', 9) + pad('перекладено', 14) + 'знаків');
  let n = 0, done = 0, chars = 0;
  for (const [f, [a, b, c]] of Object.entries(per).sort((x, y) => y[1][2] - x[1][2])) {
    console.log(pad(f, 22) + pad(String(a), 9) + pad(`${b} (${Math.round(b / a * 100)}%)`, 14) + c);
    n += a; done += b; chars += c;
  }
  console.log(`\nразом: ${done} з ${n} рядків (${Math.round(done / n * 100)}%), ${chars} знаків джерела`);
} else if (cmd === 'take') {
  const file = process.argv[3];
  const limit = Number(process.argv[4] ?? 40);
  const todo = rows.filter((r) => (!file || r.file === file) && !map[r.hash]).slice(0, limit);
  console.log(JSON.stringify(Object.fromEntries(todo.map((r) => [r.hash, r.src])), null, 2));
  console.error(`// ${todo.length} рядків з ${file ?? 'усіх файлів'}`);
} else if (cmd === 'orphans') {
  const live = new Set(rows.map((r) => r.hash));
  const dead = Object.keys(map).filter((h) => !live.has(h));
  console.log(dead.length ? `записів без оригіналу: ${dead.length}\n` + dead.join('\n') : 'сиріт немає');
} else {
  console.error('команди: stat | take <файл> [N] | orphans');
  process.exit(1);
}
}
