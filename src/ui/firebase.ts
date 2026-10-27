import { Capacitor } from '@capacitor/core';
import { ConsentStatus, ConsentType, FirebaseAnalytics } from '@capacitor-firebase/analytics';
import { setSink, track } from '../telemetry/analytics';
import { readCareer } from '../telemetry/career-storage';
import { consentRegion } from './ads';

// Приймач аналітики на телефоні (M49, 20.10): Firebase Analytics, проєкт `inside-the-box-f6608`
// (android/app/google-services.json — не секрет, лише адреса проєкту). У браузері (Pages, dev) приймача
// немає: події йдуть у консоль розробника і далі нікуди.
//
// **Згода — за регіоном, а не одним вікном на старті** (рішення користувача 20.10). Вікно Google (UMP)
// гра показує лише перед першою рекламою, після першого матчу, — щоб не ламати «Звук першим». Тому:
//  - за умовчанням (маніфест) усе вимкнено: ні рекламного ID, ні сховища аналітики — Firebase шле лише
//    знеособлені сигнали без ідентифікаторів (Consent Mode);
//  - UMP без вікна каже, чи потрібна згода тут: поза ЄЕЗ і UK (`NOT_REQUIRED`) вмикаємо сховище
//    аналітики одразу, з першого екрана — так воронка прологу видна повністю;
//  - у ЄЕЗ і UK лишаємо вимкненим назавжди: вікно AdMob питає про рекламу, а не про аналітику, і
//    «погодився на рекламу» не означає «погодився на аналітику». Ціна — неповна воронка гравців із ЄС;
//    основна аудиторія — Україна, її це не стосується.
//  - немає мережі на старті — регіон невідомий, сесія лишається знеособленою.
// Рекламний ID для аналітики не збираємо ніде (`google_analytics_adid_collection_enabled` = false).

export function installAnalytics() {
  if (!Capacitor.isNativePlatform()) return;
  setSink({
    event: (name, params) => { void FirebaseAnalytics.logEvent({ name, params }).catch(() => {}); },
    screen: (name) => { void FirebaseAnalytics.setCurrentScreen({ screenName: name }).catch(() => {}); },
    user: (props) => {
      for (const [key, value] of Object.entries(props)) void FirebaseAnalytics.setUserProperty({ key, value }).catch(() => {});
    },
  });
  void consentRegion().then(async (region) => {
    if (region !== 'other') return;
    await FirebaseAnalytics.setConsent({ type: ConsentType.AnalyticsStorage, status: ConsentStatus.Granted }).catch(() => {});
    firstLaunch();
  });
}

// Свій «перший запуск» (27.10): системний `first_open` Firebase шле в першу ж секунду, ще до відповіді
// UMP, тобто без згоди — і GA4 його в звітах не показує, «нові користувачі» там завжди 0. Тому шлемо
// своє, вже після згоди, раз на встановлення. Хто встановив гру раніше (є збережена кар'єра), подію
// не отримує: інакше оновлення порахувало б усіх старих гравців новими.
const FIRST_KEY = 'football-decision.first-launch.v1';
function firstLaunch() {
  try {
    if (localStorage.getItem(FIRST_KEY)) return;
    localStorage.setItem(FIRST_KEY, '1');
    if (readCareer().matchesPlayed > 0 || readCareer().prologue) return;
  } catch { return; }
  track('first_launch');
}
