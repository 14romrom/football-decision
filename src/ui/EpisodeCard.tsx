import { ATTRIBUTE_LABEL, type Episode, type EpisodeOption, type FlagRule, type MatchState, type Player } from '../engine/types';
import { VOICE_LABEL, voiceAudible } from '../engine/voices';
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
  flagRules: FlagRule[];
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

export function EpisodeCard({ episode, minute, state, player, conditions, flagRules, onChoose }: Props) {
  return (
    <div className="card episode">
      <div className="card-minute">{minute}′</div>
      <p className="setup">{episode.setup}</p>
      <div className="options">
        {episode.options.map((o) => {
          // Показываем ярлыки уже со сдвигами от контекста: если ноги встали,
          // игрок должен видеть, что надёжный вариант перестал быть надёжным.
          const ctx = computeContext(state, player, o, episode.phase, conditions, flagRules);
          // Голос слышно, только когда он сильный: так объясняются сильные стороны и контекст.
          const voice = o.voice && voiceAudible(o.voice.who, o, state, player) ? o.voice : null;
          const shifted = ctx.position !== o.basePosition;
          return (
            <button key={o.id} className="option" onClick={() => onChoose(o)}>
              <span className="option-label">{o.label}</span>
              {voice && (
                <span className={`voice voice-${voice.who}`}><b>{VOICE_LABEL[voice.who]}:</b> «{voice.line}»</span>
              )}
              <span className="tags">
                {/* Чем ты это делаешь и насколько хорошо: скилл виден до броска, как на листе персонажа. */}
                <span className={`tag attr ${ctx.attrMod >= 3 ? 'strong' : ctx.attrMod === 0 ? 'weak' : ''}`}>
                  {ATTRIBUTE_LABEL[o.attribute]} +{ctx.attrMod}
                </span>
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
