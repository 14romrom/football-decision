// Фінальний свисток (M10, 20.09): лист оповідача на полі перед роздягальнею — та сама анатомія, що в
// листа моменту (ярлик на кромці, проза, одна натискувана смуга), без цифр і без конкретних моментів:
// конкретика — на дошці. Єдина кнопка веде в роздягальню (дошка → картка → таблиця).

import type { Whistle } from '../engine/whistle';

type Props = { whistle: Whistle; onNext: () => void };

export function WhistleCard({ whistle, onNext }: Props) {
  return (
    <div className="scene whistle">
      <span className="minute-tab">90′ · фінальний свисток</span>
      <p className="setup">{whistle.summary}</p>
      {whistle.promise && <p className="setup whistle-promise">{whistle.promise}</p>}
      <p className="setup whistle-crowd">{whistle.crowd}</p>
      <ol className="choices">
        <li>
          <button className="choice" onClick={onNext}>
            <span className="choice-num" aria-hidden="true">→</span>
            <span className="choice-text">
              Перейти в роздягальню
              <span className="bracket"><i className="origin">дошка аналітика, картка, таблиця</i></span>
            </span>
            <span className="choice-go" aria-hidden="true">›</span>
          </button>
        </li>
      </ol>
    </div>
  );
}
