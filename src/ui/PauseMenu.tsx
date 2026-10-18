import { useEffect, useState } from 'react';
import { PLAYER, ROSTER, shotFor } from '../content';
import { dropShot, readShot, restoreShot, takeShot, type Shot } from '../telemetry/checkpoint';
import { readCareer } from '../telemetry/career-storage';
import { readSeason } from '../telemetry/season-storage';
import { readSlotSummary } from '../telemetry/saves';
import { activeSlot } from '../telemetry/slots';
import { readSettings, writeSettings } from '../telemetry/settings';
import { monthOfRound } from '../engine/season';
import { AboutScreen } from './AboutScreen';
import { FeedbackScreen } from './FeedbackScreen';
import { ChapterHead, currentChapter } from './ChapterHead';
import { Film } from './Film';
import { liveMatch } from './liveMatch';
import { PlayerCard } from './PlayerCard';
import { SeasonOverview } from './SeasonOverview';
import { SettingsScreen } from './SettingsScreen';
import { slotLine } from './TitleScreen';
import { ord, t, tf } from '../content/i18n';

// Пауза (17.10, макет «Пауза, сезон і головне меню»; замість бургера M45). Бургер 28 px без підпису
// читався як службова кнопка сайту, а не частина гри (зауваження користувача). Тепер — кнопка паузи
// зі знаком, який впізнає будь-хто, хто грав у мобільну гру, і пауза на весь екран.
//
// **Сезон, картка, «Про гру» й налаштування відкриваються тут же, а не переходом.** Матч живе лише в
// пам'яті (сесія в рефах App), і будь-який перехід з #/play його стирає. Раніше кожен пункт у матчі
// спершу питав «вийти?»; тепер подивитися таблицю посеред матчу можна, нічого не втративши. Виходить
// із гри лише «Головне меню» — і в матчі воно червоне й попереджає прямо, що буде.
//
// **Зберегти — тільки між матчами** (рішення користувача 17.10). Мова — теж: перемикання перезавантажує
// гру, тобто посеред матчу стерло б його. У матчі цих рядків немає зовсім, а не сірі з поясненням:
// пояснень під пунктами користувач просив не писати.
//
// Чи йде матч, пауза питає сховище, а не App: знімок `prematch` існує рівно поки матч не записано в
// сезон (App робить його перед стартом і скидає на свистку).

type Props = { go: (hash: string) => void };

/** Назва мови — її ж мовою, як у перемикачах мови будь-якої гри. */
const LANG_LABEL = { uk: 'УКР', en: 'ENG' }; // i18n-skip: назва мови не перекладається
type View = 'menu' | 'season' | 'card' | 'about' | 'settings' | 'feedback';
type Ask =
  | { kind: 'leave' }
  | { kind: 'load'; name: 'save' | 'auto'; shot: Shot };

const when = (at: number) => new Date(at).toLocaleString(readSettings().lang === 'en' ? 'en-GB' : 'uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function PauseMenu({ go }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('menu');
  const [ask, setAsk] = useState<Ask | null>(null);
  const [saved, setSaved] = useState(false);

  // Escape — крок назад: з розділу в паузу, з паузи в гру.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (ask) setAsk(null); else if (view !== 'menu') setView('menu'); else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const close = () => { setAsk(null); setView('menu'); setSaved(false); setOpen(false); };

  // Кнопка «Назад» Android (ui/backButton.ts): закрита пауза — відкрити, відкрита — крок назад, як Escape.
  useEffect(() => {
    const onBack = () => {
      if (!open) { setOpen(true); return; }
      if (ask) setAsk(null); else if (view !== 'menu') setView('menu'); else close();
    };
    window.addEventListener('pause-back', onBack);
    return () => window.removeEventListener('pause-back', onBack);
  });
  const toggle = <button className="pause-toggle" aria-label={t('Пауза')} aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
    <span className="pz-ico" aria-hidden="true"><i /><i /></span><small>{t('пауза')}</small>
  </button>;
  if (!open) return toggle;

  // Читаємо сховище на кожному відкритті: поки пауза закрита, стан міг змінитися будь-як.
  const inMatch = readShot('prematch') !== null;
  const career = readCareer();
  const season = readSeason();
  const slot = readSlotSummary(activeSlot());
  const save = inMatch ? null : readShot('save');
  const auto = inMatch ? null : readShot('auto');
  const chapter = currentChapter(career, season);
  const shot = chapter.shot ? shotFor(chapter.shot) : null;
  const live = inMatch ? liveMatch() : null;
  const where = slot.empty ? '' : [
    tf('{0}, тур {1} з {2}', monthOfRound(slot.round), slot.round, slot.rounds),
    slot.position ? tf('{0} місце', ord(slot.position)) : '',
  ].filter(Boolean).join(' · ');

  const saveHere = () => { takeShot('save', slotLine(slot)); setSaved(true); };
  const load = () => {
    if (ask?.kind !== 'load') return;
    restoreShot(ask.name);
    dropShot('prematch');
    close();
    go('#/');
  };
  const leave = () => { close(); restoreShot('prematch'); go('#/'); };
  const toMenu = () => { if (inMatch) setAsk({ kind: 'leave' }); else { close(); go('#/'); } };
  const setLang = (lang: 'uk' | 'en') => { if (lang === readSettings().lang) return; writeSettings({ ...readSettings(), lang }); location.reload(); };
  const lang = readSettings().lang;

  return (<>
    {toggle}
    <div className="pause" role="dialog" aria-label={t('Пауза')}>
      <Film />
      <div className="pause-scroll"><div className="pause-inner">
        {view === 'season' && season && <SeasonOverview season={season} career={career} onBack={() => setView('menu')} />}
        {view === 'card' && (
          <PlayerCard player={PLAYER} career={career} season={season} club={ROSTER.us.name.nom}
            onEspm={inMatch ? undefined : () => { close(); go('#/espm'); }}
            onBack={() => setView('menu')} />
        )}
        {view === 'about' && <AboutScreen onBack={() => setView('menu')} backLabel={t('Пауза')} />}
        {view === 'feedback' && <FeedbackScreen onBack={() => setView('menu')} backLabel={t('Пауза')} where={inMatch ? t('пауза в матчі') : t('пауза')} />}
        {view === 'settings' && (
          <SettingsScreen inMatch={inMatch} backLabel={t('Пауза')} onBack={() => setView('menu')} onWiped={() => { close(); go('#/'); }} />
        )}

        {view === 'menu' && (
          <div className="pause-menu">
            <div className="pause-head">
              {shot && <img src={shot.src} alt="" decoding="async" style={{ objectPosition: shot.focus }} />}
              <ChapterHead chapter={chapter} before={t('Пауза')} size="sm" />
            </div>
            <p className="pause-where">
              {live && <b>{tf('{0}′ · {1} {2}:{3} {4}', live.minute, live.us, live.scoreUs, live.scoreThem, live.them)}</b>}
              {live && where && <br />}
              {where}
            </p>

            {ask === null && (<>
              <button className="primary pause-go" onClick={close}>{inMatch ? t('Повернутися в матч') : t('Продовжити')}</button>
              <ul className="pause-rows">
                {season && <li><button onClick={() => setView('season')}>{t('Сезон')}</button></li>}
                <li><button onClick={() => setView('card')}>{t('Картка гравця')}</button></li>
                {!inMatch && !slot.empty && (
                  <li><button onClick={saveHere}>{t('Зберегти')}{saved && <i className="row-note">{t('збережено')}</i>}</button></li>
                )}
                {save && <li><button onClick={() => setAsk({ kind: 'load', name: 'save', shot: save })}>{t('Повернутися до збереження')}</button></li>}
                {auto && <li><button onClick={() => setAsk({ kind: 'load', name: 'auto', shot: auto })}>{t('Автоточка')}</button></li>}
                {!inMatch && (
                  <li className="pause-lang">
                    <span>{t('Мова')}</span>
                    <span className="seg" role="radiogroup" aria-label={t('Мова')}>
                      <button type="button" role="radio" aria-checked={lang === 'uk'} className={lang === 'uk' ? 'on' : ''} onClick={() => setLang('uk')}>{LANG_LABEL.uk}</button>
                      <button type="button" role="radio" aria-checked={lang === 'en'} className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>{LANG_LABEL.en}</button>
                    </span>
                  </li>
                )}
                <li><button onClick={() => setView('about')}>{t('Про гру')}</button></li>
                <li><button onClick={() => setView('feedback')}>{t('Написати розробнику')}</button></li>
                <li><button onClick={() => setView('settings')}>{t('Налаштування')}</button></li>
                <li><button className={inMatch ? 'exit' : ''} onClick={toMenu}>{t('Головне меню')}</button></li>
              </ul>
            </>)}

            {ask?.kind === 'leave' && (<>
              <p className="nav-warn">
                {t('Матч ніде не зберігається. Якщо вийти зараз, його наче не було: ти повернешся на екран перед матчем і зіграєш цей тур заново — з тим самим суперником, погодою і установкою. Усе, що сталося на полі за сьогодні, зникне.')}
              </p>
              <button className="danger-btn" onClick={leave}>{t('Вийти, матч не зберігати')}</button>
              <button className="ghost" onClick={() => setAsk(null)}>{t('Лишитися в матчі')}</button>
            </>)}

            {ask?.kind === 'load' && (<>
              <p className="nav-warn">
                {tf('Гра відкотиться до стану «{0}» від {1}. Усе, що сталося після того, зникне назовсім: зіграні матчі, тижні, рішення й те, що про тебе встигли написати. Далі гра піде з тієї точки — можна прожити це інакше.', ask.shot.label, when(ask.shot.at))}
              </p>
              <button className="danger-btn" onClick={load}>{t('Повернутися до точки')}</button>
              <button className="ghost" onClick={() => setAsk(null)}>{t('Ні, лишити як є')}</button>
            </>)}
          </div>
        )}
      </div></div>
    </div>
  </>);
}
