import { useState } from 'react';
import type { WeekOffer, WeekPick, WeekScene, WeekSceneOption } from '../engine/week';
import { VOICE_ATTRS, sceneOptionsFor } from '../engine/week';
import { VOICE_LABEL } from '../engine/voices';
import { ATTRIBUTE_LABEL, type Attribute, type VoiceKey } from '../engine/types';
import { agoLabel, countLabel, type Post } from '../engine/posts';

// Тиждень v3: три дні, у кожному три справи — одна на день. Дело показывает исход (уже выпавший,
// без кубика на экране), исход может вести в сцену-продолжение (одна на неделю), между днями —
// один пост зі стрічки. Всё применяется разом в конце: onFinish возвращает бирки для подсумка.
// Правила — engine/week.ts; экран только ведёт по дням и собирает picks.

type Props = {
  /** Дни с предложениями и исходами, уже с именами ростера. */
  days: WeekOffer[][];
  /** Сцены с именами; какая нужна — по outcome.followUp. */
  scenes: WeekScene[];
  /** Голос бачить между матчами — открывает варианты сцены с подсказкой. */
  sees: (who: VoiceKey) => boolean;
  /** Пости між днями: news[d] — после дня d. */
  news: Post[];
  /** Тренер закрив місто — почему предложений меньше. */
  locked: boolean;
  onFinish: (picks: WeekPick[]) => string[];
  onNext: () => void;
};

type Phase =
  | { p: 'pick' }
  | { p: 'outcome'; offer: WeekOffer }
  | { p: 'scene'; offer: WeekOffer; scene: WeekScene; chosen?: WeekSceneOption }
  | { p: 'news' }
  | { p: 'summary'; tags: string[] };

export function WeekScreen({ days, scenes, sees, news, locked, onFinish, onNext }: Props) {
  const [day, setDay] = useState(0);
  const [phase, setPhase] = useState<Phase>({ p: 'pick' });
  const [picks, setPicks] = useState<WeekPick[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [trainAttr, setTrainAttr] = useState<Attribute | null>(null);
  const sceneUsed = picks.some((p) => p.scene);
  const last = day >= days.length - 1;
  const dayWord = ['Перший день', 'Другий день', 'Третій день', 'Четвертий день'][day] ?? `День ${day + 1}`;

  const finish = (all: WeekPick[]) => setPhase({ p: 'summary', tags: onFinish(all) });

  /** Дальше после дела (или после сцены): пост між днями, следующий день или подсумок. */
  const advance = (all: WeekPick[]) => {
    if (last) { finish(all); return; }
    if (news[day]) { setPhase({ p: 'news' }); return; }
    nextDay();
  };
  const nextDay = () => { setDay(day + 1); setSelected(null); setTrainAttr(null); setPhase({ p: 'pick' }); };

  const confirmDay = () => {
    const offer = days[day].find((o) => o.activity.id === selected);
    if (!offer) { advance(picks); return; }
    const effect = offer.outcome?.effect ?? offer.activity.effect;
    const pick: WeekPick = {
      day, activityId: offer.activity.id,
      ...(effect.train === 'choice' ? { trainAttr: trainAttr ?? VOICE_ATTRS[offer.activity.voice][0] } : {}),
    };
    setPicks([...picks, pick]);
    setPhase(offer.outcome ? { p: 'outcome', offer } : { p: 'pick' });
    if (!offer.outcome) advance([...picks, pick]);
  };

  const afterOutcome = (offer: WeekOffer) => {
    const scene = !sceneUsed && offer.outcome?.followUp ? scenes.find((s) => s.id === offer.outcome!.followUp) : undefined;
    if (scene) setPhase({ p: 'scene', offer, scene });
    else advance(picks);
  };

  const chooseScene = (scene: WeekScene, opt: WeekSceneOption) => {
    const all = picks.map((p, i) => (i === picks.length - 1 ? { ...p, scene: { id: scene.id, option: opt.id } } : p));
    setPicks(all);
    setPhase({ p: 'scene', offer: (phase as { offer: WeekOffer }).offer, scene, chosen: opt });
  };

  const head = (
    <>
      <div className="card-minute">тиждень між матчами · {dayWord.toLowerCase()}</div>
    </>
  );

  if (phase.p === 'summary') {
    return (
      <div className="result week">
        <div className="card-minute">тиждень між матчами</div>
        <h1>Тиждень позаду</h1>
        <p className="muted">{picks.length === 0 ? 'Три дні — і жодної справи. Голоси це запам’ятають.' : 'Що береш із собою на матч:'}</p>
        <ul className="badges">
          {phase.tags.map((t) => <li key={t} className="badge badge-neutral">{t}</li>)}
        </ul>
        <button className="primary" onClick={onNext}>До матчу</button>
      </div>
    );
  }

  if (phase.p === 'news') {
    const p = news[day];
    return (
      <div className="result week">
        {head}
        <h1>Тим часом у стрічці</h1>
        <div className="posts-list">
          <article className={`post post-${p.account.kind} kind-${p.kind}`}>
            <div className="post-head">
              <span className={`avatar avatar-${p.account.kind}`}>{p.account.name.charAt(0)}</span>
              <b className="post-name">{p.account.name}</b>
              {p.account.kind !== 'fan' && <span className="verified">✓</span>}
              <span className="post-handle">{p.account.handle} · {agoLabel(p.hoursAgo)}</span>
            </div>
            <p className="post-text">{p.text}</p>
            <div className="post-foot"><span>♡ {countLabel(p.likes)}</span><span>⇄ {countLabel(p.reposts)}</span></div>
          </article>
        </div>
        <button className="primary" onClick={nextDay}>Наступний день</button>
      </div>
    );
  }

  if (phase.p === 'outcome') {
    const { offer } = phase;
    const out = offer.outcome!;
    return (
      <div className="result week">
        {head}
        <h1>{offer.activity.title}</h1>
        <p className="week-outcome">{out.text}</p>
        <p className="muted">{out.effect.note}</p>
        <button className="primary" onClick={() => afterOutcome(offer)}>{!sceneUsed && out.followUp ? 'Що далі' : last ? 'Підсумок тижня' : 'Далі'}</button>
      </div>
    );
  }

  if (phase.p === 'scene') {
    const { scene, chosen } = phase;
    return (
      <div className="result week">
        {head}
        <h1>Продовження</h1>
        <p className="week-outcome">{scene.setup}</p>
        {chosen ? (
          <>
            <p className="week-scene-chosen"><b>{chosen.label}.</b> {chosen.text}</p>
            <p className="muted">{chosen.effect.note}</p>
            <button className="primary" onClick={() => advance(picks)}>{last ? 'Підсумок тижня' : 'Далі'}</button>
          </>
        ) : (
          <div className="options">
            {sceneOptionsFor(scene, sees).map((o) => (
              <button key={o.id} className={`option ${o.insight ? 'option-insight' : ''}`} onClick={() => chooseScene(scene, o)}>
                <span className="option-label">
                  {o.label}
                  {o.insight && <i className={`origin voice-${o.insight.who}`}>відкрив {VOICE_LABEL[o.insight.who]}</i>}
                </span>
                {o.insight && <span className={`voice voice-${o.insight.who}`}><b>{VOICE_LABEL[o.insight.who]}:</b> «{o.insight.line}»</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const offers = days[day] ?? [];
  const selectedOffer = offers.find((o) => o.activity.id === selected);
  const selectedEffect = selectedOffer ? (selectedOffer.outcome?.effect ?? selectedOffer.activity.effect) : null;
  return (
    <div className="result week">
      {head}
      <h1>{day === 0 && locked ? 'Тренер закрив місто' : dayWord}</h1>
      <p className="muted">
        {day === 0 && locked ? 'Після такого матчу вибір невеликий: база, відео, психолог. Місто почекає. ' : ''}
        {day === 0 ? 'Одна справа на день. Чим закінчиться — дізнаєшся ввечері; голоси, які не кличеш, ображаються.' : 'Одна справа на день.'}
      </p>
      <div className="week-grid">
        {offers.map(({ activity: a }) => {
          const on = selected === a.id;
          return (
            <button key={a.id} className={`week-card voice-${a.voice} ${on ? 'picked' : ''}`} onClick={() => { setSelected(on ? null : a.id); setTrainAttr(null); }}>
              <span className="week-voice"><b>{VOICE_LABEL[a.voice]}</b></span>
              <span className="week-title">{a.title}</span>
              <span className="week-line">{a.line}</span>
              {on && selectedEffect?.train === 'choice' && (
                <span className="week-train" onClick={(e) => e.stopPropagation()}>
                  {VOICE_ATTRS[a.voice].map((attr) => (
                    <i key={attr} className={(trainAttr ?? VOICE_ATTRS[a.voice][0]) === attr ? 'on' : ''} onClick={() => setTrainAttr(attr)}>
                      {ATTRIBUTE_LABEL[attr]}
                    </i>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button className="primary" onClick={confirmDay}>
        {selected ? 'Так і зробити' : offers.length ? 'Нічого не робити сьогодні' : 'Далі'}
      </button>
    </div>
  );
}
