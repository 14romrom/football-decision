import { useMemo } from 'react';
import { PLAYER, ROSTER } from '../content';
import titleJson from '../content/title.json';
import { makeRng } from '../engine/rng';
import { pickTitleLine, titleContext, type TitleRule } from '../engine/title';
import { VOICE_LABEL } from '../engine/voices';
import { readSlotSummary, type SlotSummary } from '../telemetry/saves';
import { activeSlot } from '../telemetry/slots';
import { rememberTitleLine, titleSeen } from '../telemetry/settings';
import { Logo } from './Logo';
import { VOICES } from './PlayerCard';

// Титульный экран (19.09, макет «Inside the Box — титул»). Картинка — бисиклета в пустоту, так
// Реєса видит Его; реплика голоса под названием её осаживает. Один primary: «Продовжити» с корешком
// удостоверения активного слота, или «Нова кар’єра», если слот пустой. Остальное — строки 48px.
// Двигаться тут нечему: между запусками меняется только реплика.

export const TITLE_RULES = titleJson as TitleRule[];

const posShort = (p: string) => (p.includes('атакувальний') ? 'десятка' : p);

export function slotLine(s: SlotSummary): string {
  const where = s.over ? 'сезон завершено' : `тур ${s.round} з ${s.rounds}`;
  return `сезон ${s.seasonNumber} · ${where}`;
}

export function slotMotto(s: SlotSummary): string | null {
  if (!s.dominant) return null;
  const v = VOICES.find((x) => x.who === s.dominant);
  return v ? `${VOICE_LABEL[s.dominant]}: «${v.motto}»` : null;
}

type Props = { onContinue: () => void; onNewCareer: () => void; onSettings: () => void; onAbout: () => void };

export function TitleScreen({ onContinue, onNewCareer, onSettings, onAbout }: Props) {
  const slot = useMemo(() => readSlotSummary(activeSlot()), []);
  // Одна реплика на запуск: rng от времени, память виденных — общая для устройства.
  const line = useMemo(() => {
    const ctx = titleContext({ matches: slot.matches, last: slot.last, coachTrust: slot.coachTrust, lastAt: slot.lastAt, over: slot.over });
    const l = pickTitleLine(TITLE_RULES, ctx, new Set(titleSeen()), makeRng(Date.now() & 0xffff));
    if (l) rememberTitleLine(l.text);
    return l;
  }, [slot]);
  const build = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__.slice(0, 7) : 'dev';

  return (
    <div className="title">
      <aside className="film title-film film-left" aria-hidden="true">
        {[0, 1, 2].map((d) => <span key={d}>{`01A0${d}`}</span>)}
      </aside>
      <aside className="film title-film film-right" aria-hidden="true">
        <span>Inside the Box</span><span>тестова</span><span>слот {activeSlot() + 1}</span>
      </aside>

      <div className="title-art" aria-hidden="true">
        <img src="./img/title.webp" width="800" height="960" alt="" decoding="async" />
      </div>

      <div className="title-screen">
        <h1 className="title-logo"><Logo /></h1>
        {line && (
          <p className={`say title-say voice-${line.voice}`}>
            <b>{VOICE_LABEL[line.voice]}</b>{line.check && <span className="check"> [{line.check}]</span>} — {line.text}
          </p>
        )}
        {slot.empty && (
          <p className="title-intro">{PLAYER.name.split(' ').pop()}, {posShort(PLAYER.position)}. Шість голосів радять, один кубик вирішує, а винен потім чомусь ти.</p>
        )}

        <div className="title-menu">
          {slot.empty ? (
            <button className="primary title-primary" onClick={onNewCareer}>Нова кар’єра</button>
          ) : (
            // Корешок — часть кнопки: одна цель для тапа, читается как «продовжити цю карьеру».
            <button className="primary title-primary title-continue" onClick={onContinue}>
              <span>Продовжити</span>
              <span className={`stub voice-${slot.dominant ?? 'none'}`}>
                <b>{PLAYER.name}</b><span className="mono">{slotLine(slot)}</span>
                <span className="wide">
                  {slot.position ? `${slot.position}-е місце, ${slot.points} ${slot.points === 1 ? 'очко' : slot.points < 5 ? 'очки' : 'очок'}` : `«${ROSTER.us.name.nom}»`}
                  {' · '}{slot.matches} {slot.matches === 1 ? 'матч' : slot.matches < 5 ? 'матчі' : 'матчів'}
                </span>
                {slotMotto(slot) && <span className="motto">{slotMotto(slot)}</span>}
              </span>
            </button>
          )}
          <ul className="rows">
            {!slot.empty && <li><button className="row" onClick={onNewCareer}>Нова кар’єра</button></li>}
            <li><button className="row" onClick={onSettings}>Налаштування</button></li>
            <li><button className="row" onClick={onAbout}>Про гру</button></li>
          </ul>
          <p className="build">тестова збірка · {build}</p>
        </div>
      </div>
    </div>
  );
}
