// Іконка застосунку: два кубики, 6 і 7, на крейдяній лінії штрафного під прожектором
// (`store/icon-source.jpg`, 1024×1024, згенерована картинка в стилі титулу).
//
// Чому кубики, а не гравець із титулу: фото футболіста на лаунчері нічим не відрізняється від
// сотні футбольних застосунків поруч. Кубики обіцяють саме механіку гри (рішення + кидок), газон
// і лінія кажуть «футбол», червона сімка тримає погляд, а «6 7» — ще й мем для молодших.
// Слабке місце — на 48 px футбол читається гірше, ніж кубики; це закриває назва в Play.
//
// Два кадри, і це навмисно:
//   FULL — шар адаптивної іконки (API 26+), 108 dp. Лаунчер показує лише центральні 72 dp і ще
//          маскує їх колом чи квадратом, тому шар у півтора раза ширший за видимий кадр. Оригіналу
//          на це не вистачає — поля добудовуються розмитою й затемненою копією самої картинки:
//          у спокої їх не видно, вони виринають тільки в анімації лаунчера (паралакс, стиснення).
//   TIGHT — кадр по кубиках для legacy-PNG (до API 26) і 512×512 у листинг Play: там маски
//          немає (Play лише скруглює кути), картинка показується як є.
//
// Запуск: npx tsx tools/make-icon.ts
import sharp, { type Sharp } from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'store/icon-source.jpg';                   // 1024×1024
const RES = 'android/app/src/main/res';
/** Кадр по кубиках: центр між ними, сторона з запасом під круглу маску. */
const TIGHT = { left: 128, top: 118, width: 780, height: 780 };
/** Шар адаптивної іконки: видимі 72 з 108 dp = TIGHT, отже шар = TIGHT × 1.5 навколо того ж центру. */
const LAYER = Math.round(TIGHT.width * 1.5);
/** Картинка темна; на лаунчері серед яскравих значків темрява зникає, особливо в темній темі. */
const BRIGHT = 1.12;

/** Оригінал на полотні LAYER×LAYER: під ним — розмита затемнена копія на весь шар. */
const layer = async () => {
  const cx = TIGHT.left + TIGHT.width / 2, cy = TIGHT.top + TIGHT.height / 2;
  const back = await sharp(SRC).resize(LAYER, LAYER).blur(40).modulate({ brightness: 0.6 }).toBuffer();
  // Край оригіналу розмитий у підкладку (40 px): жорсткий прямокутник видно в анімації лаунчера.
  const fade = await sharp(Buffer.from(`<svg width="1024" height="1024"><rect x="40" y="40" width="944" height="944" fill="#fff"/></svg>`))
    .blur(18).extractChannel(0).toBuffer();
  const img = await sharp(SRC).removeAlpha().joinChannel(fade).png().toBuffer();
  return sharp(back).composite([{
    input: img, left: Math.round(LAYER / 2 - cx), top: Math.round(LAYER / 2 - cy),
  }]).png().toBuffer();
};

const finish = (s: Sharp, px: number) =>
  s.modulate({ brightness: BRIGHT }).resize(px, px, { fit: 'cover', kernel: 'lanczos3' }).png({ compressionLevel: 9 });
const tight = (px: number) => finish(sharp(SRC).extract(TIGHT), px);

/** Круглий legacy-значок (`ic_launcher_round`) маски від системи не отримує — ріжемо самі. */
const round = async (px: number) => {
  const mask = Buffer.from(`<svg width="${px}" height="${px}"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}" fill="#fff"/></svg>`);
  return sharp(await tight(px).toBuffer())
    .composite([{ input: mask, blend: 'dest-in' }]).png({ compressionLevel: 9 }).toBuffer();
};

/** Густини Android: legacy-значок у dp 48, шар адаптивної іконки — 108. */
const DENSITIES: [string, number, number][] = [
  ['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
];

const full = await layer();
for (const [dpi, legacy, adaptive] of DENSITIES) {
  const dir = `${RES}/mipmap-${dpi}`;
  await finish(sharp(full), adaptive).toFile(`${dir}/ic_launcher_foreground.png`);
  await tight(legacy).toFile(`${dir}/ic_launcher.png`);
  await sharp(await round(legacy)).toFile(`${dir}/ic_launcher_round.png`);
  console.log(`${dpi}: foreground ${adaptive}, launcher ${legacy}`);
}

// Значок для сторінки в Play — окремий файл, у застосунок не їде.
mkdirSync('store', { recursive: true });
await tight(512).toFile('store/icon-512.png');
console.log('store/icon-512.png — у листинг Play');
