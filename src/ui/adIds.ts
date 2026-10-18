// Ідентифікатори AdMob (M48, створено 18.10 в акаунті Valmara FC). Не секретні: їх однаково видно в
// APK, і Google так і задумав. Код реклами ще не написано — до нього тут лише адреси блоків.
// Доки гра не опублікована в Play й AdMob не перевірив застосунок, справжніх показів не буде;
// розробка йде на тестових блоках Google (`TEST_IDS`), справжні вмикаються лише в релізній збірці.

/** Застосунок «Inside the Box», Android. Іде в AndroidManifest як `com.google.android.gms.ads.APPLICATION_ID`. */
export const ADMOB_APP_ID = 'ca-app-pub-8998219288496303~4470175071';

/** Чотири блоки з плану M48: банери на ESPM і в «Y», ролик у паузі матчу й після матчу. */
export const AD_UNITS = {
  bannerEspm: 'ca-app-pub-8998219288496303/9677349855',
  bannerY: 'ca-app-pub-8998219288496303/7107026832',
  interstitialPause: 'ca-app-pub-8998219288496303/3167781821',
  interstitialAfterMatch: 'ca-app-pub-8998219288496303/1527572109',
} as const;

/** Офіційні тестові блоки Google — для розробки й debug-збірок: покази без ризику для акаунта. */
export const TEST_IDS = {
  banner: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
} as const;
