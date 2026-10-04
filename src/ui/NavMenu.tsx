import { useEffect, useState } from 'react';
import { dropShot, putShot, readShot, restoreShot, takeShot, type Shot } from '../telemetry/checkpoint';
import { readSlotSummary } from '../telemetry/saves';
import { activeSlot } from '../telemetry/slots';
import { Icon } from './icons';
import { slotLine } from './TitleScreen';
import { t, tf } from '../content/i18n';

// Навігація в грі (M45, 03.10, скарга тестера: «не можу вийти з матчу на головний екран»).
// До цього вийти можна було тільки з двох екранів — титул і меню перед матчем, — а всередині матчу,
// тижня чи зошита виходу не було зовсім. Кнопка живе поверх усіх екранів гри (#/play) і відкриває
// лист зі звичними пунктами: збереження, картка, профіль, налаштування, про гру, головна.
//
// Матч живе лише в пам'яті (сесія в рефах App), і будь-який перехід звідси його стирає. Тому
// всередині матчу кожен пункт спершу каже про це прямо, а не «ви впевнені?»: гравець має розуміти,
// що саме він втратить і що буде далі. Згода — і слот повертається до знімка, зробленого перед
// матчем (telemetry/checkpoint.ts), тобто тур просто не зіграно.
//
// Контрольні точки (M34) — тут само, бо шукають їх у меню. Дві: своя (зберіг рукою) і автоматична
// (гра поставила перед відпусткою й перед останнім тижнем). Повернення до точки — перехід на титул:
// Game тримає кар'єру в рефах, прочитаних при монтуванні, тому перемальовувати його на місці нема
// сенсу — хай гравець зайде заново кнопкою «Продовжити» і побачить, куди саме повернувся.

// Чи йде матч, меню питає саме сховище, а не App: знімок `prematch` існує рівно поки матч не записано
// в сезон (App робить його перед стартом і скидає на свистку). Так меню не треба тягнути стан гри.
type Props = { go: (hash: string) => void };

type Ask =
  | { kind: 'leave'; hash: string }
  | { kind: 'load'; name: 'save' | 'auto'; shot: Shot };

// Підпис праворуч — короткий, бо на 375 px довгий переносить і сам рядок (плейтест 03.10).
const ROWS: { hash: string; label: string; note: string }[] = [
  { hash: '#/player', label: t('Картка гравця'), note: t('хто ти зараз') },
  { hash: '#/espm', label: t('Профіль на ESPM'), note: t('що пишуть') },
  { hash: '#/settings', label: t('Налаштування'), note: t('кидок, екран') },
  { hash: '#/about', label: t('Про гру'), note: t('як це працює') },
  { hash: '#/', label: t('Головна'), note: t('титул, кар’єри') },
];

const when = (at: number) => new Date(at).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function NavMenu({ go }: Props) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  // Читаємо сховище на кожному відкритті: поки лист закритий, стан міг змінитися будь-як.
  const inMatch = open && readShot('prematch') !== null;
  const save = open ? readShot('save') : null;
  const auto = open ? readShot('auto') : null;
  const here = open ? slotLine(readSlotSummary(activeSlot())) : '';

  // Escape закриває — звичка з десктопа, на телефоні не заважає.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAsk(null); setOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => { setAsk(null); setSavedAt(0); setOpen(false); };
  const pick = (hash: string) => { if (inMatch) setAsk({ kind: 'leave', hash }); else { close(); go(hash); } };

  // Зберегти можна й усередині матчу, тільки в точку піде стан **до** нього: матч у сховищі не
  // лежить, а кар'єра на старті вже з'їла наслідки минулого туру. Беремо готовий знімок `prematch`,
  // інакше повернення до такої точки тихо дарувало б чистий тур.
  const saveHere = () => {
    const pre = readShot('prematch');
    if (pre) putShot('save', { ...pre, at: Date.now(), label: tf('перед матчем — {0}', here) });
    else takeShot('save', here);
    setSavedAt(Date.now());
  };

  const load = () => {
    if (ask?.kind !== 'load') return;
    restoreShot(ask.name);
    dropShot('prematch');   // матч, якщо він ішов, до цієї точки не належить
    close();
    go('#/');
  };

  const confirmLeave = () => { const hash = (ask as { hash: string }).hash; close(); restoreShot('prematch'); go(hash); };

  return (
    <>
      <button className="nav-toggle" aria-label={t('Меню')} aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>{Icon.list()}</button>
      {open && (
        <div className="nav-sheet" role="dialog" aria-label={t('Меню')}>
          <button className="nav-scrim" aria-label={t('Закрити')} onClick={close} />
          <div className="nav-panel">
            {ask === null && (<>
              <p className="eyebrow">Inside the Box</p>
              <ul className="rows">
                <li>
                  <button className="row" onClick={saveHere}>
                    <span>{t('Зберегти тут')}</span>
                    <i className="row-note">{savedAt ? t('збережено') : here}</i>
                  </button>
                </li>
                {save && (
                  <li>
                    <button className="row" onClick={() => setAsk({ kind: 'load', name: 'save', shot: save })}>
                      <span>{t('Повернутися до збереження')}</span>
                      <i className="row-note">{when(save.at)}</i>
                    </button>
                  </li>
                )}
                {auto && (
                  <li>
                    <button className="row" onClick={() => setAsk({ kind: 'load', name: 'auto', shot: auto })}>
                      <span>{t('Автоточка')}</span>
                      <i className="row-note">{auto.label}</i>
                    </button>
                  </li>
                )}
                {ROWS.map((r) => (
                  <li key={r.hash}>
                    <button className="row" onClick={() => pick(r.hash)}>
                      <span>{r.label}</span>
                      <i className="row-note">{r.note}</i>
                    </button>
                  </li>
                ))}
              </ul>
              <button className="row row-back" onClick={close}>{t('Повернутися до гри')}</button>
            </>)}

            {ask?.kind === 'leave' && (<>
              <p className="eyebrow">{t('Матч триває')}</p>
              <p className="nav-warn">
                {t('Матч ніде не зберігається. Якщо вийти зараз, його наче не було: ти повернешся на екран перед матчем і зіграєш цей тур заново — з тим самим суперником, погодою і установкою. Усе, що сталося на полі за сьогодні, зникне.')}
              </p>
              <button className="danger-btn" onClick={confirmLeave}>{t('Вийти, матч не зберігати')}</button>
              <button className="ghost" onClick={() => setAsk(null)}>{t('Лишитися в матчі')}</button>
            </>)}

            {ask?.kind === 'load' && (<>
              <p className="eyebrow">{t('Повернення до точки')}</p>
              <p className="nav-warn">
                {tf('Гра відкотиться до стану «{0}» від {1}. Усе, що сталося після того, зникне назовсім: зіграні матчі, тижні, рішення й те, що про тебе встигли написати. Далі гра піде з тієї точки — можна прожити це інакше.', ask.shot.label, when(ask.shot.at))}
              </p>
              <button className="danger-btn" onClick={load}>{t('Повернутися до точки')}</button>
              <button className="ghost" onClick={() => setAsk(null)}>{t('Ні, лишити як є')}</button>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}
