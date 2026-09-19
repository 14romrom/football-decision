import { useEffect, useState } from 'react';
import type { EpisodeOption, Resolution, ResultBadge } from '../engine/types';
import { ATTRIBUTE_LABEL } from '../engine/types';
import { VOICE_LABEL } from '../engine/voices';
import { pickOutcome, POSITION_LABEL, TIER_LABEL } from '../engine/resolve';
import { modIcon, Icon } from './icons';

// Кидок і результат одним экраном (макет Г, 19.09): выбранная строка остаётся сверху красной
// полосой, под ней карточка проверки — баннер атрибута цветом голоса, форма и ціль, два кубика,
// строки факторов со знаками, итог и ярус, текст исхода, реплика второго голоса, теги, «Граємо
// далі». Шкалы и проценты по-прежнему не показываются: числа только те, что складываются.

type Props = {
  option: EpisodeOption; res: Resolution; flavor?: string; flavorVoice?: string; badges?: ResultBadge[];
  /** Цепочка сработала: куда ведёт сцена — подпись на кнопке. */
  continues?: string;
  onNext: () => void;
};

const STEP_DELAYS = [900, 700, 600];
const fmt = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');

export function RollView({ option, res, flavor, flavorVoice, badges, continues, onNext }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => { setStep(0); }, [option.id, res.roll]);
  useEffect(() => {
    if (step >= STEP_DELAYS.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_DELAYS[step]);
    return () => clearTimeout(t);
  }, [step]);

  // Один источник истины с applyChoice (resolve.ts:pickOutcome).
  const outcome = pickOutcome(option, res);
  const flat = res.totalScore - res.rawRoll;
  const [attrLine, ...rest] = res.mods;
  const mods = rest.filter((m) => m.value !== 0);
  const voice = option.voice?.who;

  return (
    <div className="scene roll" onClick={() => setStep(STEP_DELAYS.length)}>
      <div className={`choice chosen risk-${res.position}`}>
        <span className="choice-text">
          <span className="bracket">[{POSITION_LABEL[res.position]} {res.target}]</span> {option.label}
        </span>
      </div>

      <div className="check-card">
        <div className={`check-banner ${voice ? `bg-voice-${voice}` : ''}`}>
          <span>{ATTRIBUTE_LABEL[option.attribute]}</span>
          <span className="check-attr">{fmt(res.attrMod)}</span>
        </div>

        <div className="check-head">
          <span className={`check-form risk-${res.position}`}>{POSITION_LABEL[res.position]} <b>{res.target}</b></span>
          <span className="dice">
            <i className={step >= 1 ? 'shown' : 'rolling'}>{step >= 1 ? res.dice[0] : '·'}</i>
            <i className={step >= 1 ? 'shown' : 'rolling'}>{step >= 1 ? res.dice[1] : '·'}</i>
          </span>
        </div>

        {step >= 1 && (
          <ul className="mods">
            {attrLine && (
              <li className={`mod ${attrLine.value > 0 ? 'pos' : attrLine.value < 0 ? 'neg' : 'zero'}`}>
                {Icon.target()}<span className="mod-label">{attrLine.label}</span><span className="mod-value">{fmt(attrLine.value)}</span>
              </li>
            )}
            {mods.map((m) => (
              <li key={m.label} className={`mod src-${m.source} ${m.value > 0 ? 'pos' : 'neg'}`}>
                {modIcon(m.label, m.source)}<span className="mod-label">{m.label}</span><span className="mod-value">{fmt(m.value)}</span>
              </li>
            ))}
          </ul>
        )}

        {step >= 2 && (
          <div className="check-total">
            <span>{res.rawRoll} <b>{fmt(flat)}</b> = <b>{res.totalScore}</b> проти {res.target}</span>
            <span className={`tier tier-${res.tier}`}>{TIER_LABEL[res.tier]}</span>
          </div>
        )}
        {step >= 2 && res.critical === 'fail' && (
          <p className="crit-note">{res.dice[0]} і {res.dice[1]} — на такому ризику це катастрофа, навичка тут не рятує.</p>
        )}
        {step >= 2 && res.critical === 'success' && <p className="crit-note">Двадцять. Таке не пояснюють.</p>}

        {step >= 3 && (
          <>
            <p className="outcome">{outcome.text}</p>
            {flavor && <p className="say say-second"><b>{flavorVoice ?? 'ТРИБУНИ'}</b> — {flavor}</p>}
            {(option.insight || option.requires?.flags?.some((f) => f.startsWith('week_'))) && (
              <p className="origin-note">
                {option.insight
                  ? <>{VOICE_LABEL[option.insight.who]} побачив цей варіант — без нього кнопки не було б.</>
                  : <>Цей варіант з’явився завдяки тижню між матчами.</>}
              </p>
            )}
            {badges && badges.length > 0 && (
              <ul className="badges">
                {badges.map((b) => (
                  <li key={b.label} className={`badge badge-${b.tone}`}><span className="badge-icon">{b.icon}</span>{b.label}</li>
                ))}
              </ul>
            )}
            {continues && <p className="continues">Момент триває — наступне рішення на цій же хвилині.</p>}
            <button className="primary de-next" onClick={onNext}>{continues ? `Далі → ${continues}` : 'Граємо далі'}</button>
          </>
        )}
      </div>
    </div>
  );
}
