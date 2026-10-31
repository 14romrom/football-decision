// Свайпи (плейтест 31.10: «це все ж застосунок, а не браузерна гра»). Свайп ліворуч — «Далі» там, де на
// екрані один крок уперед і нічого не вибирається: листи оповідача, кидок, свисток, дошка, картка, ESPM,
// стрічка матчу. Кнопка, яку можна натиснути свайпом, позначена `data-swipe="next"` — так видно в коді,
// що саме жест може зробити, і він ніколи не обере варіант, не відповість у «Y» і не запустить рекламу
// (лист паузи — навмисно без позначки: випадковий тап по рекламі AdMob вважає порушенням).
// Свайп праворуч — крок назад поза грою (налаштування, «Про гру», картка, профіль ESPM, слоти), як «Назад»
// Android. У грі назад немає: там «Назад» відкриває паузу, і жест її не дублює.
// Поки відкритий діалог (пауза, прожектор-підказка), свайп не робить нічого.

const MIN_DX = 70;
const MAX_MS = 700;
const isTitle = (h: string) => h === '' || h === '#' || h === '#/';

export function installSwipe() {
  let x0 = 0, y0 = 0, t0 = 0, on = false;
  window.addEventListener('touchstart', (e) => {
    on = e.touches.length === 1 && !(e.target as Element | null)?.closest('input, textarea, select, [data-no-swipe]');
    if (!on) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = performance.now();
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (!on) return;
    on = false;
    const p = e.changedTouches[0];
    const dx = p.clientX - x0, dy = p.clientY - y0;
    if (performance.now() - t0 > MAX_MS || Math.abs(dx) < MIN_DX || Math.abs(dy) > Math.abs(dx) * .5) return;
    if (document.querySelector('[role="dialog"]') || document.documentElement.classList.contains('launching')) return;
    if (dx < 0) {
      const btns = [...document.querySelectorAll<HTMLButtonElement>('[data-swipe="next"]')].filter((b) => !b.disabled && b.offsetParent !== null);
      btns[btns.length - 1]?.click();
      return;
    }
    const h = location.hash;
    if (isTitle(h) || h.startsWith('#/play')) return;
    if (history.length > 1) history.back(); else location.hash = '#/';
  }, { passive: true });
}
