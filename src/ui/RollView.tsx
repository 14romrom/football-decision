import { useEffect, useState } from 'react';
import type { EpisodeOption, Resolution, ResultBadge } from '../engine/types';
import { EFFECT_LABEL, pickOutcome, POSITION_LABEL, TIER_LABEL } from '../engine/resolve';
import { THRESHOLDS } from '../engine/balance';

/** Три источника итога: кубик, ти (атрибут, голос, стан), поле (суперник, погода, люди). */
function parts(res: Resolution) {
  const sum = (src: 'player' | 'field', sign: 1 | -1) =>
    res.mods.filter((m) => m.source === src && Math.sign(m.value) === sign).reduce((s, m) => s + m.value, 0);
  return {
    dice: res.rawRoll,
    youPlus: sum('player', 1), fieldPlus: sum('field', 1),
    minus: sum('player', -1) + sum('field', -1),   // отрицательное число
    you: sum('player', 1) + sum('player', -1), field: sum('field', 1) + sum('field', -1),
  };
}

const fmt = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');

/** Шкала итога: провал | вийшло, але… | чисто — и где на ней оказался score. Без чисел
 *  порогов, только положение: плейтест 17.09 — «6 на кубику, а результат чистый, непонятно».
 *  Над зонами — из чего сложился итог: кубик, ти, поле; минусы — красный откат от итога.
 *  Катастрофа — по сырым кубикам, на шкале её нет, о ней говорит отдельная строка. */
function ScoreBar({ res }: { res: Resolution }) {
  const t = THRESHOLDS[res.position];
  const lo = 0;
  const hi = t.cost + 8;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const p = parts(res);
  const gross = p.dice + p.youPlus + p.fieldPlus;   // без минусов; итог = gross + minus
  return (
    <div className="scorebar" aria-label="шкала результату">
      <div className="scorebar-parts">
        <span className="part part-dice" style={{ left: `${pct(lo)}%`, width: `${pct(p.dice) - pct(lo)}%` }} />
        {p.youPlus > 0 && <span className="part part-you" style={{ left: `${pct(p.dice)}%`, width: `${pct(p.dice + p.youPlus) - pct(p.dice)}%` }} />}
        {p.fieldPlus > 0 && <span className="part part-field" style={{ left: `${pct(p.dice + p.youPlus)}%`, width: `${pct(gross) - pct(p.dice + p.youPlus)}%` }} />}
        {p.minus < 0 && <span className="part part-minus" style={{ left: `${pct(res.totalScore)}%`, width: `${pct(gross) - pct(res.totalScore)}%` }} />}
      </div>
      <div className="scorebar-zones">
        <span className="zone zone-fail" style={{ width: `${pct(t.fail)}%` }}>провал</span>
        <span className="zone zone-cost" style={{ width: `${pct(t.cost) - pct(t.fail)}%` }}>вийшло, але…</span>
        <span className="zone zone-clean" style={{ width: `${100 - pct(t.cost)}%` }}>чисто</span>
      </div>
      <i className="scorebar-mark" style={{ left: `${pct(res.totalScore)}%` }} />
    </div>
  );
}

/** continues — цепочка сработала: следующее решение будет на этой же минуте (плейтест 17.09:
 *  «сцена продолжилась, но это было неочевидно»). */
type Props = { option: EpisodeOption; res: Resolution; flavor?: string; badges?: ResultBadge[]; continues?: string; onNext: () => void };

// Бросок должен быть событием, а не обновлением страницы: сначала пауза,
// потом кубик, потом объяснение модификаторов, и только затем — исход.
const STEP_DELAYS = [900, 700, 600];

export function RollView({ option, res, flavor, badges, continues, onNext }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
  }, [option.id, res.roll]);

  useEffect(() => {
    if (step >= STEP_DELAYS.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_DELAYS[step]);
    return () => clearTimeout(t);
  }, [step]);

  // Один источник истины с applyChoice (resolve.ts:pickOutcome) — иначе на критическом
  // успехе тут показывался бы обычный «чисто», а в ленту уходил бы другой, крит-текст.
  const outcome = pickOutcome(option, res);

  return (
    <div className="card roll" onClick={() => setStep(STEP_DELAYS.length)}>
      <div className="roll-head">
        {option.label} · {POSITION_LABEL[res.position]} · {EFFECT_LABEL[res.effect]}
      </div>

      <div className={`die ${step >= 1 ? 'shown' : 'rolling'}`}>
        {step >= 1 ? res.rawRoll : '…'}
      </div>

      {step >= 2 && (
        <>
        <ul className="mods">
          {res.mods.length === 0 && <li className="mod"><span>без поправок</span><b /></li>}
          {res.mods.map((m) => (
            <li key={m.label} className={`mod src-${m.source} ${m.value > 0 ? 'plus' : m.value < 0 ? 'minus' : 'zero'}`}>
              <span><i className="src-dot" />{m.label}</span>
              <b>{m.value > 0 ? `+${m.value}` : m.value < 0 ? `−${Math.abs(m.value)}` : '+0'}</b>
            </li>
          ))}
        </ul>
        {/* Сумма — не вероятность, а арифметика броска: кубик, ти, поле. */}
        {(() => { const p = parts(res); return (
          <p className="total">
            <span className="chip chip-dice">🎲 {p.dice}</span>
            <span className={`chip chip-you ${p.you < 0 ? 'neg' : ''}`}>ти {fmt(p.you)}</span>
            <span className={`chip chip-field ${p.field < 0 ? 'neg' : ''}`}>поле {fmt(p.field)}</span>
            <span className="eq">=</span> <b>{res.totalScore}</b>
          </p>
        ); })()}
        <ScoreBar res={res} />
        </>
      )}

      {step >= 3 && (
        <>
          <div className={`tier tier-${res.tier}`}>{TIER_LABEL[res.tier]}</div>
          {res.critical === 'fail' && (
            <p className="crit-note">{res.rawRoll} на кубиках — на такому ризику це катастрофа, навичка тут не рятує.</p>
          )}
          {res.critical === 'success' && (
            <p className="crit-note">Двадцять. Таке не пояснюють.</p>
          )}
          {badges && badges.length > 0 && (
            <ul className="badges">
              {badges.map((b) => (
                <li key={b.label} className={`badge badge-${b.tone}`}>
                  <span className="badge-icon">{b.icon}</span>{b.label}
                </li>
              ))}
            </ul>
          )}
          <p className="outcome">{outcome.text}</p>
          {flavor && <p className="flavor">{flavor}</p>}
          {continues && <p className="continues">Момент триває — наступне рішення на цій же хвилині.</p>}
          <button className="primary" onClick={onNext}>{continues ? `Далі → ${continues}` : 'Далі'}</button>
        </>
      )}
    </div>
  );
}
