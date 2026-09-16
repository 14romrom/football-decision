import type { Episode, EpisodeOption, MatchState, Player } from '../engine/types';
import type { MatchConditions } from '../engine/conditions';
import { computeContext } from '../engine/context';
import { optionCost } from '../engine/match';
import { EFFECT_LABEL, POSITION_LABEL } from '../engine/resolve';

type Props = {
  episode: Episode;
  minute: number;
  state: MatchState;
  player: Player;
  conditions: MatchConditions;
  onChoose: (option: EpisodeOption) => void;
};

/** Полоска стоимости: цена действия показывается объёмом, а не числом (п. 4.4 ТЗ). */
function CostBar({ cost }: { cost: number }) {
  const segments = 6;
  const filled = Math.max(1, Math.round((cost / 14) * segments));
  return (
    <span className="cost" aria-label="ціна по силах">
      {Array.from({ length: segments }, (_, i) => (
        <i key={i} className={i < filled ? 'seg on' : 'seg'} />
      ))}
    </span>
  );
}

export function EpisodeCard({ episode, minute, state, player, conditions, onChoose }: Props) {
  return (
    <div className="card episode">
      <div className="card-minute">{minute}′</div>
      <p className="setup">{episode.setup}</p>
      <div className="options">
        {episode.options.map((o) => {
          // Показываем ярлыки уже со сдвигами от контекста: если ноги встали,
          // игрок должен видеть, что надёжный вариант перестал быть надёжным.
          const ctx = computeContext(state, player, o, episode.phase, conditions);
          const shifted = ctx.position !== o.basePosition;
          return (
            <button key={o.id} className="option" onClick={() => onChoose(o)}>
              <span className="option-label">{o.label}</span>
              <span className="tags">
                <span className={`tag risk risk-${ctx.position}`}>
                  {POSITION_LABEL[ctx.position]}
                  {shifted && (
                    <i className="shift-mark" title="форма ризику змістилася через твій стан">↯</i>
                  )}
                </span>
                <span className="tag scale">{EFFECT_LABEL[ctx.effect]}</span>
                <CostBar cost={optionCost(o)} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
