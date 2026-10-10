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

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/content';
const MAP = join(DIR, 'i18n/en.json');
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

/** Значення, яке лишається даними, хоч у ньому й кирилиця. Список порожній, і це не недогляд:
 *  усі кириличні значення в контенті — текст, який гравець читає. Правило тепер зворотне до
 *  попереднього («проза лише під відомим ключем») — і саме попереднє коштувало шести дірок.
 *
 *  Останні три знайдено грою 10.10, уже після того, як п'ять інших закрито тестами. Усі троє —
 *  один і той самий механізм: ім'я ключа в різних файлах означає різне, тому класифікація за
 *  іменем промахується мовчки.
 *    - `rom` у `chapters.json` — не римська цифра, а «Глава I»;
 *    - `shot` у `ending.json` — не id кадру, а абзац дзвінка скаута;
 *    - `voice` у `flavor.json` — не ідентифікатор, а підпис капітеллю («ТРИБУНИ»), і він же ключ
 *      `FLAVOR_CLASS` у `RollView`. Нижче рядок лишався кирилицею **і** втрачав колір голосу.
 *
 *  Якщо колись з'явиться кириличний ідентифікатор, його ключ — сюди, і поруч причина. */
const SKIP_KEYS = new Set<string>([]);

// Що вважається українським рядком. Дві поправки, обидві знайдені грою, не звітом (04.10):
//
// **Довжини немає навмисно.** Поріг «понад два знаки» викидав шапку таблиці ESPM (`І В Н П М О` —
// ігри, виграші, нічиї, поразки, мʼячі, очки) і «ок» у стрічці: короткий рядок під ключем прози —
// такий самий текст, як довгий, а `t('…')` у коді вже сказав, що це текст.
//
// **Лапки — теж мова.** `«{0}»` навколо назви клубу не має жодної кириличної літери, тому рядок
// не потрапляв у карту і лишався з українськими лапками в англійській збірці — поруч із
// перекладеним рядком, де лапки вже були англійські.
const isUkr = (s: string) => /[а-яіїєґА-ЯІЇЄҐ«»„“]/.test(s) && s.trim().length > 0;

/** Один розбір літералів коду на два питання: що взяти в карту і що лишилося необгорнутим. Раніше
 *  це були два різні скани, і вони розходилися: карта шукала `t('…')` приклеєним до назви функції й
 *  не бачила `tIn(lang, '…')`, а перевірка — бачила і сварилася. Тепер правило одне.
 *
 *  **Обгорнутий** — літерал, який стоїть першим аргументом `t`/`tf`/`base` або другим у
 *  `tIn`/`tfIn` (там перший — мова). Перевірка прив'язана до місця літерала, а не «десь у рядку»:
 *  інакше `ord(n, 'я')` у середині виклику `tf('Жовта — вже {0}…', …)` зійшов би за обгорнутий.
 *  Попередній рядок теж дивимо — довгий виклик переноситься.
 *
 *  **Виняток** — позначка `i18n-skip` у рядку: вона знімає з обліку рівно необгорнуті літерали цього
 *  рядка (українське закінчення, повідомлення для розробника, пояснення в `CANON_SCENES.why`), а
 *  рядок гри в тому ж виклику лишається в карті. До цієї точності позначка гасила рядок цілком і
 *  з'їдала сусіда — так зникли «Жовта — вже 3-я» і «на 62-й». */
const WRAPPED = new RegExp(
  '(?:^|[^A-Za-z0-9_$.])(?:t|tf|base)\\(\\s*$'                        // t('…'), tf('…', x), base('…')
  + '|(?:^|[^A-Za-z0-9_$.])(?:tIn|tfIn)\\([^,]*,\\s*$',               // tIn(lang, '…'), tfIn(langOf(x), '…', y)
);

export function codeLiterals(source: string): { src: string; line: number; wrapped: boolean; kind: 'literal' | 'jsx' }[] {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  // Коментарі вибілюємо, а не викидаємо: довжина збігається з джерелом, тому зсуви й номери рядків
  // ті самі (приклад `t('…')` у доккоментарі — не рядок гри).
  const code = source.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
  const lines = source.split(NL);
  const marked = (line: number) => (lines[line - 1] ?? '').includes('i18n-skip');

  const out: { src: string; line: number; wrapped: boolean; kind: 'literal' | 'jsx' }[] = [];
  const LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
  const masked = code.split('');
  for (let m = LITERAL.exec(code); m; m = LITERAL.exec(code)) {
    const end = m.index + m[0].length;
    for (let i = m.index; i < end; i++) if (masked[i] !== NL) masked[i] = ' ';
    const line = code.slice(0, m.index).split(NL).length;
    const from = code.lastIndexOf(NL, Math.max(0, code.lastIndexOf(NL, m.index) - 1)) + 1;
    const wrapped = WRAPPED.test(code.slice(from, m.index));
    if (!wrapped && marked(line)) continue;
    out.push({ src: m[0].slice(1, -1), line, wrapped, kind: 'literal' });
  }
  // Те, що лишилося з кирилицею поза літералами, — текст прямо в JSX. Регулярний літерал із
  // кирилицею (`/⟨ціна⟩/g`) не текст, а патерн, і береться лише там, де вираз справді починається:
  // інакше оператор ділення («{x / 1000} с») склеює два слеші і з'їдає живий текст між ними.
  const rest = masked.join('').replace(/(?<=[(,=:[!&|?])\s?\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, blank);
  rest.split(NL).forEach((l, i) => {
    if (isUkr(l) && !marked(i + 1)) out.push({ src: l.trim(), line: i + 1, wrapped: false, kind: 'jsx' });
  });
  return out;
}

export type Row = { hash: string; file: string; path: string; src: string };

export function collect(): Row[] {
  const out: Row[] = [];
  const seen = new Set<string>();
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
    const data = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
    walk(data, f, '', out, seen);
  }
  // Рядки, що живуть у коді (ярлики кнопок, назви голосів, шматки фраз, які рушій склеює сам),
  // позначені викликом функції мовного шару в місці літерала. Беремо рівно їх: усе інше в коді —
  // не текст для гравця, і перекладати його не можна. Та сама перевірка з іншим знаком стоїть у
  // `rawCodeStrings`: що не обгорнуте — то дірка, і тест про неї скаже.
  for (const f of srcFiles('src')) {
    for (const lit of codeLiterals(readFileSync(f, 'utf8'))) {
      if (!lit.wrapped || !isUkr(lit.src)) continue;
      const hash = srcHash(lit.src);
      if (seen.has(hash)) continue;
      seen.add(hash);
      out.push({ hash, file: f.split(SEP).join('/'), path: 't()', src: lit.src });
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

// ——— дві дірки, які `collect` не бачить за визначенням ————————————————————————————
// Обидві коштували часу 04.10: звіт показував 100%, а в англійській збірці лишався український
// текст. Тому їх тримає тест (`tests/i18n.test.ts`), а не око.

/** Кирилиця в коді, яку `collect` не бере, бо вона не `t('…')`:
 *  - `literal` — шаблонний рядок із підстановкою (`` `Тур ${a} з ${b}` ``): має бути `tf()`;
 *  - `jsx` — текст прямо в розмітці (`<h4>Бомбардири «{x}»</h4>`): це взагалі не літерал.
 *  Виняток позначається коментарем `i18n-skip` у тому ж рядку — повідомлення для розробника,
 *  українське закінчення для `ord`, пояснення в `CANON_SCENES.why`. */
export function rawCodeStrings(): { file: string; line: number; kind: 'literal' | 'jsx'; text: string }[] {
  const out: { file: string; line: number; kind: 'literal' | 'jsx'; text: string }[] = [];
  for (const f of srcFiles('src')) {
    const file = f.split(SEP).join('/');
    for (const lit of codeLiterals(readFileSync(f, 'utf8'))) {
      if (lit.wrapped || !isUkr(lit.src)) continue;
      out.push({ file, line: lit.line, kind: lit.kind, text: lit.src.slice(0, 80) });
    }
  }
  return out;
}

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
} else if (cmd === 'rows') {
  // Те саме, що `take`, але з контекстом: шлях у JSON каже, чий це рядок — який голос у `flavor`,
  // який акаунт у `posts`, яка сім'я і який варіант в `episodes`. Без цього регістр не вгадати:
  // фан пише малими, видання чисто, ЕГО і ТІЛО говорять по-різному.
  const file = process.argv[3];
  const limit = Number(process.argv[4] ?? 60);
  const todo = rows.filter((r) => (!file || r.file === file) && !map[r.hash]).slice(0, limit);
  for (const r of todo) console.log(`${r.hash}  ${r.path}\n    ${r.src}`);
  console.error(`// ${todo.length} рядків з ${file ?? 'усіх файлів'}`);
} else if (cmd === 'merge') {
  // Єдиний спосіб дописати переклад: ключі рахує сам інструмент, тому зовні хеш рахувати **не
  // треба й не можна**. Коштувало часу: окремий скрипт рахував хеш по кодових точках, а рушій —
  // по кодових одиницях UTF-16, і на емодзі (🔥, 🙈) вони розійшлися. Тут такої помилки нема за
  // побудовою, а ключ без живого оригіналу команда назве одразу.
  const src = process.argv[3];
  if (!src) { console.error('merge <файл.json> — карта «хеш → переклад»'); process.exit(1); }
  const add = JSON.parse(readFileSync(src, 'utf8')) as Record<string, string>;
  const live = new Map(rows.map((r) => [r.hash, r.src]));
  const unknown = Object.keys(add).filter((h) => !h.startsWith('_') && !live.has(h));
  const next: Record<string, string> = { ...map };
  let added = 0, over = 0;
  for (const [h, v] of Object.entries(add)) {
    if (h.startsWith('_') || !live.has(h)) continue;     // `_comment…` можна лишати для себе
    if (next[h] === undefined) added += 1;
    else if (next[h] !== v) over += 1;
    next[h] = v;
  }
  writeFileSync(MAP, JSON.stringify(next, null, 2) + NL, 'utf8');
  console.log(`додано ${added}, перезаписано ${over}, усього ${Object.keys(next).length}`);
  if (unknown.length) {
    console.error(`\nключів без живого оригіналу: ${unknown.length} — не записано:`);
    for (const h of unknown.slice(0, 20)) console.error(`  ${h}`);
    process.exitCode = 1;
  }
} else if (cmd === 'orphans') {
  const live = new Set(rows.map((r) => r.hash));
  const dead = Object.keys(map).filter((h) => !live.has(h));
  console.log(dead.length ? `записів без оригіналу: ${dead.length}\n` + dead.join('\n') : 'сиріт немає');
} else {
  console.error('команди: stat | take <файл> [N] | rows <файл> [N] | merge <файл.json> | orphans');
  process.exit(1);
}
}
