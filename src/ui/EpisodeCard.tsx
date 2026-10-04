import { useRef, useState } from 'react';
import type { Episode, EpisodeOption, FlagRule, MatchState, Player } from '../engine/types';
import { Spotlight, type Hint } from './Spotlight';
import { VOICE_LABEL, voiceAudible } from '../engine/voices';
import type { MatchConditions } from '../engine/conditions';
import { computeContext } from '../engine/context';
import { availableOptions, CHAIN_NEXT, sceneInsights } from '../engine/match';
import { catastropheBand, POSITION_LABEL } from '../engine/resolve';
import { cleanTarget } from '../engine/balance';
import { t, tf } from '../content/i18n';

// Сцена как диалог (макет А2, 19.09): сетап — строка ленты, голоса говорят до вариантов
// («ЕГО — …», как в Disco Elysium), варианты — нумерованный список с одной скобкой
// «[форма ціль]» (дефис после номера убран 19.09 — шум). Атрибут, бонус и факторы — не на кнопке: они на экране броска и в зоне
// «на кубик» (MatchScreen). Цена сил на кнопке тоже нет — она в разборе после броска; это
// сознательный обмен читаемости на полноту (плейтест: 25 с на решение).
//
// Аффордансы (макет «Лист моменту: де кнопки», вариант А, 19.09) — тестер не нашёл, куда тапать:
// всё было одним потоком текста, а самым «кнопочным» выглядели голоса в коробке и чипы с рамками.
// Поэтому: голоса без коробки, курсивом (комментарий, не предложение); заголовок «Твій хід» на
// линии — единственное место, где сказано, что надо решать; варианты — тёмная полоса с рамкой,
// действие первым, скобка вторым рядом приглушённо, номер залит кремом (грань кубика), стрелка
// справа; чипы «на кубик» без рамок. Карточек с радиусами не добавляем — шаблонный вид.

type Props = {
  episode: Episode;
  minute: number;
  state: MatchState;
  player: Player;
  conditions: MatchConditions;
  flagRules: FlagRule[];
  /** Звено цепочки — та же минута, сцена продолжается. */
  link?: boolean;
  /** Підказка-прожектор (перший матч, M12): ціль choices або voices — деталь листа, яку висвітлити. */
  hint?: Hint;
  onChoose: (option: EpisodeOption) => void;
};

/** Куда ведёт вариант при удаче — подпись в скобке: решение не последнее. Имена берём из того же
 *  `CHAIN_NEXT`, что и кнопка «Далі → …»: здесь жил свой список на пять целей, и всё, чего в нём не
 *  было, падало в «далі» — та сама «Далі → далі» з плейтесту 27.09, тільки в скобці. */
function chainHint(o: EpisodeOption): string | null {
  const target = o.outcomes.clean.apply?.followUp ?? o.outcomes.cost.apply?.followUp;
  return target ? (CHAIN_NEXT[target] ?? t('далі')) : null;
}

export function EpisodeCard({ episode, minute, state, player, conditions, flagRules, link, hint, onChoose }: Props) {
  const options = availableOptions(episode, state, player);
  const insights = sceneInsights(episode, state, player);
  const voicesRef = useRef<HTMLDivElement>(null);
  const choicesRef = useRef<HTMLOListElement>(null);
  const [hintOpen, setHintOpen] = useState(true);
  const spot = hint && hintOpen && (hint.target === 'choices' || hint.target === 'voices') ? hint : null;
  // Реплики голосов — до вариантов, по одному разу на голос; слышно только сильный.
  const said = new Set<string>();
  const lines = options.flatMap((o) => {
    if (!o.voice || !voiceAudible(o.voice.who, o, state, player) || said.has(o.voice.who)) return [];
    said.add(o.voice.who);
    return [o.voice];
  });

  return (
    // Лист момента (макет «Екран матчу: було / стало», кадр «стало+ зі знаком», 19.09): три зоны —
    // сетап под ярлыком минуты, голоса колонкой с линией (как в сценарии), варианты с номером в ячейке.
    <div className="scene">
      <span className="minute-tab">{minute}′{link && <i className="link-mark"> {t('· продовження')}</i>}</span>
      <p className="setup">{episode.setup}</p>
      {(insights.length > 0 || lines.length > 0) && (
        <div className="voices" ref={voicesRef}>
          {insights.map((v) => (
            <p key={'i' + v.who} className={`say voice-${v.who}`}><b>{VOICE_LABEL[v.who]}</b><span>{v.line}</span></p>
          ))}
          {lines.map((v) => (
            <p key={v.who} className={`say voice-${v.who}`}><b>{VOICE_LABEL[v.who]}</b><span>{v.line}</span></p>
          ))}
        </div>
      )}
      <div className="hand"><span>{t('Твій хід')}</span></div>
      <ol className="choices" ref={choicesRef}>
        {options.map((o, i) => {
          // Форма риска уже со сдвигами от контекста: игрок должен видеть, что надёжный
          // вариант перестал быть надёжным.
          const ctx = computeContext(state, player, o, episode.phase, conditions, flagRules);
          const chain = chainHint(o);
          const origin = o.insight ? tf('відкрив {0}', VOICE_LABEL[o.insight.who])
            : o.requires?.flags?.some((f) => f.startsWith('week_')) ? t('з тижня')
            : o.requires?.flags?.includes('keeper_read') ? t('по підказці') : null;
          return (
            <li key={o.id}>
              <button className={`choice ${o.insight ? `choice-insight voice-${o.insight.who}` : ''}`} onClick={() => onChoose(o)}>
                <span className="choice-num">{i + 1}</span>
                <span className="choice-text">
                  {o.label}
                  {/* Обидві межі кидка, а не одна (28.09): ціль чистого — скільки треба набрати,
                      катастрофа — на яких кубиках усе піде не так. До цього видно було тільки ціль, і гравець
                      добудовував правило сам («катастрофа — це коли випала одиниця»). */}
                  <span className={`bracket risk-${ctx.position}`}>
                    [{POSITION_LABEL[ctx.position]} {cleanTarget(ctx.position, o.difficulty)} · катастрофа {catastropheBand(ctx.position, ctx.attrMod)}]
                  </span>
                  {/* Куди веде варіант — окремим елементом, не всередині скобки: скобка `nowrap`, і з
                      довгим ім'ям ланки («м'яч між лініями») рядок вилазив за екран на 47 px. */}
                  {chain && <i className={`chain-next risk-${ctx.position}`}>→ {chain}</i>}
                  {origin && <i className="origin">{origin}</i>}
                </span>
                <span className="choice-go" aria-hidden="true">›</span>
              </button>
            </li>
          );
        })}
      </ol>
      {spot && <Spotlight hint={spot} target={spot.target === 'voices' ? voicesRef : choicesRef} onDone={() => setHintOpen(false)} />}
    </div>
  );
}
