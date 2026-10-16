// Іконка застосунку з титульного кадру (`public/img/title.webp`).
//
// Чому з титулу: це єдина картинка, яку гравець бачить до того, як щось натиснув, і іконка на
// лаунчері має бути тим самим кадром — інакше значок і перший екран виглядають як дві різні гри.
// Титул навмисно притушений під тему («так Реєса бачить Его»), а іконці темрява шкодить: на
// екрані телефона вона стоїть серед яскравих значків і просто зникає. Тому тут кадр **світліший**
// за титульний (`BRIGHT`), з невеликим підйомом насиченості, щоб червона футболка трималася на
// 48 px.
//
// Два різні кадри, і це навмисно:
//   FULL — повний кадр у шар адаптивної іконки (API 26+). Лаунчер сам маскує її колом або
//          квадратом, і видно приблизно центральні дві третини, тому кадр береться ширший:
//          після маски виходить якраз номер і корпус.
//   TIGHT — тісніший кадр для legacy-PNG (до API 26) і для 512×512 в листинг Play: там маски
//          немає, картинка показується як є.
//
// Запуск: npx tsx tools/make-icon.ts
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'public/img/title.webp';                  // 800×960
const RES = 'android/app/src/main/res';
const FULL = { left: 105, top: 0, width: 540, height: 540 };
const TIGHT = { left: 160, top: 20, width: 470, height: 470 };
const BRIGHT = 1.7, SAT = 1.15;

/** Густини Android: legacy-значок у dp 48, шар адаптивної іконки — 108. */
const DENSITIES: [string, number, number][] = [
  ['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
];

const cut = (crop: typeof FULL, px: number) =>
  sharp(SRC).extract(crop).modulate({ brightness: BRIGHT, saturation: SAT })
    .resize(px, px, { fit: 'cover' }).png({ compressionLevel: 9 });

/** Круглий legacy-значок (`ic_launcher_round`) маски від системи не отримує — ріжемо самі. */
const round = async (px: number) => {
  const mask = Buffer.from(`<svg width="${px}" height="${px}"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}" fill="#fff"/></svg>`);
  return sharp(await cut(TIGHT, px).toBuffer())
    .composite([{ input: mask, blend: 'dest-in' }]).png({ compressionLevel: 9 }).toBuffer();
};

for (const [dpi, legacy, adaptive] of DENSITIES) {
  const dir = `${RES}/mipmap-${dpi}`;
  await cut(FULL, adaptive).toFile(`${dir}/ic_launcher_foreground.png`);
  await cut(TIGHT, legacy).toFile(`${dir}/ic_launcher.png`);
  await sharp(await round(legacy)).toFile(`${dir}/ic_launcher_round.png`);
  console.log(`${dpi}: foreground ${adaptive}, launcher ${legacy}`);
}

// Значок для сторінки в Play — окремий файл, у застосунок не їде.
mkdirSync('store', { recursive: true });
await cut(TIGHT, 512).toFile('store/icon-512.png');
console.log('store/icon-512.png — у листинг Play');
