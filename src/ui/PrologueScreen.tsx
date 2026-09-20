import { useState } from 'react';
import type { PrologueOption, ProloguePick, PrologueSpread } from '../engine/prologue';
import { VOICE_ATTRS } from '../engine/week';
import { VOICE_LABEL } from '../engine/voices';
import { ATTRIBUTE_LABEL, type Attribute } from '../engine/types';
import { Doodles } from './doodles';

// Пролог — тиждень нуль у зошиті (M12, 20.09, макет «Пролог у зошиті», решение пользователя): той самий
// зошит, що й тиждень (nb-*), замість «День 1–3» — три розвороти: Скаут, Дзвінок, База. Порядок фаз
// обернений до тижня: там лист іде після вибору (ісход), тут — перед ним (сетап оповідача), бо все,
// що сталося, розповідає оповідач листом моменту, а Реєс тільки відповідає — стікерами голосів.
// У зошиті прози від руки немає (20.09, пользователь: «текстовые составляющие — отдельным контекстным
// окном, фразы Реєс выбирает из стикеров»): заголовок, стікери, рядок наслідку. Наприкінці — список
// «до першого матчу» і кнопка «На лаву». Правила — engine/prologue.ts.

type Props = {
  /** Розвороти з іменами ростера. */
  spreads: PrologueSpread[];
  onFinish: (picks: ProloguePick[]) => string[];
  onNext: () => void;
};

type Phase = { p: 'sheet' } | { p: 'pick' } | { p: 'summary'; tags: string[] };

export function PrologueScreen({ spreads, onFinish, onNext }: Props) {
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
    const all = [...picks, pick];
    setPicks(all);
    setSelected(null); setAttr(null);
    if (last) setPhase({ p: 'summary', tags: onFinish(all) });
    else { setI(i + 1); setPhase({ p: 'sheet' }); }
  };

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
        <div className="nb-notes compact">{s.options.map((x) => note(x, x === o ? 'on' : 'torn'))}</div>
        {o && <p className="nb-mark">{o.mark}</p>}
      </section>
    );
  };

  const button = (() => {
    if (phase.p === 'summary') return <button className="primary menu-primary" onClick={onNext}>На лаву</button>;
    if (phase.p === 'sheet') return null;   // кнопка — всередині листа
    return <button className="primary menu-primary" onClick={confirm} disabled={!selected}>Так і відповісти</button>;
  })();

  return (
    <div className="result week prologue">
      <div className="card-minute">тиждень нуль · серпень</div>
      <div className={`nb-book ${phase.p === 'sheet' ? 'dimmed' : ''}`}>
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
                  {s.sheet.map((t, k) => <p key={k} className="setup">{t}</p>)}
                  <button className="primary menu-primary nb-sheet-btn" onClick={() => setPhase({ p: 'pick' })}>Відповісти</button>
                </div></div>
              </section>
            );
          }

          return (
            <section key={s.id} className="nb-day">
              <h3>{s.title}<small>{s.sub}</small></h3>
              <div className="nb-notes">
                {s.options.map((o) => note(o, selected === o.id ? 'on' : 'open', () => { setSelected(selected === o.id ? null : o.id); setAttr(null); }))}
              </div>
            </section>
          );
        })}

        {phase.p === 'summary' && (
          <div className="nb-list">
            <h4>до першого матчу:</h4>
            {phase.tags.map((t) => <div key={t} className="ok">{t}</div>)}
          </div>
        )}
      </div>
      {button}
    </div>
  );
}
