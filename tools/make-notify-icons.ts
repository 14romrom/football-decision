// Картинки сповіщень M51 (макет «Сповіщення й відгук», 18.10).
//   notif_<хто>.png — «велика іконка» праворуч у сповіщенні: хто пише. Аватари з «Y» там, де вони є
//     (Тібо, дівчина футболіста, вальмарець); Новак — фрагмент кадру бази поруч із Реєсом; трамвай —
//     фрагмент кадру прологу; ESPM — знак сайту; Его — літера в кольорі голосу, як підпис голосу в матчі.
//   ic_stat_dice.png — значок у рядку стану. Android малює його лише за прозорістю (білим), тож це
//     силует: обриси двох кубиків, як на іконці застосунку. Без нього система показала б білий квадрат.
//
// Запуск: npx tsx tools/make-notify-icons.ts
import sharp, { type Sharp } from 'sharp';

const RES = 'android/app/src/main/res';
const LARGE = 192;

const crop = (src: string, box: { left: number; top: number; width: number; height: number }) =>
  sharp(src).extract(box).resize(LARGE, LARGE).png({ compressionLevel: 9 });
const square = (src: string) => sharp(src).resize(LARGE, LARGE, { fit: 'cover' }).png({ compressionLevel: 9 });
const badge = (bg: string, fg: string, text: string, size: number, family: string) => sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGE}" height="${LARGE}"><rect width="100%" height="100%" fill="${bg}"/>` +
  `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="${family}" font-weight="700" font-size="${size}" fill="${fg}">${text}</text></svg>`,
)).png({ compressionLevel: 9 });

const large: Record<string, Sharp> = {
  coach: crop('public/img/scenes/base.webp', { left: 560, top: 330, width: 230, height: 230 }),
  // Круглі аватари «Y» трохи збільшено, щоб білий фон за колом пішов за маску.
  dm: sharp('public/img/avatars/thibault_6.webp').resize(LARGE + 24, LARGE + 24).extract({ left: 12, top: 12, width: LARGE, height: LARGE }).png(),
  wag: square('public/img/avatars/wag_in_progress.webp'),
  ultra: sharp('public/img/avatars/valmara_ultra.webp').resize(LARGE + 24, LARGE + 24).extract({ left: 12, top: 12, width: LARGE, height: LARGE }).png(),
  tram: crop('public/img/scenes/tram.webp', { left: 0, top: 110, width: 300, height: 300 }),
  espm: badge('#be3c1c', '#ffffff', 'ESPM', 50, 'Arial, Helvetica, sans-serif'),
  // Літера однакова в обох мовах: кирилична «Е» й латинська «E» — один знак на око.
  ego: badge('#e0794f', '#141413', 'E', 112, 'Arial Narrow, Arial, sans-serif'),
};
// Круг із прозорими кутами: частина аватарів «Y» уже кругла на білому, і без маски в сповіщенні
// стирчали б білі кути. Круг на всіх — однаковий ряд, як у макеті.
const circle = Buffer.from(`<svg width="${LARGE}" height="${LARGE}"><circle cx="${LARGE / 2}" cy="${LARGE / 2}" r="${LARGE / 2 - 4}" fill="#fff"/></svg>`);
for (const [who, img] of Object.entries(large)) {
  const flat = await img.toBuffer();
  await sharp(flat).resize(LARGE, LARGE).composite([{ input: circle, blend: 'dest-in' }]).png({ compressionLevel: 9 }).toFile(`${RES}/drawable-nodpi/notif_${who}.png`);
  console.log(`notif_${who}.png`);
}

// Силует: два кубики з повернутими гранями, обрис 2 dp — читається на 24 dp.
const dice = (px: number) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round">` +
  '<rect x="2.5" y="7" width="10" height="10" rx="2" transform="rotate(-10 7.5 12)"/>' +
  '<rect x="11.5" y="6" width="10" height="10" rx="2" transform="rotate(8 16.5 11)"/>' +
  '<circle cx="7.5" cy="12" r="1.3" fill="#fff" stroke="none"/><circle cx="16.5" cy="11" r="1.3" fill="#fff" stroke="none"/></svg>',
);
for (const [dpi, px] of [['mdpi', 24], ['hdpi', 36], ['xhdpi', 48], ['xxhdpi', 72], ['xxxhdpi', 96]] as const) {
  await sharp(dice(px)).png({ compressionLevel: 9 }).toFile(`${RES}/drawable-${dpi}/ic_stat_dice.png`);
}
console.log('ic_stat_dice.png × 5');
