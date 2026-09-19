import { useState } from 'react';
import { PLAYER } from '../content';
import { readAllSlots, resetSlot, type SlotSummary } from '../telemetry/saves';
import { activeSlot, setActiveSlot } from '../telemetry/slots';
import { slotLine, slotMotto } from './TitleScreen';

// Три слота карьеры как корешки удостоверения (19.09): полоса — цвет доминантного голоса,
// пустой слот — «ніхто ще не виходив на поле». Пустой стартует сразу; занятый открывает лист:
// продолжить эту карьеру или стереть и начать заново — стирание красным и отдельно.

type Props = { onStart: (slot: number) => void; onBack: () => void };

const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n < 5 ? few : many);

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
      <p className="eyebrow">нова кар’єра</p>
      <h1>Куди записати</h1>
      <ul className="slot-list">
        {slots.map((s) => (
          <li key={s.slot}>
            <button
              className={`slot ${s.empty ? 'empty' : `voice-${s.dominant ?? 'none'}`} ${s.slot === current && !s.empty ? 'current' : ''}`}
              onClick={() => (s.empty ? start(s.slot, false) : setAsked(s.slot))}
              aria-pressed={s.slot === current}
            >
              <span className="n">слот {s.slot + 1}{s.slot === current && !s.empty ? ' · зараз' : ''}</span>
              {s.empty ? (
                <>
                  <b className="slot-empty-title">Порожньо</b>
                  <span>Ніхто ще не виходив на поле.</span>
                </>
              ) : (
                <>
                  <b>{PLAYER.name}</b>
                  <span>{slotLine(s)}{s.position ? ` · ${s.position}-е місце` : ''} · {s.matches} {plural(s.matches, 'матч', 'матчі', 'матчів')}</span>
                  {slotMotto(s) && <span className="motto">{slotMotto(s)}</span>}
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
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
    </div>
  );
}
