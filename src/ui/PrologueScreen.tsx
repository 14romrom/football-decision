import { useState } from 'react';
import { sheetFor, type PrologueOption, type ProloguePick, type PrologueSpread } from '../engine/prologue';
import { shotFor } from '../content';
import { VOICE_ATTRS } from '../engine/week';
import { VOICE_LABEL } from '../engine/voices';
import { LootSheet } from './LootSheet';
import type { WeekResult } from './WeekScreen';
import { ATTRIBUTE_LABEL, type Attribute, type VoiceKey } from '../engine/types';
import { Film } from './Film';

// Пролог, відпустка, лист травня і фінал — листи оповідача на весь екран (26.09, плейтест на телефоні).
// Було: зошит із паперу в лінійку, стікери голосів і лист усередині розвороту. Стало: **той самий лист,
// що в матчі й у якорі тижня** — кадр, ярлик на кромці, текст, «Твій хід» і варіанти списком. Причини
// з плейтесту: у колонці зошита лист стискався до 291 px із 375 і кадр губився; екран стікерів посеред
// розмови читався як тиждень між матчами, хоча тут іде діалог; довгий сетап вимагав скролу, і початок
// сцени було не видно.
// Правила, які лишаються: оповідач говорить листом ПЕРЕД вибором (у тижні — після), Реєс тільки
// відповідає; розворот закінчується розв’язкою, а не паузою; наприкінці — лист здобутків.
// **Один абзац — один лист**: нова зона контенту завжди відкривається в межах екрана, без скролу.

type Props = {
  /** Розвороти з іменами ростера. */
  spreads: PrologueSpread[];
  onFinish: (picks: ProloguePick[]) => WeekResult;
  onNext: () => void;
  /** Відпустка (M15) використовує той самий екран: інший лист здобутків, варіанти за станом арки. */
  lootTab?: string;
  lootButton?: string;
  lootEmpty?: string;
  arc?: number;
  /** Підписи кнопок: пролог відповідає людям, відпустка вирішує, що робити. */
  labels?: { open: string; pick: string; confirm: string };
  /** Фінал (M16): голос відповіді скауту в пролозі — лист першого розвороту обирається ним (рима). */
  firstVoice?: VoiceKey;
  /** Фінал: партнер без дуету — розв’язка `replyCold`, якщо є. */
  cold?: boolean;
  /** Фінал: замість листа здобутків — епілог і одна кнопка. */
  epilogue?: { tab: string; text: string[]; sign: string };
  /** Підпис на плівці (26.09): назва частини ліворуч, номер розвороту праворуч — як маркування кадру
   *  на титулі. Тільки тут: у матчі така смуга змагалася б із хвилиною і рахунком. */
  film?: string;
};

type Phase = { p: 'sheet'; page: number } | { p: 'reply'; option: PrologueOption } | { p: 'summary'; result: WeekResult };

export function PrologueScreen({ spreads, onFinish, onNext, lootTab = 'ДО ПЕРШОГО МАТЧУ', lootButton = 'На лаву', lootEmpty = 'Три розвороти — і жодної відповіді.', arc = 1, labels = { open: 'Відповісти', pick: 'Обери відповідь', confirm: 'Так і відповісти' }, firstVoice, cold = false, epilogue, film }: Props) {
  // Варіант зі станом арки (Спокій у відпустці): нижче стану — його немає, і гравець про нього не знає.
  const visible = (o: PrologueOption) => ((o as { arcMin?: number }).arcMin ?? 1) <= arc;
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>({ p: 'sheet', page: 0 });
  const [picks, setPicks] = useState<ProloguePick[]>([]);
  const [attr, setAttr] = useState<Attribute | null>(null);
  const [open, setOpen] = useState<string | null>(null);   // варіант, у якого розкрито вибір атрибута
  const last = i >= spreads.length - 1;

  const choose = (option: PrologueOption) => {
    const spread = spreads[i];
    const pick: ProloguePick = { spread: spread.id, option: option.id, ...(option.point ? { attr: attr ?? VOICE_ATTRS[option.voice][0] } : {}) };
    setPicks([...picks, pick]);
    setAttr(null); setOpen(null);
    // Розворот закінчується розв’язкою — реакцією співрозмовника і фактом «що далі», — а не паузою.
    setPhase({ p: 'reply', option });
  };
  const afterReply = () => {
    if (last) setPhase({ p: 'summary', result: onFinish(picks) });
    else { setI(i + 1); setPhase({ p: 'sheet', page: 0 }); }
  };
  /** Голос відповіді на попередньому розвороті — луна в листі наступного. */
  const previousVoice = (d: number) => { if (d === 0) return firstVoice; const p = picks.find((x) => x.spread === spreads[d - 1]?.id); return p ? spreads[d - 1].options.find((o) => o.id === p.option)?.voice : undefined; };

  /** Маркування кадру по краях (26.09): частина ліворуч, номер розвороту праворуч. */
  const filmStrip = film ? <Film labels={{ left: [film], right: [`${String(i + 1).padStart(2, '0')} / ${String(spreads.length).padStart(2, '0')}`] }} /> : null;

  const spread = spreads[i];
  const shot = spread ? shotFor(spread.id) : null;
  const sheet = spread ? (cold && spread.sheetCold ? spread.sheetCold : sheetFor(spread, previousVoice(i))) : [];

  /** Лист оповідача: кадр зверху, ярлик на кромці, один абзац — далі або «Далі», або вибір. */
  const sheetCard = (tab: string, body: React.ReactNode, withShot: boolean) => (
    <div className={`moment${withShot && shot ? ' shot' : ''}`}>
      {withShot && shot && (
        <div className="shot-plate">
          <img src={shot.src} alt="" decoding="async" style={{ objectPosition: shot.focus }} />
        </div>
      )}
      <div className="scene">
        <span className="minute-tab">{tab.toUpperCase()}</span>
        {body}
      </div>
    </div>
  );

  if (phase.p === 'summary') {
    return (
      <div className="result story">
        {filmStrip}
        {epilogue ? (
          <div className="moment"><div className="scene">
            <span className="minute-tab">{epilogue.tab.toUpperCase()}</span>
            {epilogue.text.map((t, k) => <p key={k} className="setup" style={k ? { paddingTop: 0 } : undefined}>{t}</p>)}
            <p className="nb-aside"><b>{epilogue.sign}</b></p>
            <button className="primary menu-primary nb-sheet-btn" onClick={onNext}>{lootButton}</button>
          </div></div>
        ) : (
          <LootSheet tab={lootTab} loot={phase.result.loot} before={phase.result.before} after={phase.result.after}
            empty={lootEmpty} button={lootButton} onNext={onNext} />
        )}
      </div>
    );
  }

  if (phase.p === 'reply') {
    const o = phase.option;
    return (
      <div className="result story">
        {filmStrip}
        {sheetCard(spread.tab, (
          <>
            <p className={`said voice-${o.voice}`}><b>{VOICE_LABEL[o.voice]}</b><span>{o.say}</span></p>
            <p className="setup" style={{ paddingTop: 6 }}>{cold && (o as { replyCold?: string }).replyCold ? (o as { replyCold?: string }).replyCold : o.reply}</p>
            <button className="primary menu-primary nb-sheet-btn" onClick={afterReply}>{last ? 'Що далі' : 'Далі'}</button>
          </>
        ), false)}
      </div>
    );
  }

  const page = Math.min(phase.page, Math.max(0, sheet.length - 1));
  const lastPage = page >= sheet.length - 1;
  const options = spread.options.filter(visible);

  return (
    <div className="result story">
      {filmStrip}
      {sheetCard(spread.tab, (
        <>
          {spread.head && page === 0 && <div className="head-line"><b>{spread.head}</b></div>}
          <p className="setup">{sheet[page]}</p>
          {!lastPage && (
            <button className="primary menu-primary nb-sheet-btn" onClick={() => setPhase({ p: 'sheet', page: page + 1 })}>Далі</button>
          )}
          {lastPage && (
            <>
              <div className="hand"><span>{labels.open}</span></div>
              <ol className="choices">
                {options.map((o, k) => (
                  <li key={o.id}>
                    <button className={`choice choice-insight voice-${o.voice}`} onClick={() => (o.point === 'choice' && open !== o.id ? setOpen(o.id) : choose(o))}>
                      <span className="choice-num">{k + 1}</span>
                      <span className="choice-text">
                        {o.say}
                        <span className="bracket"><i className={`origin voice-${o.voice}`}>{VOICE_LABEL[o.voice]}</i> {o.line}</span>
                        {o.point === 'choice' && open === o.id && (
                          <span className="nb-train" onClick={(e) => e.stopPropagation()}>
                            {VOICE_ATTRS[o.voice].map((a) => (
                              <em key={a} className={(attr ?? VOICE_ATTRS[o.voice][0]) === a ? 'on' : ''} onClick={() => { setAttr(a); choose(o); }}>{ATTRIBUTE_LABEL[a]}</em>
                            ))}
                          </span>
                        )}
                      </span>
                      <span className="choice-go" aria-hidden="true">›</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      ), page === 0)}
    </div>
  );
}
