import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

// Кнопка «Назад» Android (18.10, чекліст релізу M50). Без обробника WebView гортає історію
// хешів, і «Назад» посеред матчу мовчки викидав на титул — а збереження в нас лише після матчу.
// Тепер: титул — вихід із гри; налаштування, «Про гру», слоти, картка, ESPM-профіль — крок назад;
// усередині гри (#/play: матч, лист, тиждень, ESPM, «Y», дошка) — пауза, ще раз — закрити її
// (PauseMenu слухає `pause-back` так само, як Escape). Поки йде заставка — нічого: її і так
// закриває тап, а вихід із гри на першій секунді частіше випадковий.

const isTitle = (h: string) => h === '' || h === '#' || h === '#/';

export function installBackButton() {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('backButton', () => {
    if (document.documentElement.classList.contains('launching')) return;
    const h = location.hash;
    if (isTitle(h)) { void App.exitApp(); return; }
    if (h.startsWith('#/play')) { window.dispatchEvent(new Event('pause-back')); return; }
    if (history.length > 1) history.back(); else location.hash = '#/';
  });
}
