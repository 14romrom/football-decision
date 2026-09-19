import { useState } from 'react';
import { readSettings, writeSettings, type Settings } from '../telemetry/settings';
import { readSlotSummary, resetSlot } from '../telemetry/saves';
import { activeSlot } from '../telemetry/slots';
import { exportLogs } from '../telemetry/log';
import { buildLabel, slotLine } from './TitleScreen';

// Налаштування (19.09): те же строки, что условия на брифинге — подпись слева, текущее значение
// справа словами, тап по строке переключает. Без тумблеров и сегмент-контролов: они из UI-кита,
// а не из игры (замечание пользователя). Звука в игре нет — строки нет. «Вивантажити логи» переехала
// сюда с итога матча и отдаёт активный слот. «Стерти кар’єру» — внизу, красным, с подтверждением.

type Props = { onBack: () => void; onWiped: () => void };

function Row({ label, value, note, onClick, tone, pressed }: { label: string; value: string; note?: string; onClick: () => void; tone?: 'danger'; pressed?: boolean }) {
  return (
    <button className={`set-row ${tone ?? ''}`} onClick={onClick} aria-pressed={pressed}>
      <span className="slot-dt">{label}</span>
      <span className="slot-dd"><b>{value}.</b>{note && <> {note}</>}</span>
    </button>
  );
}

export function SettingsScreen({ onBack, onWiped }: Props) {
  const [s, setS] = useState<Settings>(() => readSettings());
  const [confirmWipe, setConfirmWipe] = useState(false);
  const slot = readSlotSummary(activeSlot());
  const set = (patch: Partial<Settings>) => { const next = { ...s, ...patch }; setS(next); writeSettings(next); };

  return (
    <div className="settings plain-screen">
      <h1>Налаштування</h1>
      <p className="muted">Тап по рядку змінює.</p>

      <h2>Кидок</h2>
      <div className="conditions">
        <Row label="Кубики" value={s.dice === 'reel' ? 'Барабан' : 'Одразу'}
          note={s.dice === 'reel' ? 'Крутяться й сповільнюються перед зупинкою.' : 'Стоять з першого кадру, паузи лишаються.'}
          onClick={() => set({ dice: s.dice === 'reel' ? 'instant' : 'reel' })} pressed={s.dice === 'reel'} />
        <Row label="Вібрація" value={s.haptics ? 'Увімкнена' : 'Вимкнена'}
          note={s.haptics ? 'Штамп вердикту відчуєш долонею.' : undefined}
          onClick={() => set({ haptics: !s.haptics })} pressed={s.haptics} />
      </div>

      <h2>Екран</h2>
      <div className="conditions">
        <Row label="Рух" value={s.reduceMotion ? 'Менше' : 'Як зазвичай'}
          note={s.reduceMotion ? 'Без тряски й спалахів; паузи лишаються.' : undefined}
          onClick={() => set({ reduceMotion: !s.reduceMotion })} pressed={s.reduceMotion} />
        <Row label="Текст" value={s.textSize === 'large' ? 'Більший' : 'Звичайний'}
          onClick={() => set({ textSize: s.textSize === 'large' ? 'normal' : 'large' })} pressed={s.textSize === 'large'} />
      </div>

      <h2>Тестерам</h2>
      <div className="conditions">
        <Row label="Логи" value="Вивантажити" note={`Рішення цієї кар’єри (слот ${slot.slot + 1}), JSON.`} onClick={exportLogs} />
        {!slot.empty && !confirmWipe && (
          <Row label="Кар’єра" value="Стерти" note={`Слот ${slot.slot + 1}, ${slotLine(slot)}.`} tone="danger" onClick={() => setConfirmWipe(true)} />
        )}
      </div>
      {confirmWipe && (
        <div className="sheet" role="dialog" aria-labelledby="wipe-title">
          <p id="wipe-title">Слот {slot.slot + 1}, {slotLine(slot)}. Після цього — з нуля: нове ім’я в таблиці, старі голоси.</p>
          <button className="danger-btn" onClick={() => { resetSlot(slot.slot); onWiped(); }}>Стерти</button>
          <button className="ghost" onClick={() => setConfirmWipe(false)}>Залишити</button>
        </div>
      )}

      <button className="row row-back" onClick={onBack}>На титул</button>
      <p className="build">{buildLabel()}</p>
    </div>
  );
}
