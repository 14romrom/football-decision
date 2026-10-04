import { useState } from 'react';
import { PLAYER } from '../content';
import { readAllSlots, resetSlot, type SlotSummary } from '../telemetry/saves';
import { activeSlot, setActiveSlot } from '../telemetry/slots';
import { buildLabel, slotMotto } from './TitleScreen';
import { ord, t, tf } from '../content/i18n';

// Три слота карьеры (19.09, макет «було / стало» v2) — каждый слот как корешок карьеры: имя капителью
// (как на плашке стикера), поля «Матчів / Сезон / Місце», девиз доминантного голоса под линией.
// 28.09: раньше здесь стояло «удостоверение из картки гравця», но картка ушла от этой метафоры —
// осталась цитата шапки стикера, а не всей карточки. Состояние —
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
      <h1>{t('Нова кар’єра')}</h1>
      <p className="muted">{t('Три слоти. Порожній починає одразу, зайнятий спершу спитає.')}</p>
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
                    <span className="idc-name">{tf('Слот {0}', s.slot + 1)} <i className="chip">{t('порожньо')}</i></span>
                    <span className="idm">{t('Ніхто ще не виходив на поле. Тап — почати тут.')}</span>
                  </>
                ) : (
                  <>
                    <span className="idc-name">{PLAYER.name} <i className="chip">{now ? t('зараз') : tf('слот {0}', s.slot + 1)}</i></span>
                    <dl className="idf">
                      <dt>{t('Матчів')}</dt><dd>{s.matches}</dd>
                      <dt>{t('Сезон')}</dt><dd>{s.over ? tf('{0}, завершено', s.seasonNumber) : tf('{0}, тур {1} з {2}', s.seasonNumber, s.round, s.rounds)}</dd>
                      <dt>{t('Місце')}</dt><dd>{s.position ? tf('{0}, {1} {2}', ord(s.position), s.points, plural(s.points, t('очко'), t('очки'), t('очок'))) : '—'}</dd>
                    </dl>
                    {motto && <span className="idm"><span className={`voice-name voice-${motto.key}`}>{motto.who}</span>{tf(': «{0}»', motto.motto)}</span>}
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!askedSlot && <button className="row row-back" onClick={onBack}>{t('На головну')}</button>}

      {askedSlot && (
        <div className="sheet" role="dialog" aria-labelledby="slot-sheet-title">
          <p id="slot-sheet-title">
            {tf('У слоті {0} — сезон {1}, тур {2} з {3}{4}. Нова кар’єра його зітре. Кубик цього не пам’ятатиме, а Реєс — так.', askedSlot.slot + 1, askedSlot.seasonNumber, askedSlot.round, askedSlot.rounds, askedSlot.position ? tf(', {0} місце', ord(askedSlot.position)) : '')}
          </p>
          <button className="danger-btn" onClick={() => start(askedSlot.slot, true)}>{t('Стерти й почати')}</button>
          <button className="ghost" onClick={() => start(askedSlot.slot, false)}>{t('Грати цією кар’єрою')}</button>
          <button className="ghost" onClick={() => { setAsked(null); setSlots(readAllSlots()); }}>{t('Залишити')}</button>
        </div>
      )}
      <p className="build">{buildLabel()}</p>
    </div>
  );
}
