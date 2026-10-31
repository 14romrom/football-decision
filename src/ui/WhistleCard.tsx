// Фінальний свисток (M10, 20.09): лист оповідача на полі перед роздягальнею — ярлик на кромці й проза, як у
// листа моменту, без цифр і без конкретних моментів: конкретика — на дошці. Кнопка — стандартна primary
// («Нова кар’єра» на титулі), без підпису: це не вибір із варіантів, а один вихід (рішення користувача 20.09).

import type { Whistle } from '../engine/whistle';
import { t, tf } from '../content/i18n';
import { clockLabel } from './Scoreboard';
import { useEffect } from 'react';
import { sfxWhistleOnce } from './sound';

/** `minute` — хвилина свистка: з компенсованим часом це 90+N (31.10). */
type Props = { whistle: Whistle; minute: number; onNext: () => void };

export function WhistleCard({ whistle, minute, onNext }: Props) {
  // Три свистки — разом із листом фінального свистка, один раз.
  useEffect(() => { sfxWhistleOnce('final'); }, []);
  return (
    <div className="scene whistle">
      <span className="minute-tab">{tf('{0} · фінальний свисток', clockLabel(minute))}</span>
      <p className="setup">{whistle.summary}</p>
      {whistle.promise && <p className="setup whistle-promise">{whistle.promise}</p>}
      <p className="setup whistle-crowd">{whistle.crowd}</p>
      <button className="primary title-primary whistle-go" data-swipe="next" onClick={onNext}>{t('Перейти в роздягальню')}</button>
    </div>
  );
}
