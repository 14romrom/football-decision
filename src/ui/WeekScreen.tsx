import { useState } from 'react';
import type { WeekOffer, WeekPick, WeekScene, WeekSceneOption } from '../engine/week';
import { VOICE_ATTRS, sceneFor, sceneOptionsFor } from '../engine/week';
import { VOICE_LABEL } from '../engine/voices';
import { ATTRIBUTE_LABEL, type Attribute, type VoiceKey } from '../engine/types';
import { Doodles } from './doodles';

// Тиждень v3: три дні, у кожному три справи — одна на день; исход уже выпавший, может вести в сцену
// (одна на неделю); всё применяется разом в конце (onFinish → бирки). Правила — engine/week.ts.
//
// Вид — зошит Реєса (19.09, макет «Тиждень у зошиті», вариант А v2, решение пользователя): один
// розворот у лінійку з червоним полем замість чотирьох екранів. Дні — заголовки від руки; пропозиції
// голосів — стікери на скотчі в кольорі голосу (тап — обвів ручкою, інші відриваються, лишаються
// кутики); запис вечора — від руки чорнилом обраного голосу: «ти» в тексті — це голос пише Реєсу,
// не Реєс собі (тексты недели во втором лице, переписывать не нужно); сцена-продовження — дописка
// чорним, варіанти — рядки з клітинками; підсумок — список «до матчу» з галочками замість екрана
// «Тиждень позаду». Усе Neucha (як маркер на дошці: там капс і чужа рука, тут строчні й паста);
// кнопка знизу — наша, не частина зошита. На полях — малюнки ручкою (doodles.tsx). Відкат, якщо
// тестери спіткнуться об читаність: записи в Lora, решта від руки.

type Props = {
  /** Дни с предложениями и исходами, уже с именами ростера. */
  days: WeekOffer[][];
  /** Сцены с именами; какая нужна — по outcome.followUp. */
  scenes: WeekScene[];
  /** Голос бачить между матчами — открывает варианты сцены с подсказкой. */
  sees: (who: VoiceKey) => boolean;
  /** Тренер закрив місто — почему предложений меньше. */
  locked: boolean;
  /** Сцены, уже виденные в карьере (week.ts:seenScenes) — дословно не повторяем. */
  seen: Set<string>;
  /** Сид для малюнків на полях — тур сезона. */
  seed?: number;
  onFinish: (picks: WeekPick[]) => string[];
  onNext: () => void;
};

type Phase =
  | { p: 'pick' }
  | { p: 'outcome'; offer: WeekOffer }
  | { p: 'scene'; offer: WeekOffer; scene: WeekScene; chosen?: WeekSceneOption }
  | { p: 'summary'; tags: string[] };

const DAY = ['День 1', 'День 2', 'День 3', 'День 4'];

export function WeekScreen({ days, scenes, sees, locked, seen, seed = 0, onFinish, onNext }: Props) {
  const [day, setDay] = useState(0);
  const [phase, setPhase] = useState<Phase>({ p: 'pick' });
  const [picks, setPicks] = useState<WeekPick[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [trainAttr, setTrainAttr] = useState<Attribute | null>(null);
  const sceneUsed = picks.some((p) => p.scene);
  const last = day >= days.length - 1;

  const finish = (all: WeekPick[]) => setPhase({ p: 'summary', tags: onFinish(all) });

  /** Дальше после дела (или после сцены): следующий день или подсумок. Пост «тим часом у стрічці»
   *  між днями убран (19.09, пользователь): экран с одной новостью — лишний шаг. */
  const advance = (all: WeekPick[]) => {
    if (last) { finish(all); return; }
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
    const scene = sceneFor(offer.outcome, scenes, seen, sceneUsed);
    if (scene) setPhase({ p: 'scene', offer, scene });
    else advance(picks);
  };

  const chooseScene = (scene: WeekScene, opt: WeekSceneOption) => {
    const all = picks.map((p, i) => (i === picks.length - 1 ? { ...p, scene: { id: scene.id, option: opt.id } } : p));
    setPicks(all);
    setPhase({ p: 'scene', offer: (phase as { offer: WeekOffer }).offer, scene, chosen: opt });
  };

  // ——— що вже записано в кожен день ———
  const pickOf = (d: number) => picks.find((p) => p.day === d);
  const offerOf = (d: number) => { const p = pickOf(d); return p ? days[d].find((o) => o.activity.id === p.activityId) : undefined; };
  const sceneTextOf = (d: number) => {
    const p = pickOf(d);
    if (!p?.scene) return undefined;
    const sc = scenes.find((s) => s.id === p.scene!.id);
    return sc?.options.find((o) => o.id === p.scene!.option)?.text;
  };

  /** Стікер: обраний — обведений, решта після вибору — відірвані кутики. Функция, не компонент:
   *  компонент внутри рендера пересоздавался бы каждый раз и терял фокус кнопки. */
  const note = (offer: WeekOffer, state: 'open' | 'on' | 'torn', onPick?: () => void) => {
    const a = offer.activity;
    if (state === 'torn') return <span key={a.id} className={`nb-note nb-${a.voice} torn`} aria-hidden="true" />;
    const effect = offer.outcome?.effect ?? a.effect;
    const Tag = onPick ? 'button' : 'div';
    return (
      <Tag key={a.id} className={`nb-note nb-${a.voice} ${state === 'on' ? 'on' : ''}`} onClick={onPick} type={onPick ? 'button' : undefined}>
        <b>{VOICE_LABEL[a.voice]}</b>
        <span>{a.title}</span>
        {onPick && <i>{a.line}</i>}
        {state === 'on' && onPick && effect.train === 'choice' && (
          <span className="nb-train" onClick={(e) => e.stopPropagation()}>
            {VOICE_ATTRS[a.voice].map((attr) => (
              <em key={attr} className={(trainAttr ?? VOICE_ATTRS[a.voice][0]) === attr ? 'on' : ''} onClick={() => setTrainAttr(attr)}>{ATTRIBUTE_LABEL[attr]}</em>
            ))}
          </span>
        )}
      </Tag>
    );
  };

  /** Прожитий день (або поточний після вибору): обраний стікер, кутики інших, запис вечора. */
  const doneDay = (d: number, withScene: boolean) => {
    const offer = offerOf(d);
    const offers = days[d] ?? [];
    return (
      <section key={d} className="nb-day">
        <h3>{DAY[d] ?? `День ${d + 1}`}<small>{offer ? offer.activity.title.toLowerCase() : 'нічого'}</small></h3>
        {offers.length > 0 && (
          <div className="nb-notes compact">
            {offers.map((o) => note(o, o === offer ? 'on' : 'torn'))}
          </div>
        )}
        {offer?.outcome && (
          <p className={`nb-entry ink-${offer.activity.voice}`}>
            {offer.outcome.text}
            {withScene && sceneTextOf(d) && <><br /><span className="nb-scene">{sceneTextOf(d)}</span></>}
          </p>
        )}
        {!offer && <p className="nb-entry muted-ink">— день минув. Голоси запам’ятали.</p>}
      </section>
    );
  };

  const button = (() => {
    if (phase.p === 'summary') return <button className="primary menu-primary" onClick={onNext}>До матчу</button>;
    if (phase.p === 'outcome') {
      const out = phase.offer.outcome!;
      return <button className="primary menu-primary" onClick={() => afterOutcome(phase.offer)}>{sceneFor(out, scenes, seen, sceneUsed) ? 'Що далі' : last ? 'Підсумок тижня' : 'Далі'}</button>;
    }
    if (phase.p === 'scene') return phase.chosen ? <button className="primary menu-primary" onClick={() => advance(picks)}>{last ? 'Підсумок тижня' : 'Далі'}</button> : null;
    const offers = days[day] ?? [];
    return <button className="primary menu-primary" onClick={confirmDay}>{selected ? 'Так і зробити' : offers.length ? 'Нічого не робити сьогодні' : 'Далі'}</button>;
  })();

  return (
    <div className="result week">
      <div className="card-minute">тиждень між матчами</div>
      <div className="nb-book">
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <defs><filter id="pen"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="3" result="t" /><feDisplacementMap in="SourceGraphic" in2="t" scale="1.6" /></filter></defs>
        </svg>
        <Doodles seed={seed} />
        {locked && (
          <div className="nb-coach"><b>Тренер</b>Місто закрите. База, відео, психолог. Місто почекає.</div>
        )}

        {days.map((offers, d) => {
          if (phase.p === 'summary' || d < day) return doneDay(d, true);
          if (d > day) return <section key={d} className="nb-day"><h3>{DAY[d] ?? `День ${d + 1}`}</h3><div className="nb-empty" /></section>;

          // поточний день
          if (phase.p === 'outcome' || phase.p === 'scene') {
            const offer = phase.offer;
            return (
              <section key={d} className="nb-day">
                <h3>{DAY[d]}<small>{offer.activity.title.toLowerCase()}</small></h3>
                <div className="nb-notes compact">
                  {offers.map((o) => note(o, o === offer ? 'on' : 'torn'))}
                </div>
                <p className={`nb-entry ink-${offer.activity.voice}`}>
                  {offer.outcome!.text}
                  <span className="nb-note-line">{offer.outcome!.effect.note}</span>
                </p>
                {phase.p === 'scene' && (
                  <div className="nb-scene-block">
                    <p className="nb-entry nb-scene">{phase.scene.setup}</p>
                    {phase.chosen ? (
                      <p className="nb-entry nb-scene"><b>{phase.chosen.label}.</b> {phase.chosen.text}<span className="nb-note-line">{phase.chosen.effect.note}</span></p>
                    ) : (
                      <div className="nb-options">
                        {sceneOptionsFor(phase.scene, sees).map((o) => (
                          <button key={o.id} type="button" className={`nb-opt ${o.insight ? `ink-${o.insight.who}` : ''}`} onClick={() => chooseScene(phase.scene, o)}>
                            <span>{o.label}</span>
                            {o.insight && <i>{VOICE_LABEL[o.insight.who]}: «{o.insight.line}»</i>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          }

          return (
            <section key={d} className="nb-day">
              <h3>{DAY[d]}{d === 0 && <small>{locked ? 'місто закрите' : 'одна справа на день'}</small>}</h3>
              <div className="nb-notes">
                {offers.map((o) => note(o, selected === o.activity.id ? 'on' : 'open',
                  () => { setSelected(selected === o.activity.id ? null : o.activity.id); setTrainAttr(null); }))}
              </div>
              {offers.length === 0 && <div className="nb-empty" />}
            </section>
          );
        })}

        {phase.p === 'summary' && (
          <div className="nb-list">
            <h4>до матчу:</h4>
            {phase.tags.length === 0 && <div className="none">три дні — і жодної справи. голоси це запам’ятають.</div>}
            {phase.tags.map((t) => <div key={t} className="ok">{t}</div>)}
          </div>
        )}
      </div>
      {button}
    </div>
  );
}
