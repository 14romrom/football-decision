import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdPluginEvents, BannerAdPosition, BannerAdSize, InterstitialAdPluginEvents } from '@capacitor-community/admob';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { readSettings, writeSettings } from '../telemetry/settings';
import { AD_UNITS, TEST_IDS } from './adIds';

// Реклама й «Без реклами» на телефоні (M48, макет погоджено 17.10, рішення 18.10 — реклама вже в першій
// версії). Тут лише «як»: розклад — `engine/ads.ts`, місця показу — App (пауза в матчі, ролик між дошкою
// й ESPM) і екрани ESPM та «Y» (банер).
//
// **Згода (UMP) — перед першим запитом реклами, а не на старті гри.** Перші екрани гри — заставка й
// пролог — реклами не мають, і вікно Google поверх заставки зламало б «Звук першим». Тому `ensureAds()`
// кличуть ті, кому реклама вже потрібна (ESPM після першого матчу, пауза в другому); раз за сесію.
//
// **Тестові блоки скрізь, крім публічної збірки** (`__APP_CHANNEL__ === 'public'`): на закритому тесті й
// у debug показуються зразки Google з позначкою «Test Ad». Справжні покази зі своїх пристроїв AdMob
// вважає недійсним трафіком і може закрити акаунт.
//
// **Банер — нативна плашка внизу**, поверх WebView (усередину сторінки AdMob не вбудувати). Щоб вона не
// накрила прилиплі кнопки «Далі», її висота йде в CSS-змінну `--ad-banner`, а від неї рахуються відступи.

const native = () => Capacitor.isNativePlatform();
const PUBLIC = typeof __APP_CHANNEL__ === 'string' && __APP_CHANNEL__ === 'public';
const NO_ADS_ID = 'no_ads';

const unit = (kind: 'bannerEspm' | 'bannerY' | 'interstitialPause' | 'interstitialAfterMatch') =>
  PUBLIC ? AD_UNITS[kind] : kind.startsWith('banner') ? TEST_IDS.banner : TEST_IDS.interstitial;

/** Телефон (у браузері реклами й покупок немає взагалі). */
export const adsAvailable = native;
/** Реклама взагалі можлива: телефон і без покупки. Без мережі — вирішить сам AdMob (ролик не завантажиться). */
export const adsActive = () => native() && !readSettings().noAds;

let ready: Promise<boolean> | null = null;
let privacyRequired = false;

/** Ініціалізація й згода — один раз за сесію. `true` — можна просити рекламу. */
export function ensureAds(): Promise<boolean> {
  if (!adsActive()) return Promise.resolve(false);
  ready ??= (async () => {
    try {
      await AdMob.initialize({ initializeForTesting: !PUBLIC });
      let info = await AdMob.requestConsentInfo();
      if (!info.canRequestAds && info.isConsentFormAvailable) info = await AdMob.showConsentForm();
      privacyRequired = String(info.privacyOptionsRequirementStatus) === 'REQUIRED';
      void AdMob.addListener(BannerAdPluginEvents.SizeChanged, (s) => {
        document.documentElement.style.setProperty('--ad-banner', `${Math.round(s.height)}px`);
      });
      return info.canRequestAds;
    } catch { return false; }
  })();
  return ready;
}

/** Рядок «Конфіденційність реклами» в налаштуваннях: показувати лише там, де Google цього вимагає (ЄЕЗ, UK). */
export const privacyOptionsNeeded = () => privacyRequired;
export async function showPrivacyOptions() {
  try { await AdMob.showPrivacyOptionsForm(); } catch { /* форма недоступна — нічого не робимо */ }
}

/** Банер, поки відкрита сторінка (ESPM чи «Y»). Пішли зі сторінки — банер знімається, відступ зникає. */
export function useBanner(kind: 'bannerEspm' | 'bannerY') {
  useEffect(() => {
    let alive = true;
    void ensureAds().then((ok) => {
      if (!ok || !alive) return;
      void AdMob.showBanner({ adId: unit(kind), adSize: BannerAdSize.ADAPTIVE_BANNER, position: BannerAdPosition.BOTTOM_CENTER, margin: 0, isTesting: !PUBLIC }).catch(() => {});
    });
    return () => {
      alive = false;
      document.documentElement.style.setProperty('--ad-banner', '0px');
      if (native()) void AdMob.removeBanner().catch(() => {});
    };
  }, [kind]);
}

const prepared = new Set<string>();
/** Ролик уже завантажено — лише тоді лист паузи каже «Далі — реклама». */
export const adReady = (kind: 'interstitialPause' | 'interstitialAfterMatch') => adsActive() && prepared.has(kind);
/** Завантажити ролик заздалегідь (на старті матчу з паузою, на свистку перед роликом після матчу). */
export function prepareInterstitial(kind: 'interstitialPause' | 'interstitialAfterMatch') {
  void ensureAds().then((ok) => {
    if (!ok) return;
    AdMob.prepareInterstitial({ adId: unit(kind), isTesting: !PUBLIC }).then(() => prepared.add(kind), () => prepared.delete(kind));
  });
}

/** Показати ролик і дочекатися, поки його закриють. Не завантажився чи немає мережі — одразу далі:
 *  пауза в матчі лишається історією без ролика. Страховка від завислого SDK — 75 с. */
export async function showInterstitial(kind: 'interstitialPause' | 'interstitialAfterMatch'): Promise<void> {
  if (!adsActive() || !prepared.has(kind)) return;
  prepared.delete(kind);
  await new Promise<void>((resolve) => {
    const subs: Promise<{ remove: () => Promise<void> }>[] = [];
    const done = () => { clearTimeout(timer); subs.forEach((s) => void s.then((h) => h.remove())); resolve(); };
    const timer = setTimeout(done, 75_000);
    subs.push(AdMob.addListener(InterstitialAdPluginEvents.Dismissed, done));
    subs.push(AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, done));
    AdMob.showInterstitial().catch(done);
  });
}

// ——— «Без реклами» (2,99 $, невитратна покупка Google Play Billing) ———

/** Ціна з Play у валюті гравця; поки магазин не відповів — запасний рядок із макета. */
export async function noAdsPrice(): Promise<string | null> {
  if (!native()) return null;
  try {
    const { product } = await NativePurchases.getProduct({ productIdentifier: NO_ADS_ID, productType: PURCHASE_TYPE.INAPP });
    return product.priceString ?? null;
  } catch { return null; }
}

function grant() {
  writeSettings({ ...readSettings(), noAds: true });
  document.documentElement.style.setProperty('--ad-banner', '0px');
  if (native()) void AdMob.removeBanner().catch(() => {});
}

/** Купити. `true` — покупка пройшла (або вже була). Скасував — `false`, без повідомлень про помилку. */
export async function buyNoAds(): Promise<boolean> {
  if (!native()) return false;
  try {
    await NativePurchases.purchaseProduct({ productIdentifier: NO_ADS_ID, productType: PURCHASE_TYPE.INAPP });
    grant();
    return true;
  } catch {
    return restoreNoAds();
  }
}

/** Відновити покупку: інший телефон, перевстановлення, стерті дані. Також тихо на старті гри —
 *  повернення коштів у Play прибирає покупку з `getPurchases`, тоді реклама повертається. */
export async function restoreNoAds(): Promise<boolean> {
  if (!native()) return false;
  try {
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    const owned = purchases.some((p) => p.productIdentifier === NO_ADS_ID && (p.purchaseState === undefined || p.purchaseState === '1'));
    if (owned) grant();
    else if (readSettings().noAds) writeSettings({ ...readSettings(), noAds: false });
    return owned;
  } catch { return readSettings().noAds; }
}

/** На старті: тиха перевірка покупки. Без мережі нічого не міняємо. */
export function installAds() {
  if (!native()) return;
  document.documentElement.style.setProperty('--ad-banner', '0px');
  void restoreNoAds();
}
