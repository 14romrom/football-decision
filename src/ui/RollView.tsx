import { useEffect, useState } from 'react';
import type { EpisodeOption, Resolution } from '../engine/types';
import { EFFECT_LABEL, POSITION_LABEL, TIER_LABEL } from '../engine/resolve';

type Props = { option: EpisodeOption; res: Resolution; flavor?: string; onNext: () => void };

// Бросок должен быть событием, а не обновлением страницы: сначала пауза,
// потом кубик, потом объяснение модификаторов, и только затем — исход.
const STEP_DELAYS = [900, 700, 600];

export function RollView({ option, res, flavor, onNext }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
  }, [option.id, res.roll]);

  useEffect(() => {
    if (step >= STEP_DELAYS.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_DELAYS[step]);
    return () => clearTimeout(t);
  }, [step]);

  const outcome = option.outcomes[res.tier];

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
            <li key={m.label} className={`mod ${m.value > 0 ? 'plus' : 'minus'}`}>
              <span>{m.label}</span>
              <b>{m.value > 0 ? `+${m.value}` : `−${Math.abs(m.value)}`}</b>
            </li>
          ))}
        </ul>
      )}

      {step >= 3 && (
        <>
          <div className={`tier tier-${res.tier}`}>{TIER_LABEL[res.tier]}</div>
          <p className="outcome">{outcome.text}</p>
          {flavor && <p className="flavor">{flavor}</p>}
          <button className="primary" onClick={onNext}>Далі</button>
        </>
      )}
    </div>
  );
}
