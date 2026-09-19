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
import { VOICES } from './voices-text';

// Титульный экран (19.09, макет «Inside the Box — титул»). Картинка — бисиклета в пустоту, так
// Реєса видит Его; реплика голоса под названием её осаживает. Один primary: «Продовжити» — под ним
// строкой, кто ты и где (не карточка: карточка с полосой слева читалась как шаблон, замечание
// пользователя 19.09), или «Нова кар’єра», если слот пустой. Остальное — строки 48px без шевронов.
// Двигаться тут нечему: между запусками меняется только реплика.

export const TITLE_RULES = titleJson as TitleRule[];

const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n < 5 ? few : many);

/** «Сезон 1, тур 4 з 10» / «сезон 1 завершено». */
export function slotLine(s: SlotSummary): string {
  return s.over ? `сезон ${s.seasonNumber} завершено` : `сезон ${s.seasonNumber}, тур ${s.round} з ${s.rounds}`;
}

/** Хвост строки карьеры: место, очки, матчи — или клуб, пока таблицы нет. */
export function slotTail(s: SlotSummary): string {
  const matches = `${s.matches} ${plural(s.matches, 'матч', 'матчі', 'матчів')}`;
  return s.position ? `${s.position}-е місце, ${s.points} ${plural(s.points, 'очко', 'очки', 'очок')}, ${matches}` : `«${ROSTER.us.name.nom}», ${matches}`;
}

export function slotMotto(s: SlotSummary): { who: string; motto: string; key: string } | null {
  if (!s.dominant) return null;
  const v = VOICES.find((x) => x.who === s.dominant);
  return v ? { who: VOICE_LABEL[s.dominant], motto: v.motto, key: s.dominant } : null;
}

export function buildLabel(): string {
  const build = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__.slice(0, 7) : 'dev';
  return `Тестова збірка ${build}`;
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
  const motto = slotMotto(slot);

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
          <p className="title-intro">{PLAYER.name.split(' ').pop()}, десятка. Шість голосів радять, один кубик вирішує, а винен потім чомусь ти.</p>
        )}

        <div className="title-menu">
          {slot.empty ? (
            <button className="primary title-primary" onClick={onNewCareer}>Нова кар’єра</button>
          ) : (
            <>
              <button className="primary title-primary" onClick={onContinue}>Продовжити</button>
              <p className="title-career">
                <b>{PLAYER.name}</b>, {slotLine(slot)} — {slotTail(slot)}.
                {motto && <i> <span className={`voice-name voice-${motto.key}`}>{motto.who}</span>: «{motto.motto}»</i>}
              </p>
            </>
          )}
          <ul className="rows">
            {!slot.empty && <li><button className="row" onClick={onNewCareer}>Нова кар’єра</button></li>}
            <li><button className="row" onClick={onSettings}>Налаштування</button></li>
            <li><button className="row" onClick={onAbout}>Про гру</button></li>
          </ul>
          <p className="build">{buildLabel()}</p>
        </div>
      </div>
    </div>
  );
}
