import { useState } from 'react';
import type { WeekOption, WeekScene } from '../engine/week';
import type { ResultBadge } from '../engine/types';

// Тиждень між матчами: одна сцена, 2–3 варианта без броска, результат и бирки того,
// что изменилось. Экран нарочно тонкий: правила — в engine/week.ts, прототип получит
// новый UI, и этот файл заменяется целиком.

type Props = {
  scene: WeekScene;
  /** Текст сцены уже с именами и следом решения (weekSceneText + fillNames). */
  text: string;
  /** Варианты и результат — тоже с именами. */
  options: WeekOption[];
  /** Выбор применён снаружи; возвращает бирки для показа. */
  onChoose: (option: WeekOption) => ResultBadge[];
  onNext: () => void;
};

export function WeekScreen({ scene, text, options, onChoose, onNext }: Props) {
  const [chosen, setChosen] = useState<{ option: WeekOption; badges: ResultBadge[] } | null>(null);

  return (
    <div className="result week">
      <div className="card-minute">тиждень між матчами</div>
      <h1>{scene.title}</h1>
      <p className="setup">{text}</p>
      {chosen ? (
        <>
          <p className="week-result">{chosen.option.result}</p>
          {chosen.badges.length > 0 && (
            <ul className="badges">
              {chosen.badges.map((b) => (
                <li key={b.label} className={`badge badge-${b.tone}`}><span className="badge-icon">{b.icon}</span>{b.label}</li>
              ))}
            </ul>
          )}
          <button className="primary" onClick={onNext}>Далі</button>
        </>
      ) : (
        <div className="options">
          {options.map((o) => (
            <button key={o.id} className="option" onClick={() => setChosen({ option: o, badges: onChoose(o) })}>
              <span className="option-label">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
