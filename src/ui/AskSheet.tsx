import type { AskSheet as Sheet } from '../engine/notify';
import { VOICE_LABEL } from '../engine/voices';

// Листи-прохання M51 (макет «Сповіщення й відгук», погоджено 18.10): дозвіл на сповіщення після першого
// матчу й прохання про відгук на доброму моменті. Той самий лист оповідача, що в сцені агента, — нових
// елементів інтерфейсу немає. Репліка голосу є лише в листі дозволу (Тібо записав номер); у проханні про
// відгук іронії немає навмисно: це єдиний лист, де розробник говорить від себе.

type Props = { sheet: Sheet; onYes: () => void; onNo: () => void };

export function AskSheet({ sheet, onYes, onNo }: Props) {
  return (
    <div className="result agent ask">
      <section className="moment"><div className="scene">
        <span className="minute-tab">{sheet.tab.toUpperCase()}</span>
        <p className="setup">{sheet.text}</p>
        {sheet.say && (
          <div className="voices"><p className="say voice-team"><b>{VOICE_LABEL.team}</b><span>{sheet.say}</span></p></div>
        )}
        <button className="primary menu-primary nb-sheet-btn" onClick={onYes}>{sheet.yes}</button>
        <button className="ghost ask-no" onClick={onNo}>{sheet.no}</button>
      </div></section>
    </div>
  );
}
