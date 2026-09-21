import { useEffect, useRef } from 'react';
import type { LootItem } from '../engine/week';
import type { Player, VoiceKey } from '../engine/types';
import { VOICE_LABEL } from '../engine/voices';
import { voiceMod } from './Sticker';

// Лист здобутків (M12, 20.09, макет «Здобутки і підказки», варіант Б, решение пользователя): підсумок
// тижня і прологу — не список із галочками ручкою, а лист оповідача поверх погаслого зошита. Зошит —
// рука Реєса, а здобутки — результат події, його «видає» гра; тому вони на темному листі, як ісход
// вечора, а не на папері. Речі лягають по одній (stagger), у кожної — колір голосу чи людини, підпис
// «куди» (на матч · назавжди · у картку · дует) і стрілка; назавжди — золоте світіння: єдина річ, що
// виглядає інакше, бо вона й є інакша. Внизу — чотири бокси зі стікера картки, змінений підсвічено ▲:
// видно, що «+1» справді ліг у картку. Кнопка одна, всередині листа; окремого екрана немає.
// «Скриня з золотом» тут — не предмет, а момент: темний лист загорається на погаслій сторінці.

type Props = {
  /** Ярлик на кромці: «ДО МАТЧУ» / «ДО ПЕРШОГО МАТЧУ». */
  tab: string;
  loot: LootItem[];
  /** Картка до і після — для боксів голосів (тільки постійні пункти, без бонусів на матч). */
  before: Player;
  after: Player;
  /** Що сказати, коли здобутків немає. */
  empty: string;
  button: string;
  onNext: () => void;
};

const ATTR_VOICES: VoiceKey[] = ['vision', 'instinct', 'body', 'composure'];
const BOX_LABEL: Record<VoiceKey, string> = { vision: 'Бачення', instinct: 'Інстинкт', body: 'Тіло', composure: 'Спокій', ego: 'Его', team: 'Команда' };
/** Дві літери в кружечку: голос, або людина, або «+1» для пункту назавжди. */
function badge(item: LootItem): { text: string; cls: string } {
  if (item.kind === 'perm') return { text: '+1', cls: 'gold' };
  if (item.kind === 'train') return { text: '▲', cls: 'train' };
  if (item.kind === 'coach') return { text: 'ТР', cls: 'coach' };
  if (item.kind === 'flag') return { text: '⚑', cls: 'flag' };
  if (item.kind === 'person') return { text: 'ПА', cls: 'voice-team' };
  if (item.who) return { text: VOICE_LABEL[item.who].slice(0, 2).toUpperCase(), cls: `voice-${item.who}` };
  return { text: 'ТБ', cls: 'fans' };   // трибуни
}

export function LootSheet({ tab, loot, before, after, empty, button, onNext }: Props) {
  const n = loot.length;
  // Лист лягає під прожиті розвороти — довга сторінка, тому підвозимо його в кадр, як тільки він з’явився.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, []);
  const words = ['', 'одна річ', 'дві речі', 'три речі', 'чотири речі', 'п’ять речей', 'шість речей', 'сім речей', 'вісім речей'];
  return (
    <div className="moment nb-sheet loot-sheet" ref={ref}><div className="scene">
      <span className="minute-tab">{tab}</span>
      {n > 0 && <span className="loot-count" style={{ ['--i' as string]: n }}>{words[n] ?? `${n} речей`}</span>}
      {n === 0 ? (
        <p className="setup">{empty}</p>
      ) : (
        <ul className="loot">
          {loot.map((item, i) => {
            const b = badge(item);
            return (
              <li key={item.text} className={`${item.kind === 'perm' ? 'perm' : ''}`} style={{ ['--i' as string]: i }}>
                <span className={`loot-ic ${b.cls}`}>{b.text}</span>
                <span className="loot-text">
                  {item.text}
                  <small>
                    {item.where}
                    {item.progress && (
                      <span className="loot-bar">
                        {Array.from({ length: item.progress[1] }, (_, k) => <b key={k} className={k < item.progress![0] ? 'f' : ''} />)}
                      </span>
                    )}
                  </small>
                </span>
                <span className={`loot-arr ${item.kind === 'perm' ? 'gold' : item.dir ?? ''}`}>{item.kind === 'perm' ? '★' : item.dir === 'up' ? '▲' : item.dir === 'down' ? '▼' : '·'}</span>
              </li>
            );
          })}
        </ul>
      )}
      {n > 0 && (
        <div className="loot-card" style={{ ['--i' as string]: n }}>
          <p className="loot-cap">У картку — скільки кожен голос додає до кубиків</p>
          {ATTR_VOICES.map((who) => {
            const was = voiceMod(who, before); const now = voiceMod(who, after);
            return <div key={who} className={`loot-box voice-${who} ${now > was ? 'up' : ''}`}>{BOX_LABEL[who]}<b>+{now}</b></div>;
          })}
        </div>
      )}
      <button className="primary menu-primary nb-sheet-btn" onClick={onNext}>{button}</button>
    </div></div>
  );
}
