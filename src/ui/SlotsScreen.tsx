import { useState } from 'react';
import { PLAYER } from '../content';
import { readAllSlots, resetSlot, type SlotSummary } from '../telemetry/saves';
import { activeSlot, setActiveSlot } from '../telemetry/slots';
import { buildLabel, slotLine, slotMotto, slotTail } from './TitleScreen';

// Три слота карьеры (19.09) — список строк, как условия на брифинге и таблица сезона: подпись слева,
// текст справа, разделители; текущий слот выделен как своя строка в таблице. Не карточки с полосой —
// это читалось как шаблон (замечание пользователя). Пустой слот стартует сразу; занятый открывает
// подтверждение: продолжить эту карьеру или стереть и начать заново — стирание красным и отдельно.

type Props = { onStart: (slot: number) => void; onBack: () => void };

export function SlotsScreen({ onStart, onBack }: Props) {
  const [slots, setSlots] = useState<SlotSummary[]>(() => readAllSlots());
  const [asked, setAsked] = useState<number | null>(null);
  const current = activeSlot();

  const start = (slot: number, wipe: boolean) => {
    if (wipe) resetSlot(slot);
    setActiveSlot(slot);
    onStart(slot);
  };

  const askedSlot = asked === null ? null : slots[asked];

  return (
    <div className="slots plain-screen">
      <h1>Нова кар’єра</h1>
      <p className="muted">Три слоти. Порожній починає одразу, зайнятий спершу спитає.</p>
      <div className="conditions slot-list" role="list">
        {slots.map((s) => {
          const motto = slotMotto(s);
          return (
            <button
              key={s.slot}
              role="listitem"
              className={`slot-row ${s.slot === current && !s.empty ? 'current' : ''} ${s.empty ? 'empty' : ''}`}
              onClick={() => (s.empty ? start(s.slot, false) : setAsked(s.slot))}
              aria-current={s.slot === current && !s.empty ? 'true' : undefined}
            >
              <span className="slot-dt">Слот {s.slot + 1}</span>
              <span className="slot-dd">
                {s.empty ? (
                  <>Порожньо. Ніхто ще не виходив на поле.</>
                ) : (
                  <>
                    <b>{PLAYER.name}.</b> {slotLine(s)[0].toUpperCase() + slotLine(s).slice(1)} — {slotTail(s)}.
                    {motto && <i> <span className={`voice-name voice-${motto.key}`}>{motto.who}</span>: «{motto.motto}»</i>}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {!askedSlot && <button className="row row-back" onClick={onBack}>На титул</button>}

      {askedSlot && (
        <div className="sheet" role="dialog" aria-labelledby="slot-sheet-title">
          <p id="slot-sheet-title">
            У слоті {askedSlot.slot + 1} — {slotLine(askedSlot)}{askedSlot.position ? `, ${askedSlot.position}-е місце` : ''}. Нова кар’єра його зітре. Кубик цього не пам’ятатиме, а Реєс — так.
          </p>
          <button className="danger-btn" onClick={() => start(askedSlot.slot, true)}>Стерти й почати</button>
          <button className="ghost" onClick={() => start(askedSlot.slot, false)}>Грати цією кар’єрою</button>
          <button className="ghost" onClick={() => { setAsked(null); setSlots(readAllSlots()); }}>Залишити</button>
        </div>
      )}
      <p className="build">{buildLabel()}</p>
    </div>
  );
}
