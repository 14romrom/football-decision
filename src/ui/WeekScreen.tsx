import { useState } from 'react';
import type { Activity, WeekChoice } from '../engine/week';
import { VOICE_ATTRS } from '../engine/week';
import { VOICE_LABEL } from '../engine/voices';
import { ATTRIBUTE_LABEL, type Attribute } from '../engine/types';
import { BALANCE } from '../engine/balance';

// Тиждень між матчами: шість карточек — по одной на голос, — взять до двух. Экран тонкий:
// правила в engine/week.ts, прототип получит новый UI, и этот файл заменяется целиком.

type Props = {
  /** Предложения уже с именами ростера. */
  offers: Activity[];
  /** Тренер закрив місто — показать почему предложений меньше. */
  locked: boolean;
  onConfirm: (choices: WeekChoice[]) => string[];
  onNext: () => void;
};

export function WeekScreen({ offers, locked, onConfirm, onNext }: Props) {
  const [picked, setPicked] = useState<Record<string, Attribute | true>>({});
  const [tags, setTags] = useState<string[] | null>(null);
  const ids = Object.keys(picked);
  const max = BALANCE.week.picks;

  const toggle = (a: Activity) => {
    if (tags) return;
    setPicked((p) => {
      if (p[a.id]) { const { [a.id]: _, ...rest } = p; return rest; }
      if (Object.keys(p).length >= max) return p;
      return { ...p, [a.id]: a.effect.train === 'choice' ? VOICE_ATTRS[a.voice][0] : true };
    });
  };

  const confirm = () => {
    const choices: WeekChoice[] = offers.filter((a) => picked[a.id]).map((a) => ({
      activity: a, ...(a.effect.train === 'choice' ? { trainAttr: picked[a.id] as Attribute } : {}),
    }));
    setTags(onConfirm(choices));
  };

  return (
    <div className="result week">
      <div className="card-minute">тиждень між матчами</div>
      <h1>{locked ? 'Тренер закрив місто' : 'Чим зайнятися'}</h1>
      <p className="muted">
        {locked ? 'Після такого матчу вибір невеликий: база, відео, психолог. Місто почекає. ' : ''}
        До {max === 2 ? 'двох' : max} справ на тиждень. Кожна — голос, який береш із собою на матч.
      </p>
      <div className="week-grid">
        {offers.map((a) => {
          const on = !!picked[a.id];
          return (
            <button key={a.id} className={`week-card voice-${a.voice} ${on ? 'picked' : ''}`} onClick={() => toggle(a)} disabled={!!tags}>
              <span className="week-voice"><b>{VOICE_LABEL[a.voice]}</b></span>
              <span className="week-title">{a.title}</span>
              <span className="week-line">{a.line}</span>
              {on && a.effect.train === 'choice' && (
                <span className="week-train" onClick={(e) => e.stopPropagation()}>
                  {VOICE_ATTRS[a.voice].map((attr) => (
                    <i key={attr} className={picked[a.id] === attr ? 'on' : ''} onClick={() => setPicked((p) => ({ ...p, [a.id]: attr }))}>
                      {ATTRIBUTE_LABEL[attr]}
                    </i>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tags ? (
        <>
          <ul className="badges">
            {tags.map((t) => <li key={t} className="badge badge-neutral">{t}</li>)}
          </ul>
          <button className="primary" onClick={onNext}>До матчу</button>
        </>
      ) : (
        <button className="primary" onClick={confirm}>
          {ids.length === 0 ? 'Нічого не робити цього тижня' : ids.length === 1 ? 'Одна справа — досить' : 'Підтвердити'}
        </button>
      )}
    </div>
  );
}
