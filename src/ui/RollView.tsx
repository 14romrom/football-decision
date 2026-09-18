import { VOICE_LABEL } from '../engine/voices';
import { useEffect, useState } from 'react';
import type { EpisodeOption, Resolution, ResultBadge } from '../engine/types';
import { ATTRIBUTE_LABEL } from '../engine/types';
import { EFFECT_LABEL, pickOutcome, POSITION_LABEL, TIER_LABEL } from '../engine/resolve';
import { THRESHOLDS } from '../engine/balance';

// Экран броска в духе Disco Elysium (плейтест 17.09: шкалы и составные полосы «учат считать,
// а не читать»). Два кубика — видно, что выпало и почему катастрофу не выкупить; баннер —
// что произошло; исход говорит голосом атрибута с пометкой [форма: ярус, запас]; реплика по
// ситуации — второй голос; поправки — одной строкой мелко, цвет по источнику (ти / поле).

type Props = {
  option: EpisodeOption; res: Resolution; flavor?: string; flavorVoice?: string; badges?: ResultBadge[];
  /** Цепочка сработала: куда ведёт сцена — подпись на кнопке. */
  continues?: string;
  onNext: () => void;
};

const STEP_DELAYS = [900, 700, 600];

const BANNER: Record<Resolution['tier'], string> = {
  clean: 'перевірку пройдено', cost: 'вийшло, але…', fail: 'не вийшло', badFail: 'катастрофа',
};

/** Запас — словами, без чисел порогов: «на волосині» / «із запасом». */
function margin(res: Resolution): string | null {
  if (res.critical) return null;
  const base = THRESHOLDS[res.position];
  const t = { fail: base.fail + res.difficulty, cost: base.cost + res.difficulty };
  const s = res.totalScore;
  if (res.tier === 'clean') return s - t.cost <= 1 ? 'на волосині' : s - t.cost >= 4 ? 'із запасом' : null;
  if (res.tier === 'cost') return t.cost - s <= 1 ? 'майже чисто' : s - t.fail <= 1 ? 'ледь не провал' : null;
  if (res.tier === 'fail') return t.fail - s <= 1 ? 'не вистачило кроку' : null;
  return null;
}

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
  const m = margin(res);
  const tag = `${POSITION_LABEL[res.position]} ${res.target}: ${TIER_LABEL[res.tier].toLowerCase().replace('…', '')}${m ? ', ' + m : ''}`;
  const mods = res.mods.filter((m) => m.value !== 0 || m === res.mods[0]);

  return (
    <div className="card roll de" onClick={() => setStep(STEP_DELAYS.length)}>
      <div className="roll-head">{option.label} · {POSITION_LABEL[res.position]} · {EFFECT_LABEL[res.effect]}</div>

      <div className="dice-row">
        <div className={`d10 ${step >= 1 ? 'shown' : 'rolling'}`}>{step >= 1 ? res.dice[0] : '·'}</div>
        <div className={`d10 ${step >= 1 ? 'shown' : 'rolling'}`}>{step >= 1 ? res.dice[1] : '·'}</div>
        {step >= 2 && (
          <div className="dice-sum">
            {res.rawRoll} на кубиках {fmt(flat)} поправок<br /><b>{res.totalScore}</b> проти цілі <b>{res.target}</b>
          </div>
        )}
      </div>

      {step >= 2 && (
        <>
          <div className={`banner banner-${res.tier}`}>{BANNER[res.tier]}</div>
          {res.critical === 'fail' && (
            <p className="crit-note">{res.dice[0]} і {res.dice[1]} — на такому ризику це катастрофа, навичка тут не рятує.</p>
          )}
          {res.critical === 'success' && <p className="crit-note">Двадцять. Таке не пояснюють.</p>}
        </>
      )}

      {step >= 3 && (
        <>
          <p className="line">
            <span className="voice-name src-player">{ATTRIBUTE_LABEL[option.attribute]}</span>
            <span className="voice-tag"> [{tag}]</span> — {outcome.text}
          </p>
          {flavor && (
            <p className="line line-second">
              <span className="voice-name src-field">{flavorVoice ?? 'ТРИБУНИ'}</span> — {flavor}
            </p>
          )}
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
          <p className="modline">
            {mods.map((m, i) => (
              <span key={m.label} className={`modchip src-${m.source} ${m.value < 0 ? 'neg' : ''}`}>
                {i > 0 && <span className="dot"> · </span>}{fmt(m.value)} {m.label}
              </span>
            ))}
          </p>
          {continues && <p className="continues">Момент триває — наступне рішення на цій же хвилині.</p>}
          <button className="primary de-next" onClick={onNext}>{continues ? `Далі → ${continues}` : 'Далі ►'}</button>
        </>
      )}
    </div>
  );
}
