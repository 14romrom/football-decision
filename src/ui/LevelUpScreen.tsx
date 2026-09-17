import { useState } from 'react';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABEL, type Attribute, type Player } from '../engine/types';
import { attrMod } from '../engine/context';
import type { Career } from '../engine/career';

// Показывается сразу после результата, если матч поднял уровень, и снова из меню, пока очко
// не потрачено (career.unspentPoints). Одно очко — в один атрибут по выбору игрока, не
// автоматически: рост должен ощущаться как решение, а не как строчка в логе.
// Плейтест 17.09: экран принимали за тренировку и не понимали, что нужно выбрать и подтвердить —
// поэтому шаги названы явно, а кнопка повторяет выбор.

type Props = { player: Player; career: Career; fromLevel: number; toLevel: number; onConfirm: (attr: Attribute) => void };

export function LevelUpScreen({ player, career, fromLevel, toLevel, onConfirm }: Props) {
  const [selected, setSelected] = useState<Attribute | null>(null);

  return (
    <div className="levelup">
      <h1>Новий рівень: {toLevel}</h1>
      <p className="muted">
        {fromLevel === toLevel - 1 ? `Було ${fromLevel}, стало ${toLevel}.` : `Рівень ${toLevel}, непотрачених очок: ${toLevel - fromLevel} — по одному за раз.`}
        {' '}Це не тренування — це ріст: обери один атрибут, він отримає +1 назавжди, потім підтверди.
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

      <p className={selected ? 'levelup-pick' : 'levelup-pick muted'}>
        {selected ? `Обрано: ${ATTRIBUTE_LABEL[selected]} → +1` : 'Крок 1: натисни на атрибут. Крок 2: підтверди.'}
      </p>
      <button className="primary" disabled={!selected} onClick={() => selected && onConfirm(selected)}>
        {selected ? `Підтвердити +1 до «${ATTRIBUTE_LABEL[selected]}»` : 'Спершу обери атрибут'}
      </button>
    </div>
  );
}
