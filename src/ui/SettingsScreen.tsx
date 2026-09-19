import { useState } from 'react';
import { readSettings, writeSettings, type Settings } from '../telemetry/settings';
import { readSlotSummary, resetSlot } from '../telemetry/saves';
import { activeSlot } from '../telemetry/slots';
import { exportLogs } from '../telemetry/log';
import { slotLine } from './TitleScreen';

// Налаштування (19.09): три группы — кидок, екран, тестерам. Звука в игре нет — строки нет.
// «Вивантажити логи» переехала сюда с итога матча (там мешала) и отдаёт активный слот.
// «Стерти кар’єру» — красным, внизу, с подтверждением; после — на титул, там уже «Нова кар’єра».

type Props = { onBack: () => void; onWiped: () => void };

function Seg<T extends string>({ value, options, onChange, name }: { value: T; options: [T, string][]; onChange: (v: T) => void; name: string }) {
  return (
    <span className="seg" role="radiogroup" aria-label={name}>
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </span>
  );
}

function Toggle({ on, onChange, name }: { on: boolean; onChange: (v: boolean) => void; name: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={name} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

export function SettingsScreen({ onBack, onWiped }: Props) {
  const [s, setS] = useState<Settings>(() => readSettings());
  const [confirmWipe, setConfirmWipe] = useState(false);
  const slot = readSlotSummary(activeSlot());
  const set = (patch: Partial<Settings>) => { const next = { ...s, ...patch }; setS(next); writeSettings(next); };
  const build = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__.slice(0, 7) : 'dev';

  return (
    <div className="settings plain-screen">
      <p className="eyebrow">Inside the Box</p>
      <h1>Налаштування</h1>

      <h2 className="sect">Кидок</h2>
      <div className="set">
        <div className="l">Барабан<small>Кубики крутяться перед зупинкою</small></div>
        <Seg name="Барабан" value={s.dice} options={[['reel', 'барабан'], ['instant', 'одразу']]} onChange={(v) => set({ dice: v })} />
      </div>
      <div className="set">
        <div className="l">Вібрація на штампі<small>Катастрофу відчуєш долонею</small></div>
        <Toggle name="Вібрація на штампі" on={s.haptics} onChange={(v) => set({ haptics: v })} />
      </div>

      <h2 className="sect">Екран</h2>
      <div className="set">
        <div className="l">Менше руху<small>Без тряски й спалахів; паузи лишаються</small></div>
        <Toggle name="Менше руху" on={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
      </div>
      <div className="set">
        <div className="l">Розмір тексту</div>
        <Seg name="Розмір тексту" value={s.textSize} options={[['normal', 'звичайний'], ['large', 'більший']]} onChange={(v) => set({ textSize: v })} />
      </div>

      <h2 className="sect">Тестерам</h2>
      <button className="set set-btn" onClick={exportLogs}>
        <span className="l">Вивантажити логи<small>Рішення цієї кар’єри, JSON</small></span>
        <span className="v">слот {slot.slot + 1}</span>
      </button>
      {!slot.empty && !confirmWipe && (
        <button className="set set-btn danger" onClick={() => setConfirmWipe(true)}>
          <span className="l">Стерти кар’єру<small>Слот {slot.slot + 1} · {slotLine(slot)}</small></span>
          <span className="v">›</span>
        </button>
      )}
      {confirmWipe && (
        <div className="sheet" role="dialog" aria-labelledby="wipe-title">
          <p id="wipe-title">Слот {slot.slot + 1}, {slotLine(slot)}. Після цього — з нуля: нове ім’я в таблиці, старі голоси.</p>
          <button className="danger-btn" onClick={() => { resetSlot(slot.slot); onWiped(); }}>Стерти</button>
          <button className="ghost" onClick={() => setConfirmWipe(false)}>Залишити</button>
        </div>
      )}

      <button className="row row-back" onClick={onBack}>На титул</button>
      <p className="build">тестова збірка · {build} · ukr</p>
    </div>
  );
}
