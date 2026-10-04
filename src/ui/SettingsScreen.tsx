import { useState } from 'react';
import { readSettings, writeSettings, type Settings } from '../telemetry/settings';
import { readSlotSummary, resetSlot } from '../telemetry/saves';
import { activeSlot } from '../telemetry/slots';
import { exportLogs } from '../telemetry/log';
import { fastForward, type FastForwardResult } from '../telemetry/fastforward';
import type { AutoTarget } from '../engine/autoplay';
import { slotLine } from './TitleScreen';
import { t, tf } from '../content/i18n';

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
  const [confirmWind, setConfirmWind] = useState(false);
  const [wound, setWound] = useState<FastForwardResult | null>(null);
  const wind = (target: AutoTarget) => { setConfirmWind(false); setWound(fastForward(target)); };
  const slot = readSlotSummary(activeSlot());
  const set = (patch: Partial<Settings>) => { const next = { ...s, ...patch }; setS(next); writeSettings(next); };
  const build = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__.slice(0, 7) : 'dev';

  return (
    <div className="settings plain-screen">
      <p className="eyebrow">Inside the Box</p>
      <h1>{t('Налаштування')}</h1>

      <h2 className="sect">{t('Кидок')}</h2>
      <div className="set">
        <div className="l">{t('Барабан')}<small>{t('Кубики крутяться перед зупинкою')}</small></div>
        <Seg name={t('Барабан')} value={s.dice} options={[['reel', t('барабан')], ['instant', t('одразу')]]} onChange={(v) => set({ dice: v })} />
      </div>
      <div className="set">
        <div className="l">{t('Вібрація на штампі')}<small>{t('Катастрофу відчуєш долонею')}</small></div>
        <Toggle name={t('Вібрація на штампі')} on={s.haptics} onChange={(v) => set({ haptics: v })} />
      </div>
      <div className="set">
        <div className="l">{t('Підказки в першому матчі')}<small>{t('Прожектор на дужки, кубики, голоси і штамп')}</small></div>
        <Toggle name={t('Підказки в першому матчі')} on={s.hints} onChange={(v) => set({ hints: v })} />
      </div>

      {/* Мова (M47): українська й англійська рівні, головної версії немає. Контент перекладається
          один раз при завантаженні модуля (content/i18n.ts), тому вибір застосовується
          перезавантаженням — інакше половина екранів лишилась би старою мовою. Перемикати можна
          посеред кар'єри: збереження мовою не пахне, у ньому ідентифікатори. Рядки, записані до
          перемикання (нотатка брифінгу, сліди флагів, моменти зіграного матчу), лишаються старою
          мовою, доки не згаснуть — це один-два матчі. */}
      <h2 className="sect">{t('Мова')}</h2>
      <div className="set">
        <div className="l">{t('Мова гри')}<small>{t('Перемикання перезавантажує гру; кар’єра не втрачається')}</small></div>
        <Seg name={t('Мова гри')} value={s.lang} options={[['uk', t('українська')], ['en', 'English']]}
          onChange={(v) => { writeSettings({ ...s, lang: v }); location.reload(); }} />
      </div>

      <h2 className="sect">{t('Екран')}</h2>
      <div className="set">
        <div className="l">{t('Менше руху')}<small>{t('Без тряски й спалахів; паузи лишаються')}</small></div>
        <Toggle name={t('Менше руху')} on={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
      </div>
      <div className="set">
        <div className="l">{t('Розмір тексту')}</div>
        <Seg name={t('Розмір тексту')} value={s.textSize} options={[['normal', t('звичайний')], ['large', t('більший')]]} onChange={(v) => set({ textSize: v })} />
      </div>

      <h2 className="sect">{t('Тестерам')}</h2>
      <button className="set set-btn" onClick={exportLogs}>
        <span className="l">{t('Вивантажити логи')}<small>{t('Рішення цієї кар’єри, JSON')}</small></span>
        <span className="v">{tf('слот {0}', slot.slot + 1)}</span>
      </button>
      <a className="set set-btn" href="#/stats">
        <span className="l">{t('Розподіл виборів')}<small>{t('Які варіанти обирають у кожній сцені')}</small></span>
        <span className="v">›</span>
      </a>

      {/* Перемотка (M34.2): щоб перевірити відпустку, не треба грати десять турів руками. Кар'єра
          доігрується тим самим рушієм і випадковими рішеннями — стан виходить справжній, з пам'яттю
          тижня й флагами, а не синтезований. Перед перемоткою сама стає контрольна точка. */}
      {!wound && (
        <button className="set set-btn" onClick={() => setConfirmWind(true)}>
          <span className="l">{t('Перемотати кар’єру')}<small>{t('Доіграти за гравця до ключової події')}</small></span>
          <span className="v">›</span>
        </button>
      )}
      {confirmWind && !wound && (
        <div className="sheet" role="dialog" aria-label={t('Перемотати')}>
          <p>
            {t('Гра доіграє за тебе — випадковими рішеннями, тим самим рушієм, що й у грі. Кар’єра вийде справжня: з пам’яттю тижня, флагами й людьми, тільки прожита не тобою. Поточний стан слота збережеться в контрольну точку, щоб можна було повернутися.')}
          </p>
          <button className="danger-btn" onClick={() => wind({ kind: 'vacation' })}>{t('До відпустки (кінець першого сезону)')}</button>
          <button className="danger-btn" onClick={() => wind({ kind: 'ending' })}>{t('До фіналу (кінець другого)')}</button>
          <button className="danger-btn" onClick={() => wind({ kind: 'rounds', n: 1 })}>{t('На один тур уперед')}</button>
          <button className="ghost" onClick={() => setConfirmWind(false)}>{t('Не треба')}</button>
        </div>
      )}
      {wound && (
        <div className="sheet" role="status">
          <p>
            {tf('Доіграно турів: {0}.', wound.played)}{wound.vacationAuto && t(' Відпустку теж пройдено навмання — у другому сезоні це видно по тому, хто що знає.')}
            {' '}{t('Повернутися до стану перед перемоткою — у меню гри, «Повернутися до збереження».')}
          </p>
          <button className="danger-btn" onClick={onWiped}>{t('На головну')}</button>
        </div>
      )}
      {!slot.empty && !confirmWipe && (
        <button className="set set-btn danger" onClick={() => setConfirmWipe(true)}>
          <span className="l">{t('Стерти кар’єру')}<small>{tf('Слот {0} · {1}', slot.slot + 1, slotLine(slot))}</small></span>
          <span className="v">›</span>
        </button>
      )}
      {confirmWipe && (
        <div className="sheet" role="dialog" aria-labelledby="wipe-title">
          <p id="wipe-title">{tf('Слот {0}, {1}. Після цього — з нуля: нове ім’я в таблиці, старі голоси.', slot.slot + 1, slotLine(slot))}</p>
          <button className="danger-btn" onClick={() => { resetSlot(slot.slot); onWiped(); }}>{t('Стерти')}</button>
          <button className="ghost" onClick={() => setConfirmWipe(false)}>{t('Залишити')}</button>
        </div>
      )}

      <button className="row row-back" onClick={onBack}>{t('На головну')}</button>
      <p className="build">{tf('тестова збірка · {0} · ukr', build)}</p>
    </div>
  );
}
