import type { Episode, EpisodeOption, FlagRule, MatchState, Player } from '../engine/types';
import { VOICE_LABEL, voiceAudible } from '../engine/voices';
import type { MatchConditions } from '../engine/conditions';
import { computeContext } from '../engine/context';
import { availableOptions, sceneInsights } from '../engine/match';
import { POSITION_LABEL } from '../engine/resolve';
import { cleanTarget } from '../engine/balance';

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
  onChoose: (option: EpisodeOption) => void;
};

/** Куда ведёт вариант при удаче — подпись в скобке: решение не последнее. */
const CHAIN_LABEL: Record<string, string> = {
  fin_shot: 'удар', fin_penalty: 'удар з позначки', fin_penalty_wait: 'гра нервів', ep_free_kick_close: 'штрафний', ep_rebound_follow_up: 'добивання',
};
function chainHint(o: EpisodeOption): string | null {
  const target = o.outcomes.clean.apply?.followUp ?? o.outcomes.cost.apply?.followUp;
  return target ? (CHAIN_LABEL[target] ?? 'далі') : null;
}

export function EpisodeCard({ episode, minute, state, player, conditions, flagRules, link, onChoose }: Props) {
  const options = availableOptions(episode, state, player);
  const insights = sceneInsights(episode, state, player);
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
      <span className="minute-tab">{minute}′{link && <i className="link-mark"> · продовження</i>}</span>
      <p className="setup">{episode.setup}</p>
      {(insights.length > 0 || lines.length > 0) && (
        <div className="voices">
          {insights.map((v) => (
            <p key={'i' + v.who} className={`say voice-${v.who}`}><b>{VOICE_LABEL[v.who]}</b><span>{v.line}</span></p>
          ))}
          {lines.map((v) => (
            <p key={v.who} className={`say voice-${v.who}`}><b>{VOICE_LABEL[v.who]}</b><span>{v.line}</span></p>
          ))}
        </div>
      )}
      <div className="hand"><span>Твій хід</span></div>
      <ol className="choices">
        {options.map((o, i) => {
          // Форма риска уже со сдвигами от контекста: игрок должен видеть, что надёжный
          // вариант перестал быть надёжным.
          const ctx = computeContext(state, player, o, episode.phase, conditions, flagRules);
          const chain = chainHint(o);
          const origin = o.insight ? `відкрив ${VOICE_LABEL[o.insight.who]}`
            : o.requires?.flags?.some((f) => f.startsWith('week_')) ? 'з тижня'
            : o.requires?.flags?.includes('keeper_read') ? 'по підказці' : null;
          return (
            <li key={o.id}>
              <button className={`choice ${o.insight ? `choice-insight voice-${o.insight.who}` : ''}`} onClick={() => onChoose(o)}>
                <span className="choice-num">{i + 1}</span>
                <span className="choice-text">
                  {o.label}
                  <span className={`bracket risk-${ctx.position}`}>
                    [{POSITION_LABEL[ctx.position]} {cleanTarget(ctx.position, o.difficulty)}{chain ? ` → ${chain}` : ''}]
                    {origin && <i className="origin">{origin}</i>}
                  </span>
                </span>
                <span className="choice-go" aria-hidden="true">›</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
