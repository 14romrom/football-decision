import { useState } from 'react';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABEL, type Attribute, type Player } from '../engine/types';
import { attrMod } from '../engine/context';
import type { Career } from '../engine/career';

// Показывается сразу после результата, если матч поднял уровень. Одно очко —
// в один атрибут по выбору игрока, не автоматически: рост должен ощущаться
// как решение, а не как строчка в логе.

type Props = { player: Player; career: Career; fromLevel: number; toLevel: number; onConfirm: (attr: Attribute) => void };

export function LevelUpScreen({ player, career, fromLevel, toLevel, onConfirm }: Props) {
  const [selected, setSelected] = useState<Attribute | null>(null);

  return (
    <div className="levelup">
      <h1>Новий рівень: {toLevel}</h1>
      <p className="muted">
        {fromLevel === toLevel - 1 ? `Було ${fromLevel}, стало ${toLevel}.` : `Одразу з ${fromLevel} до ${toLevel} — сильний матч.`}
        {' '}Обери, що прокачати: +1 назавжди.
      </p>

      {ATTRIBUTE_GROUPS.map((g) => (
        <section key={g.title} className="attr-group">
          <h2>{g.title}</h2>
          <div className="train-grid">
            {g.attrs.map((a) => {
              const current = player.attrs[a] + (career.attrPoints[a] ?? 0);
              return (
                <button key={a} className={`train-attr ${selected === a ? 'picked' : ''}`} onClick={() => setSelected(a)}>
                  <span>{ATTRIBUTE_LABEL[a]}</span>
                  <b>{current} → {current + 1}</b>
                  <i className={attrMod(current + 1) === 0 ? 'zero' : ''}>+{attrMod(current + 1)}</i>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <button className="primary" disabled={!selected} onClick={() => selected && onConfirm(selected)}>
        Підтвердити
      </button>
    </div>
  );
}
