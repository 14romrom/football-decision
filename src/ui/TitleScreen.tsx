import { useMemo } from 'react';
import { Film } from './Film';
import { PLAYER, ROSTER, clubName, shotFor } from '../content';
import { monthOfRound, ourFixture } from '../engine/season';
import { readCareer } from '../telemetry/career-storage';
import { readSeason } from '../telemetry/season-storage';
import { ChapterHead, currentChapter } from './ChapterHead';
import titleJsonRaw from '../content/title.json';
import { tr, ord, plural, t, tf } from '../content/i18n';
// Контент цього модуля йде повз content/index.ts, тому переклад (M47) вмикається тут же.
const titleJson = tr(titleJsonRaw);
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

/** «Сезон 1, тур 4 з 10» / «сезон 1 завершено». */
export function slotLine(s: SlotSummary): string {
  return s.over ? tf('сезон {0} завершено', s.seasonNumber) : tf('сезон {0}, тур {1} з {2}', s.seasonNumber, s.round, s.rounds);
}

/** Хвост строки карьеры: место, очки, матчи — или клуб, пока таблицы нет. */
export function slotTail(s: SlotSummary): string {
  const matches = tf('{0} {1}', s.matches, plural(s.matches, t('матч'), t('матчі'), t('матчів')));
  return s.position ? tf('{0} місце, {1} {2}, {3}', ord(s.position), s.points, plural(s.points, t('очко'), t('очки'), t('очок')), matches) : tf('«{0}», {1}', ROSTER.us.name.nom, matches);
}

export function slotMotto(s: SlotSummary): { who: string; motto: string; key: string } | null {
  if (!s.dominant) return null;
  const v = VOICES.find((x) => x.who === s.dominant);
  return v ? { who: VOICE_LABEL[s.dominant], motto: v.motto, key: s.dominant } : null;
}

/** Номер релізу («1.0.3») або порожньо — тестова збірка (Pages, debug-APK). */
export function releaseName(): string {
  return typeof __APP_RELEASE__ === 'string' ? __APP_RELEASE__ : '';
}

/** Підпис збірки під меню. У релізі — тільки номер версії: «тестова» на екрані гри з Play читається
 *  як недороблена гра. Тестерам хеш потрібен, щоб назвати, на чому зіграно, — тому він лишається. */
export function buildLabel(): string {
  const rel = releaseName();
  if (rel) return `v${rel}`;
  const build = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__.slice(0, 7) : 'dev';
  return tf('Тестова збірка {0}', build);
}

/** Підписи плівки на титулі й на екрані запуску — однакові, бо рамка при розчиненні не сіпається. */
export function titleFilmLabels() {
  const rel = releaseName();
  return { left: [0, 1, 2].map((d) => `01A0${d}`), right: ['Inside the Box', rel ? `v${rel}` : t('тестова'), tf('слот {0}', activeSlot() + 1)] };
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

  const surname = PLAYER.name.split(String.fromCharCode(32)).pop() ?? PLAYER.name;
  // Головне меню того, хто повертається (17.10, макет «Пауза, сезон і головне меню»): замість кадру
  // першого запуску — кадр його глави, угорі шапка глави з місяцем, під кнопкою — що попереду.
  // Логотип той самий і на тому ж місці. Новий гравець бачить головне меню як було: йому ще нема
  // чого показувати.
  const back = useMemo(() => {
    if (slot.empty) return null;
    const season = readSeason();
    const chapter = currentChapter(readCareer(), season);
    const shot = chapter.shot ? shotFor(chapter.shot) : null;
    const fx = season ? ourFixture(season) : null;
    const month = season && !slot.over && chapter.id.startsWith('season') ? monthOfRound(slot.round) : '';
    return { chapter, shot, fx, month };
  }, [slot]);
  return (
    <div className="title">
      <Film labels={titleFilmLabels()} />

      {back?.shot ? (
        <div className="title-art chapter" aria-hidden="true">
          <img src={back.shot.src} alt="" decoding="async" style={{ objectPosition: back.shot.focus }} />
        </div>
      ) : (
        <div className="title-art" aria-hidden="true">
          <img src="./img/title.webp" width="800" height="960" alt="" decoding="async" />
        </div>
      )}
      {back && <div className="title-chapter"><ChapterHead chapter={back.chapter} after={back.month} size="sm" /></div>}

      <div className="title-screen">
        <h1 className="title-logo"><Logo /></h1>
        {line && (
          <p className={`say title-say voice-${line.voice}`}>
            <b>{VOICE_LABEL[line.voice]}</b> — {line.text}
          </p>
        )}
        {slot.empty && (
          <p className="title-intro">{tf('{0}, десятка. Шість голосів радять, один кубик вирішує, а винен потім чомусь ти.', surname)}</p>
        )}

        <div className="title-menu">
          {slot.empty ? (
            <button className="primary title-primary" onClick={onNewCareer}>{t('Нова кар’єра')}</button>
          ) : (
            <>
              <button className="primary title-primary" onClick={onContinue}>{t('Продовжити')}</button>
              {/* Девиз голоса картки в строке карьеры убран (19.09, пользователь): на титуле один голос —
                  реплика над кнопкой; второй в корешке дублировал его. slotMotto остаётся для слотов. */}
              <p className="title-career">
                {back?.fx && !slot.over ? (<>
                  <b>{tf('Тур {0} з {1}', slot.round, slot.rounds)}</b>
                  {' · '}{tf('{0}, {1}', back.fx.venue === 'home' ? t('вдома') : t('виїзд'), clubName(back.fx.opponentKey).nom)}
                  {slot.position ? <>{' · '}{tf('{0} місце', ord(slot.position))}</> : null}
                </>) : (<><b>{PLAYER.name}</b>, {slotLine(slot)} — {slotTail(slot)}.</>)}
              </p>
            </>
          )}
          <ul className="rows">
            {!slot.empty && <li><button className="row" onClick={onNewCareer}>{t('Нова кар’єра')}</button></li>}
            <li><button className="row" onClick={onSettings}>{t('Налаштування')}</button></li>
            <li><button className="row" onClick={onAbout}>{t('Про гру')}</button></li>
          </ul>
          <p className="build">{buildLabel()}</p>
        </div>
      </div>
    </div>
  );
}
