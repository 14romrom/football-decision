import { useEffect, useState } from 'react';
import type { EpisodeOption, Resolution, ResultBadge } from '../engine/types';
import { EFFECT_LABEL, pickOutcome, POSITION_LABEL, TIER_LABEL } from '../engine/resolve';

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
        <ul className="mods">
          {res.mods.length === 0 && <li className="mod"><span>без поправок</span><b /></li>}
          {res.mods.map((m) => (
            <li key={m.label} className={`mod ${m.value > 0 ? 'plus' : m.value < 0 ? 'minus' : 'zero'}`}>
              <span>{m.label}</span>
              <b>{m.value > 0 ? `+${m.value}` : m.value < 0 ? `−${Math.abs(m.value)}` : '+0'}</b>
            </li>
          ))}
        </ul>
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
