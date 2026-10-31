import { useEffect, useState } from 'react';
import type { AdBreak } from '../content';
import { VOICE_LABEL } from '../engine/voices';
import type { VoiceKey } from '../engine/types';
import { t, tf } from '../content/i18n';
import { buyNoAds, noAdsPrice } from './ads';

// Пауза в матчі (M48, макет «Реклама в Inside the Box» — «Пауза в матчі»): лист оповідача на хвилині
// паузи — сетап, три репліки голосів, «Чекати». Під кнопкою чесний підпис «Далі — реклама…» — ролик
// лише після тапу, не несподіванкою (правило AdMob). Без реклами (покупка, браузер, немає мережі)
// лист той самий, без підпису: пауза лишається історією.

type Props = { brk: AdBreak; minute: number; withAd: boolean; onWait: () => void };

// «Без реклами» тут, а не лише в налаштуваннях (плейтест 31.10: «кнопку мало хто знаходить»; макет
// «Хвилина, оновлення, без реклами», пункт 7): тихий рядок «можна в налаштуваннях» відсилав в інше місце
// без кнопки. Тепер друга кнопка під «Чекати» одразу відкриває покупку в Play. Підпис «Далі — реклама…»
// стоїть просто під «Чекати» — попередження біля кнопки, після якої ролик (правило AdMob). Купив —
// підпис і кнопка зникають, «Чекати» далі без ролика (`showInterstitial` перевіряє `adsActive`).
export function AdBreakCard({ brk, minute, withAd, onWait }: Props) {
  const [price, setPrice] = useState<string | null>(null);
  const [owned, setOwned] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (withAd) void noAdsPrice().then(setPrice); }, [withAd]);
  const ad = withAd && !owned;
  const buy = async () => { setBusy(true); const ok = await buyNoAds(); setBusy(false); setOwned(ok); };
  return (
    <div className="scene adbreak">
      <span className="minute-tab">{tf('{0}′ · пауза', minute).toUpperCase()}</span>
      <p className="setup">{brk.setup}</p>
      <div className="voices">
        {brk.voices.map((v, i) => (
          <p key={i} className={`say voice-${v.voice}`}><b>{VOICE_LABEL[v.voice as VoiceKey]}</b><span>{v.line}</span></p>
        ))}
      </div>
      <button className="primary title-primary whistle-go" onClick={onWait}>{t('Чекати')}</button>
      {ad && <p className="adbreak-note">{brk.note}</p>}
      {ad && <button className="adbreak-buy" type="button" disabled={busy} onClick={() => void buy()}>{tf('Без реклами назавжди · {0}', price ?? '2,99 $')}</button>}
    </div>
  );
}
