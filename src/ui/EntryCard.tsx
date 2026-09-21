import type { Entry } from '../engine/entry';
import { VOICE_LABEL } from '../engine/voices';

// Вихід із лави (21.09): лист без кубика на хвилині виходу — сетап, голоси колонкою, стандартна primary-кнопка
// «Вийти на поле» (як «Перейти в роздягальню» на свистку). Не вибір із варіантів — один вихід. Правила — engine/entry.ts.

type Props = { entry: Entry; minute: number; debut: boolean; onNext: () => void };

export function EntryCard({ entry, minute, debut, onNext }: Props) {
  return (
    <div className="scene whistle entry">
      <span className="minute-tab">{minute}′ · {debut ? 'дебют' : 'вихід'}</span>
      <p className="setup">{entry.setup}</p>
      {entry.voices.length > 0 && (
        <div className="voices">
          {entry.voices.map((v) => <p key={v.who} className={`say voice-${v.who}`}><b>{VOICE_LABEL[v.who]}</b><span>{v.line}</span></p>)}
        </div>
      )}
      <button className="primary title-primary whistle-go" onClick={onNext}>Вийти на поле</button>
    </div>
  );
}
