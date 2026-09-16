import { useState } from 'react';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABEL, type Attribute, type Player } from '../engine/types';
import { attrMod } from '../engine/context';
import type { Career } from '../engine/career';

// Тренування между матчами — один бросок, а не менюшка «выбери атрибут, получи +1».
// Один раз за цикл: career.trainedThisCycle гасится в конце матча (см. career.ts)
// и открывает окно ровно до следующего кидка сюда.

type TrainResult = { attr: Attribute; success: boolean; roll: number };

type Props = {
  player: Player;
  career: Career;
  onTrain: (attr: Attribute) => TrainResult;
  onBack: () => void;
};

export function TrainingScreen({ player, career, onTrain, onBack }: Props) {
  const [selected, setSelected] = useState<Attribute | null>(null);
  const [result, setResult] = useState<TrainResult | null>(null);

  if (career.trainedThisCycle && !result) {
    return (
      <div className="training">
        <h1>Тренування</h1>
        <p className="muted">Один підхід між матчами вже використано. Наступний — після фінального свистка.</p>
        <button className="primary" onClick={onBack}>Назад</button>
      </div>
    );
  }

  if (result) {
    const label = ATTRIBUTE_LABEL[result.attr];
    return (
      <div className="training">
        <h1>Тренування</h1>
        <div className={`die shown`}>{result.roll}</div>
        {result.success ? (
          <p className="outcome">Вийшло. +1 до «{label}» — назавжди залишиться з тобою.</p>
        ) : (
          <p className="outcome">Не цього разу. «{label}» лишається на тому ж рівні — спробуєш після наступного матчу.</p>
        )}
        <button className="primary" onClick={onBack}>Назад</button>
      </div>
    );
  }

  return (
    <div className="training">
      <h1>Тренування</h1>
      <p className="muted">Обери, над чим працювати сьогодні. Результат не гарантовано — один кидок кубиків.</p>

      {ATTRIBUTE_GROUPS.map((g) => (
        <section key={g.title} className="attr-group">
          <h2>{g.title}</h2>
          <div className="train-grid">
            {g.attrs.map((a) => (
              <button
                key={a}
                className={`train-attr ${selected === a ? 'picked' : ''}`}
                onClick={() => setSelected(a)}
              >
                <span>{ATTRIBUTE_LABEL[a]}</span>
                <b>{player.attrs[a] + (career.attrPoints[a] ?? 0)}</b>
                <i className={attrMod(player.attrs[a] + (career.attrPoints[a] ?? 0)) === 0 ? 'zero' : ''}>
                  +{attrMod(player.attrs[a] + (career.attrPoints[a] ?? 0))}
                </i>
              </button>
            ))}
          </div>
        </section>
      ))}

      <div className="actions">
        <button className="primary" disabled={!selected} onClick={() => selected && setResult(onTrain(selected))}>
          Тренуватися
        </button>
        <button onClick={onBack}>Назад</button>
      </div>
    </div>
  );
}
