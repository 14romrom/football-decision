// Фінальний свисток (M10, 20.09): лист оповідача на полі перед роздягальнею — ярлик на кромці й проза, як у
// листа моменту, без цифр і без конкретних моментів: конкретика — на дошці. Кнопка — стандартна primary
// («Нова кар’єра» на титулі), без підпису: це не вибір із варіантів, а один вихід (рішення користувача 20.09).

import type { Whistle } from '../engine/whistle';

type Props = { whistle: Whistle; onNext: () => void };

export function WhistleCard({ whistle, onNext }: Props) {
  return (
    <div className="scene whistle">
      <span className="minute-tab">90′ · фінальний свисток</span>
      <p className="setup">{whistle.summary}</p>
      {whistle.promise && <p className="setup whistle-promise">{whistle.promise}</p>}
      <p className="setup whistle-crowd">{whistle.crowd}</p>
      <button className="primary title-primary whistle-go" onClick={onNext}>Перейти в роздягальню</button>
    </div>
  );
}
