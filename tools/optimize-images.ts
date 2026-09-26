// Кадры якорей: из `images/` (что рисует пользователь) в `public/img/anchors/<id>.webp` (что едет в сборку).
// APK работает офлайн, догрузить картинку сетью нельзя, поэтому вес имеет значение: 18 кадров в JPEG —
// почти 12 МБ, в webp — около 2 МБ при той же ширине. Ширина 1152 — как в исходниках: лист на телефоне
// уже, но кадр режется по центру и на планшете не мылится.
//   npx tsx tools/optimize-images.ts          — собрать всё, что изменилось
//   npx tsx tools/optimize-images.ts --force  — пересобрать всё
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

const SRC = 'images';
const OUT = 'public/img/anchors';
const WIDTH = 1152;
const QUALITY = 72;

/** Кадры сцен, которых в коде ещё нет (M28): имя файла → id будущей сцены. */
const RENAME: Record<string, string> = {
  'Ночь, 0320 (M28)': 'sc_night_before',
  'первая травма пролог': 'sc_first_injury',
  'осознание повторной травмы (лето после первого сезона)': 'sc_pitch_no_date',
  'провальный медосмотр после травмы': 'sc_medical',
};

const force = process.argv.includes('--force');
if (!existsSync(SRC)) { console.error(`нет папки ${SRC}`); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
let done = 0, skipped = 0, before = 0, after = 0;

for (const file of files) {
  const stem = basename(file, extname(file));
  const id = RENAME[stem] ?? stem;
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

const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + ' МБ';
console.log(`\nготово: ${done}, без змін: ${skipped}`);
console.log(`вага: ${mb(before)} → ${mb(after)}`);
