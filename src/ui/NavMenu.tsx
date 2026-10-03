import { useEffect, useState } from 'react';
import { readShot, restoreShot } from '../telemetry/checkpoint';
import { Icon } from './icons';

// Навігація в грі (M45, 03.10, скарга тестера: «не можу вийти з матчу на головний екран»).
// До цього вийти можна було тільки з двох екранів — титул і меню перед матчем, — а всередині матчу,
// тижня чи зошита виходу не було зовсім. Кнопка живе поверх усіх екранів гри (#/play) і відкриває
// лист зі звичними пунктами: картка, таблиця, налаштування, про гру, головна.
//
// Матч живе лише в пам'яті (сесія в рефах App), і будь-який перехід звідси його стирає. Тому
// всередині матчу кожен пункт спершу каже про це прямо, а не «ви впевнені?»: гравець має розуміти,
// що саме він втратить і що буде далі. Згода — і слот повертається до знімка, зробленого перед
// матчем (telemetry/checkpoint.ts), тобто тур просто не зіграно.

// Чи йде матч, меню питає саме сховище, а не App: знімок `prematch` існує рівно поки матч не записано
// в сезон (App робить його перед стартом і скидає на свистку). Так меню не треба тягнути стан гри.
type Props = { go: (hash: string) => void };

// Підпис праворуч — короткий, бо на 375 px довгий переносить і сам рядок (плейтест 03.10).
const ROWS: { hash: string; label: string; note: string }[] = [
  { hash: '#/player', label: 'Картка гравця', note: 'хто ти зараз' },
  { hash: '#/espm', label: 'Профіль на ESPM', note: 'що пишуть' },
  { hash: '#/settings', label: 'Налаштування', note: 'кидок, екран' },
  { hash: '#/about', label: 'Про гру', note: 'як це працює' },
  { hash: '#/', label: 'Головна', note: 'титул, кар\'єри' },
];

export function NavMenu({ go }: Props) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<string | null>(null);
  const inMatch = open && readShot('prematch') !== null;

  // Escape закриває — звичка з десктопа, на телефоні не заважає.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAsk(null); setOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => { setAsk(null); setOpen(false); };
  const pick = (hash: string) => { if (inMatch) setAsk(hash); else { close(); go(hash); } };
  const confirm = () => { const hash = ask!; close(); restoreShot('prematch'); go(hash); };

  return (
    <>
      <button className="nav-toggle" aria-label="Меню" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{Icon.list()}</button>
      {open && (
        <div className="nav-sheet" role="dialog" aria-label="Меню">
          <button className="nav-scrim" aria-label="Закрити" onClick={close} />
          <div className="nav-panel">
            {ask === null ? (<>
              <p className="eyebrow">Inside the Box</p>
              <ul className="rows">
                {ROWS.map((r) => (
                  <li key={r.hash}>
                    <button className="row" onClick={() => pick(r.hash)}>
                      <span>{r.label}</span>
                      <i className="row-note">{r.note}</i>
                    </button>
                  </li>
                ))}
              </ul>
              <button className="row row-back" onClick={close}>Повернутися до гри</button>
            </>) : (<>
              <p className="eyebrow">Матч триває</p>
              <p className="nav-warn">
                Матч ніде не зберігається. Якщо вийти зараз, його наче не було: ти повернешся на екран
                перед матчем і зіграєш цей тур заново — з тим самим суперником, погодою і установкою.
                Усе, що сталося на полі за сьогодні, зникне.
              </p>
              <button className="danger-btn" onClick={confirm}>Вийти, матч не зберігати</button>
              <button className="ghost" onClick={() => setAsk(null)}>Лишитися в матчі</button>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}
