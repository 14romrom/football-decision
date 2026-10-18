import type { AdBreak } from '../content';
import { VOICE_LABEL } from '../engine/voices';
import type { VoiceKey } from '../engine/types';
import { t, tf } from '../content/i18n';

// Пауза в матчі (M48, макет «Реклама в Inside the Box» — «Пауза в матчі»): лист оповідача на хвилині
// паузи — сетап, три репліки голосів, «Чекати». Під кнопкою чесний підпис «Далі — реклама…» — ролик
// лише після тапу, не несподіванкою (правило AdMob). Без реклами (покупка, браузер, немає мережі)
// лист той самий, без підпису: пауза лишається історією. Нових елементів інтерфейсу немає — як лист виходу.

type Props = { brk: AdBreak; minute: number; withAd: boolean; onWait: () => void };

export function AdBreakCard({ brk, minute, withAd, onWait }: Props) {
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
      {withAd && <p className="adbreak-note">{brk.note}</p>}
      {withAd && <p className="adbreak-quiet">{t('Вимкнути рекламу назавжди можна в налаштуваннях.')}</p>}
    </div>
  );
}
