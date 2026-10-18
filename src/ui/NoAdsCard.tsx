import { useEffect, useState } from 'react';
import { readSettings } from '../telemetry/settings';
import { adsAvailable, buyNoAds, noAdsPrice, restoreNoAds } from './ads';
import { t, tf } from '../content/i18n';

// «Без реклами» (M48, макет — картка в налаштуваннях): текст без іронії, як вирішив користувач, —
// «Inside the Box робить одна людина…». Та сама картка в «Про гру». Ціну показує Play у валюті
// гравця; поки не відповів — 2,99 $ із плану. У браузері картки немає: купити там нічого.

export function NoAdsCard() {
  const [owned, setOwned] = useState(() => readSettings().noAds);
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => { if (adsAvailable()) void noAdsPrice().then(setPrice); }, []);
  if (!adsAvailable()) return null;

  if (owned) {
    return (
      <div className="noads">
        <b>{t('Без реклами')}</b>
        <p>{t('Дякуємо. Реклами в грі більше немає, а паузи в матчах лишилися історією.')}</p>
      </div>
    );
  }
  const buy = async () => { setBusy(true); setNote(''); const ok = await buyNoAds(); setBusy(false); setOwned(ok); };
  const restore = async () => {
    setBusy(true); const ok = await restoreNoAds(); setBusy(false); setOwned(ok);
    if (!ok) setNote(t('У цьому акаунті Google Play покупки не знайдено.'));
  };
  return (
    <div className="noads">
      <b>{t('Без реклами')}</b>
      <p>{t('Inside the Box робить одна людина. Покупка назавжди вимикає рекламу і допомагає вийти наступним частинам.')}</p>
      <button className="primary" type="button" disabled={busy} onClick={() => void buy()}>{tf('Купити · {0}', price ?? '2,99 $')}</button>
      <button className="noads-restore" type="button" disabled={busy} onClick={() => void restore()}>{t('Відновити покупку')}</button>
      {note && <small className="noads-note">{note}</small>}
    </div>
  );
}
