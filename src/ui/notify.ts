import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { InAppReview } from '@capacitor-community/in-app-review';
import { clubName, NOTIFY, ROSTER } from '../content';
import { awayState, planAway } from '../engine/notify';
import { ourFixture } from '../engine/season';
import { fillNames } from '../engine/names';
import { readCareer } from '../telemetry/career-storage';
import { readSeason } from '../telemetry/season-storage';
import { readSettings, writeSettings } from '../telemetry/settings';
import { t } from '../content/i18n';

// Сповіщення й відгук на телефоні (M51, 18.10). Сервера немає: коли гру згортають, у чергу Android
// стають три сповіщення (1, 3 і 7 днів), коли відкривають — черга знімається. Тому «тиша, доки не
// зайде» виходить сама: після третього нічого не заплановано, а новий відлік починається тільки з
// наступного згортання. У браузері (Pages, dev) усе це мовчить — `native()`.
//
// Картинки праворуч у сповіщенні — «велика іконка», файли `res/drawable/notif_<хто>.png`
// (tools/make-notify-icons.ts); значок у рядку стану — білий силует `ic_stat_dice`.

const IDS = [5101, 5102, 5103];
const CHANNEL = 'city';
const native = () => Capacitor.isNativePlatform();

export async function notifyPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!native()) return 'denied';
  try {
    const p = await LocalNotifications.checkPermissions();
    return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
  } catch { return 'denied'; }
}

/** Системне вікно дозволу Android 13+ (на старших дозвіл є одразу). */
export async function requestNotify(): Promise<boolean> {
  if (!native()) return false;
  try { return (await LocalNotifications.requestPermissions()).display === 'granted'; } catch { return false; }
}

export async function cancelAway() {
  if (!native()) return;
  try { await LocalNotifications.cancel({ notifications: IDS.map((id) => ({ id })) }); } catch { /* немає що знімати */ }
}

/** Поставити три сповіщення від поточного стану кар'єри. Викликається, коли гру згортають. */
export async function scheduleAway() {
  if (!native() || !readSettings().notify) return;
  if ((await notifyPermission()) !== 'granted') return;
  const career = readCareer();
  const season = readSeason();
  const state = awayState(career, season);
  await cancelAway();
  if (!state || !season) return;
  const fx = ourFixture(season);
  const next = fx ? clubName(fx.opponentKey) : null;
  const extra: Record<string, string> = next ? { next: next.nom, 'next.gen': next.gen } : {};
  const notes = planAway(NOTIFY, state, new Date(), next ? next.gen : null);
  try {
    await LocalNotifications.schedule({
      notifications: notes.map((n, i) => ({
        id: IDS[i],
        title: fillNames(n.title, ROSTER, extra),
        body: fillNames(n.body, ROSTER, extra),
        schedule: { at: n.at, allowWhileIdle: true },
        channelId: CHANNEL,
        smallIcon: 'ic_stat_dice',
        largeIcon: `notif_${n.who}`,
        iconColor: '#be3c1c',
      })),
    });
  } catch { /* без дозволу чи в старому WebView — тихо, гра від цього не залежить */ }
}

/** Слухачі: згорнули — поставити, відкрили — зняти. Один раз на старті застосунку. */
export function installNotify() {
  if (!native()) return;
  void LocalNotifications.createChannel({ id: CHANNEL, name: t('Місто пише'), description: t('Тренер, партнери й ESPM, поки тебе немає'), importance: 3 }).catch(() => {});
  void cancelAway();
  void App.addListener('appStateChange', ({ isActive }) => { void (isActive ? cancelAway() : scheduleAway()); });
}

/** Вимкнули в налаштуваннях — черга знімається одразу, навіть те, що вже стояло. */
export function setNotify(on: boolean) {
  writeSettings({ ...readSettings(), notify: on });
  if (!on) void cancelAway();
}

/** Чи показувати лист-прохання про дозвіл: телефон, після першого матчу, ще не питали. */
export function notifyAskDue(matchesPlayed: number): boolean {
  return native() && matchesPlayed >= 1 && !readSettings().notifyAsked;
}
export function markNotifyAsked() { writeSettings({ ...readSettings(), notifyAsked: true }); }

/** Вікно оцінки Google Play. Чи з'явиться воно, вирішує Google (і показує не частіше кількох разів на
 *  рік); дізнатися, чи показав, не можна. Тому якщо плагін упав — відкриваємо сторінку гри в магазині. */
export async function requestReview() {
  writeSettings({ ...readSettings(), reviewDone: true });
  if (!native()) return;
  try { await InAppReview.requestReview(); }
  catch { openStorePage(); }
}
export function reviewLater() { writeSettings({ ...readSettings(), reviewLaterAt: Date.now() }); }
export const reviewAvailable = native;

/** Сторінка гри в Google Play. Кнопка «Оцінити гру» (26.10, звіт закритого тесту) веде сюди, а не у вікно
 *  оцінки: Google забороняє викликати його кнопкою — воно для моменту після гри й показується не завжди. */
export function openStorePage() {
  window.open('https://play.google.com/store/apps/details?id=ua.footballdecision.app', '_blank');
}
