// Кадры листов рассказчика: из `images/` (что рисует пользователь) в `public/img/scenes/<id>.webp`.
// Ключ — id сцены недели (`sc_*`) или разворота пролога/отпуска/финала (`scout`, `medical`…).
// APK работает офлайн, догрузить картинку сетью нельзя, поэтому вес имеет значение: 18 кадров в JPEG —
// почти 12 МБ, в webp — около 2 МБ при той же ширине. Ширина 1152 — как в исходниках: лист на телефоне
// уже, но кадр режется по центру и на планшете не мылится.
//   npx tsx tools/optimize-images.ts          — собрать всё, что изменилось
//   npx tsx tools/optimize-images.ts --force  — пересобрать всё
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

const SRC = 'images';
const OUT = 'public/img/scenes';
const WIDTH = 1152;
const QUALITY = 72;


const force = process.argv.includes('--force');
if (!existsSync(SRC)) { console.error(`нет папки ${SRC}`); process.exit(1); }
mkdirSync(OUT, { recursive: true });

// Підкладки матчдея (27.09) — не кадри сцен: вони йдуть на весь екран і збираються окремим проходом.
const isBackdrop = (f: string) => f.startsWith('programme_');
const files = readdirSync(SRC).filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !isBackdrop(f) && statSync(join(SRC, f)).isFile());
let done = 0, skipped = 0, before = 0, after = 0;

for (const file of files) {
  const stem = basename(file, extname(file));
  const id = stem;
  const src = join(SRC, file);
  const out = join(OUT, id + '.webp');
  const srcStat = statSync(src);
  before += srcStat.size;

  if (!force && existsSync(out) && statSync(out).mtimeMs >= srcStat.mtimeMs) {
    after += statSync(out).size;
    skipped++;
    continue;
  }
  const info = await sharp(src).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(out);
  after += info.size;
  done++;
  const kb = (n: number) => (n / 1024).toFixed(0) + ' КБ';
  console.log(`${id.padEnd(24)} ${kb(srcStat.size).padStart(8)} → ${kb(info.size).padStart(8)}`);
}

// Підкладки матчдея: `images/programme_home.jpg` і `programme_away.jpg` → `public/img/<id>.webp`.
// Вертикальний кадр на весь екран, тому ширина більша за кадри сцен: 1240 вистачає і на планшет.
const BACKDROP_OUT = 'public/img';
const BACKDROP_WIDTH = 1240;
for (const file of readdirSync(SRC).filter((f) => isBackdrop(f) && /\.(jpe?g|png|webp)$/i.test(f))) {
  const id = basename(file, extname(file));
  const src = join(SRC, file);
  const out = join(BACKDROP_OUT, id + '.webp');
  const srcStat = statSync(src);
  before += srcStat.size;
  if (!force && existsSync(out) && statSync(out).mtimeMs >= srcStat.mtimeMs) { after += statSync(out).size; skipped++; continue; }
  const info = await sharp(src).resize({ width: BACKDROP_WIDTH, withoutEnlargement: true }).webp({ quality: 74 }).toFile(out);
  after += info.size;
  done++;
  console.log(`підкладка ${id.padEnd(20)} ${(info.size / 1024).toFixed(0).padStart(4)} КБ`);
}

// Аватари стрічки (27.09): `<хендл без @>.(png|jpg|webp)` → `public/img/avatars/<хендл>.webp`.
// Кружок 40 CSS px, на телефоні з трійною щільністю це 120 — тому 128 і якість вища, ніж у кадрів:
// картинка дрібна, артефакти на обличчі видно одразу. Немає файлу — літера на кольоровому колі
// (ui/PostsScreen.tsx:Avatar), тому аватарки можна робити частинами.
// Папок кілька, бо малюються вони партіями й лежать там, куди їх поклали: фото — в `y_avatars`,
// логотипи — в `y_avatars/png` (поруч лежать svg-джерела, їх скрипт не бере: все одно растр у 128 px).
// Один хендл у двох папках — перемагає перша в списку.
const AV_DIRS = ['avatars', 'y_avatars', join('y_avatars', 'png')].map((d) => join(SRC, d));
const AV_OUT = 'public/img/avatars';
const AV_WIDTH = 128;
{
  const sources = new Map<string, string>();
  for (const dir of AV_DIRS.filter(existsSync)) {
    for (const file of readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))) {
      const id = basename(file, extname(file)).replace(/^@/, '');
      if (!sources.has(id)) sources.set(id, join(dir, file));
    }
  }
  if (sources.size > 0) mkdirSync(AV_OUT, { recursive: true });
  for (const [id, src] of sources) {
    const out = join(AV_OUT, id + '.webp');
    const srcStat = statSync(src);
    before += srcStat.size;
    if (!force && existsSync(out) && statSync(out).mtimeMs >= srcStat.mtimeMs) { after += statSync(out).size; skipped++; continue; }
    const info = await sharp(src).resize({ width: AV_WIDTH, height: AV_WIDTH, fit: 'cover' }).webp({ quality: 82 }).toFile(out);
    after += info.size;
    done++;
    console.log(`avatar ${id.padEnd(24)} ${(info.size / 1024).toFixed(0).padStart(4)} КБ`);
  }
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + ' МБ';
console.log(`\nготово: ${done}, без змін: ${skipped}`);
console.log(`вага: ${mb(before)} → ${mb(after)}`);
