import { useState } from 'react';
import { sheetFor, type PrologueOption, type ProloguePick, type PrologueSpread } from '../engine/prologue';
import { VOICE_ATTRS } from '../engine/week';
import { VOICE_LABEL } from '../engine/voices';
import { LootSheet } from './LootSheet';
import type { WeekResult } from './WeekScreen';
import { ATTRIBUTE_LABEL, type Attribute, type VoiceKey } from '../engine/types';
import { Doodles } from './doodles';

// Пролог — тиждень нуль у зошиті (M12, 20.09, макет «Пролог у зошиті», решение пользователя): той самий
// зошит, що й тиждень (nb-*), замість «День 1–3» — три розвороти: Скаут, Дзвінок, База. Порядок фаз
// обернений до тижня: там лист іде після вибору (ісход), тут — перед ним (сетап оповідача), бо все,
// що сталося, розповідає оповідач листом моменту, а Реєс тільки відповідає — стікерами голосів.
// У зошиті прози від руки немає (20.09, пользователь: «текстовые составляющие — отдельным контекстным
// окном, фразы Реєс выбирает из стикеров»): заголовок, стікери, рядок наслідку. Наприкінці — лист
// здобутків (LootSheet) і кнопка «На лаву». Правила — engine/prologue.ts.

type Props = {
  /** Розвороти з іменами ростера. */
  spreads: PrologueSpread[];
  onFinish: (picks: ProloguePick[]) => WeekResult;
  onNext: () => void;
  /** Відпустка (M15) використовує той самий екран: інша шапка, інший лист здобутків, стікери за станом арки. */
  header?: string;
  lootTab?: string;
  lootButton?: string;
  lootEmpty?: string;
  arc?: number;
  /** Підписи кнопок: пролог відповідає людям, відпустка вирішує, що робити. */
  labels?: { open: string; pick: string; confirm: string };
  /** Фінал (M16): голос відповіді скауту в пролозі — лист першого розвороту обирається ним (рима). */
  firstVoice?: VoiceKey;
  /** Фінал: партнер без дуету — розв’язка `replyCold`, якщо є. */
  cold?: boolean;
  /** Фінал: замість листа здобутків — епілог і одна кнопка. */
  epilogue?: { tab: string; text: string[]; sign: string };
};

type Phase = { p: 'sheet' } | { p: 'pick' } | { p: 'reply'; option: PrologueOption } | { p: 'summary'; result: WeekResult };

export function PrologueScreen({ spreads, onFinish, onNext, header = 'тиждень нуль · серпень', lootTab = 'ДО ПЕРШОГО МАТЧУ', lootButton = 'На лаву', lootEmpty = 'Три розвороти — і жодної відповіді.', arc = 1, labels = { open: 'Відповісти', pick: 'Обери відповідь на стікері', confirm: 'Так і відповісти' }, firstVoice, cold = false, epilogue }: Props) {
  // Стікер зі станом арки (Спокій у відпустці): нижче стану — його немає, і гравець про нього не знає.
  const visible = (o: PrologueOption) => ((o as { arcMin?: number }).arcMin ?? 1) <= arc;
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>({ p: 'sheet' });
  const [picks, setPicks] = useState<ProloguePick[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [attr, setAttr] = useState<Attribute | null>(null);
  const last = i >= spreads.length - 1;

  const confirm = () => {
    const spread = spreads[i];
    const option = spread.options.find((o) => o.id === selected);
    if (!option) return;
    const pick: ProloguePick = { spread: spread.id, option: option.id, ...(option.point ? { attr: attr ?? VOICE_ATTRS[option.voice][0] } : {}) };
    setPicks([...picks, pick]);
    setSelected(null); setAttr(null);
    // Розворот закінчується розв’язкою — реакцією співрозмовника і фактом «що далі», — а не паузою.
    setPhase({ p: 'reply', option });
  };
  const afterReply = () => {
    if (last) setPhase({ p: 'summary', result: onFinish(picks) });
    else { setI(i + 1); setPhase({ p: 'sheet' }); }
  };
  /** Голос відповіді на попередньому розвороті — луна в листі наступного. */
  const previousVoice = (d: number) => { if (d === 0) return firstVoice; const p = picks.find((x) => x.spread === spreads[d - 1]?.id); return p ? spreads[d - 1].options.find((o) => o.id === p.option)?.voice : undefined; };

  const pickOf = (s: PrologueSpread) => { const p = picks.find((x) => x.spread === s.id); return p ? s.options.find((o) => o.id === p.option) : undefined; };

  /** Стікер: обраний — обведений, решта після вибору — відірвані кутики (як у тижні). */
  const note = (o: PrologueOption, state: 'open' | 'on' | 'torn', onPick?: () => void) => {
    if (state === 'torn') return <span key={o.id} className={`nb-note nb-${o.voice} torn`} aria-hidden="true" />;
    const Tag = onPick ? 'button' : 'div';
    return (
      <Tag key={o.id} className={`nb-note nb-${o.voice} ${state === 'on' ? 'on' : ''}`} onClick={onPick} type={onPick ? 'button' : undefined}>
        <b>{VOICE_LABEL[o.voice]}</b>
        <span>{o.say}</span>
        {onPick && <i>{o.line}</i>}
        {state === 'on' && onPick && o.point === 'choice' && (
          <span className="nb-train" onClick={(e) => e.stopPropagation()}>
            {VOICE_ATTRS[o.voice].map((a) => (
              <em key={a} className={(attr ?? VOICE_ATTRS[o.voice][0]) === a ? 'on' : ''} onClick={() => setAttr(a)}>{ATTRIBUTE_LABEL[a]}</em>
            ))}
          </span>
        )}
      </Tag>
    );
  };

  /** Прожитий розворот: обраний стікер, кутики інших, рядок наслідку. */
  const done = (s: PrologueSpread) => {
    const o = pickOf(s);
    return (
      <section key={s.id} className="nb-day">
        <h3>{s.title}{o && <small>{VOICE_LABEL[o.voice].toLowerCase()}</small>}</h3>
        <div className="nb-notes compact">{s.options.filter(visible).map((x) => note(x, x === o ? 'on' : 'torn'))}</div>
        {o && <p className="nb-mark">{o.mark}</p>}
      </section>
    );
  };

  const button = (() => {
    if (phase.p === 'summary' || phase.p === 'sheet' || phase.p === 'reply') return null;   // кнопка — всередині листа
    // Поки стікер не обрано, кнопка каже, що робити: приглушена «Так і відповісти» сама по собі не пояснювала (плейтест 21.09, Б-8).
    return <button className="primary menu-primary" onClick={confirm} disabled={!selected}>{selected ? labels.confirm : labels.pick}</button>;
  })();

  return (
    <div className="result week prologue">
      <div className="card-minute">{header}</div>
      <div className={`nb-book ${phase.p === 'sheet' || phase.p === 'reply' || phase.p === 'summary' ? 'dimmed' : ''}`}>
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <defs><filter id="pen"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="3" result="t" /><feDisplacementMap in="SourceGraphic" in2="t" scale="1.6" /></filter></defs>
        </svg>
        <Doodles seed={0} />

        {spreads.map((s, d) => {
          if (phase.p === 'summary' || d < i) return done(s);
          if (d > i) return <section key={s.id} className="nb-day"><h3>{s.title}</h3><div className="nb-empty" /></section>;

          if (phase.p === 'sheet') {
            return (
              <section key={s.id} className="nb-day">
                <h3>{s.title}</h3>
                <div className="moment nb-sheet"><div className="scene">
                  <span className="minute-tab">{s.tab.toUpperCase()}</span>
                  {sheetFor(s, previousVoice(d)).map((t, k) => <p key={k} className="setup">{t}</p>)}
                  <button className="primary menu-primary nb-sheet-btn" onClick={() => setPhase({ p: 'pick' })}>{labels.open}</button>
                </div></div>
              </section>
            );
          }

          if (phase.p === 'reply') {
            // Розв’язка: обраний стікер уже обведений, інші відірвані; лист з реакцією і кнопка «Далі».
            const o = phase.option;
            return (
              <section key={s.id} className="nb-day">
                <h3>{s.title}<small>{VOICE_LABEL[o.voice].toLowerCase()}</small></h3>
                <div className="nb-notes compact">{s.options.filter(visible).map((x) => note(x, x === o ? 'on' : 'torn'))}</div>
                <div className="moment nb-sheet"><div className="scene">
                  <span className="minute-tab">{s.tab.toUpperCase()}</span>
                  <p className="nb-chosen"><b>{o.say}</b></p>
                  <p className="setup" style={{ paddingTop: 0 }}>{cold && (o as { replyCold?: string }).replyCold ? (o as { replyCold?: string }).replyCold : o.reply}</p>
                  <button className="primary menu-primary nb-sheet-btn" onClick={afterReply}>{last ? 'Що далі' : 'Далі'}</button>
                </div></div>
              </section>
            );
          }

          return (
            <section key={s.id} className="nb-day">
              <h3>{s.title}<small>{s.sub}</small></h3>
              <div className="nb-notes">
                {s.options.filter(visible).map((o) => note(o, selected === o.id ? 'on' : 'open', () => { setSelected(selected === o.id ? null : o.id); setAttr(null); }))}
              </div>
            </section>
          );
        })}

        {phase.p === 'summary' && epilogue && (
          <div className="moment nb-sheet loot-sheet"><div className="scene">
            <span className="minute-tab">{epilogue.tab.toUpperCase()}</span>
            {epilogue.text.map((t, k) => <p key={k} className="setup" style={k ? { paddingTop: 0 } : undefined}>{t}</p>)}
            <p className="nb-aside"><b>{epilogue.sign}</b></p>
            <button className="primary menu-primary nb-sheet-btn" onClick={onNext}>{lootButton}</button>
          </div></div>
        )}
        {phase.p === 'summary' && !epilogue && (
          <LootSheet tab={lootTab} loot={phase.result.loot} before={phase.result.before} after={phase.result.after}
            empty={lootEmpty} button={lootButton} onNext={onNext} />
        )}
      </div>
      {button}
    </div>
  );
}
