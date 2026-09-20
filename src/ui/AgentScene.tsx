import { useState } from 'react';
import type { AgentChoice, AgentContent } from '../engine/agent';
import type { LootItem } from '../engine/week';
import { VOICE_LABEL } from '../engine/voices';

// Сцена агента (M12, 20.09): лист оповідача — той самий лист моменту, що в матчі й у тижні (сетап,
// голоси колонкою, «Твій хід», варіанти), поверх темного фону після сторінки ESPM. Після вибору — текст
// (для «так» — зі зривом угоди), рядок наслідку і кнопка «Новий сезон». Окремого екрана результату
// немає: сцена і є перехід між сезонами. Правила — engine/agent.ts.

type Props = {
  content: AgentContent;
  onChoose: (choice: AgentChoice) => { text: string; loot: LootItem[] };
  onNext: () => void;
};

export function AgentScene({ content, onChoose, onNext }: Props) {
  const [done, setDone] = useState<{ text: string; loot: LootItem[] } | null>(null);
  return (
    <div className="result agent">
      <div className="card-minute">між сезонами</div>
      <section className="moment"><div className="scene">
        <span className="minute-tab">{content.tab.toUpperCase()}</span>
        <p className="setup">{content.setup}</p>
        {done ? (
          <>
            <p className="nb-chosen">{done.text}</p>
            {done.loot.length > 0 && <p className="nb-aside">{done.loot.map((l) => l.text).join(' · ')}</p>}
            <button className="primary menu-primary nb-sheet-btn" onClick={onNext}>Новий сезон</button>
          </>
        ) : (
          <>
            <div className="voices">
              {content.voices.map((v) => <p key={v.who} className={`say voice-${v.who}`}><b>{VOICE_LABEL[v.who]}</b><span>{v.line}</span></p>)}
            </div>
            <div className="hand"><span>Твій хід</span></div>
            <ol className="choices">
              {content.options.map((o, i) => (
                <li key={o.id}>
                  <button className="choice" onClick={() => setDone(onChoose(o.id))}>
                    <span className="choice-num">{i + 1}</span>
                    <span className="choice-text">{o.label}</span>
                    <span className="choice-go" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="nb-sheet-pad" />
          </>
        )}
      </div></section>
    </div>
  );
}
