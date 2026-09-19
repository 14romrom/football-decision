import { useState } from 'react';
import { PLAYER } from '../content';
import { readAllSlots, resetSlot, type SlotSummary } from '../telemetry/saves';
import { activeSlot, setActiveSlot } from '../telemetry/slots';
import { buildLabel, slotMotto } from './TitleScreen';

// Три слота карьеры (19.09, макет «було / стало» v2) — каждый слот как удостоверение из картки
// гравця: имя, поля «Матчів / Сезон / Місце», девиз доминантного голоса под линией. Состояние —
// тем, чем игра уже его отмечает: чип «зараз» на текущем, пунктирный бланк с чипом «порожньо» на
// пустом (как «далі» в ленте матча). Без цветной полосы и рамки-подсветки — это читалось как шаблон.
// Пустой слот стартует сразу; занятый спрашивает: продолжить эту карьеру или стереть и начать.

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
      <h1>Нова кар’єра</h1>
      <p className="muted">Три слоти. Порожній починає одразу, зайнятий спершу спитає.</p>
      <ul className="slot-list">
        {slots.map((s) => {
          const motto = slotMotto(s);
          const now = s.slot === current && !s.empty;
          return (
            <li key={s.slot}>
              <button
                className={`idc ${s.empty ? 'empty' : ''} ${now ? 'now' : ''}`}
                onClick={() => (s.empty ? start(s.slot, false) : setAsked(s.slot))}
                aria-current={now ? 'true' : undefined}
              >
                {s.empty ? (
                  <>
                    <span className="idc-name">Слот {s.slot + 1} <i className="chip">порожньо</i></span>
                    <span className="idm">Ніхто ще не виходив на поле. Тап — почати тут.</span>
                  </>
                ) : (
                  <>
                    <span className="idc-name">{PLAYER.name} <i className="chip">{now ? 'зараз' : `слот ${s.slot + 1}`}</i></span>
                    <dl className="idf">
                      <dt>Матчів</dt><dd>{s.matches}</dd>
                      <dt>Сезон</dt><dd>{s.over ? `${s.seasonNumber}, завершено` : `${s.seasonNumber}, тур ${s.round} з ${s.rounds}`}</dd>
                      <dt>Місце</dt><dd>{s.position ? `${s.position}-е, ${s.points} ${plural(s.points, 'очко', 'очки', 'очок')}` : '—'}</dd>
                    </dl>
                    {motto && <span className="idm"><span className={`voice-name voice-${motto.key}`}>{motto.who}</span>: «{motto.motto}»</span>}
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!askedSlot && <button className="row row-back" onClick={onBack}>На титул</button>}

      {askedSlot && (
        <div className="sheet" role="dialog" aria-labelledby="slot-sheet-title">
          <p id="slot-sheet-title">
            У слоті {askedSlot.slot + 1} — сезон {askedSlot.seasonNumber}, тур {askedSlot.round} з {askedSlot.rounds}{askedSlot.position ? `, ${askedSlot.position}-е місце` : ''}. Нова кар’єра його зітре. Кубик цього не пам’ятатиме, а Реєс — так.
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
