import { useState } from 'react';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABEL, type Attribute, type Player } from '../engine/types';
import { pointEffect, type Career } from '../engine/career';

// Показывается сразу после результата, если матч поднял уровень, и снова из меню, пока очко
// не потрачено (career.unspentPoints). Одно очко — в один атрибут по выбору игрока, не
// автоматически: рост должен ощущаться как решение, а не как строчка в логе.
// Плейтест 17.09: экран принимали за тренировку и не понимали, что нужно выбрать и подтвердить —
// поэтому шаги названы явно, а кнопка повторяет выбор. Очко = +1 к модификатору броска
// (career.ts:POINT_VALUE), и кнопка говорит, что это сделает с голосом: «Тіло почне бачити».

type Props = { player: Player; career: Career; fromLevel: number; toLevel: number; onConfirm: (attr: Attribute) => void };

export function LevelUpScreen({ player, career, fromLevel, toLevel, onConfirm }: Props) {
  const [selected, setSelected] = useState<Attribute | null>(null);

  return (
    <div className="levelup">
      <h1>Новий рівень: {toLevel}</h1>
      <p className="muted">
        {fromLevel === toLevel - 1 ? `Було ${fromLevel}, стало ${toLevel}.` : `Рівень ${toLevel}, непотрачених очок: ${toLevel - fromLevel} — по одному за раз.`}
        {' '}Це не тренування — це ріст: обери один атрибут, його кидок стане на +1 сильнішим назавжди, потім підтверди.
        Сильніший атрибут — гучніший голос: від «чутно» до «бачить».
      </p>

      {ATTRIBUTE_GROUPS.map((g) => (
        <section key={g.title} className="attr-group">
          <h2>{g.title}</h2>
          <div className="train-grid">
            {g.attrs.map((a) => {
              const e = pointEffect(player, career, a);
              const voiceNote = e.voice?.change === 'sees' ? `${e.voice.label} почне бачити`
                : e.voice?.change === 'hears' ? `${e.voice.label} стане чутно` : null;
              return (
                <button key={a} className={`train-attr ${selected === a ? 'picked' : ''} ${voiceNote ? 'wakes' : ''}`} onClick={() => setSelected(a)}>
                  <span>{ATTRIBUTE_LABEL[a]}</span>
                  <b>{e.from} → {e.to}</b>
                  <i className={e.modTo === 0 ? 'zero' : ''}>+{e.modFrom} → +{e.modTo}</i>
                  {voiceNote && <em className={`voice-${e.voice!.who}`}>{voiceNote}</em>}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <p className={selected ? 'levelup-pick' : 'levelup-pick muted'}>
        {selected ? `Обрано: ${ATTRIBUTE_LABEL[selected]} → +1 до кидка` : 'Крок 1: натисни на атрибут. Крок 2: підтверди.'}
      </p>
      <button className="primary" disabled={!selected} onClick={() => selected && onConfirm(selected)}>
        {selected ? `Підтвердити +1 до «${ATTRIBUTE_LABEL[selected]}»` : 'Спершу обери атрибут'}
      </button>
    </div>
  );
}
