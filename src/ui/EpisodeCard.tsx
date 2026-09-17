import { ATTRIBUTE_LABEL, type Episode, type EpisodeOption, type FlagRule, type MatchState, type Player } from '../engine/types';
import { VOICE_LABEL, voiceAudible } from '../engine/voices';
import type { MatchConditions } from '../engine/conditions';
import { computeContext } from '../engine/context';
import { availableOptions, optionCost, sceneInsights } from '../engine/match';
import { EFFECT_LABEL, POSITION_LABEL } from '../engine/resolve';
import { THRESHOLDS } from '../engine/balance';

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

/** Куда ведёт вариант при удаче: подпись «→ удар» на кнопке. Цепочка зависит от исхода,
 *  но направление известно заранее — игрок должен видеть, что решение не последнее. */
const CHAIN_LABEL: Record<string, string> = {
  fin_shot: 'удар', fin_penalty: 'удар з позначки', fin_penalty_wait: 'гра нервів', ep_free_kick_close: 'штрафний', ep_rebound_follow_up: 'добивання',
};
function chainHint(o: EpisodeOption): string | null {
  const target = o.outcomes.clean.apply?.followUp ?? o.outcomes.cost.apply?.followUp;
  return target ? (CHAIN_LABEL[target] ?? 'далі') : null;
}

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

export function EpisodeCard({ episode, minute, state, player, conditions, flagRules, link, onChoose }: Props) {
  return (
    <div className="card episode">
      <div className="card-minute">{minute}′{link && <span className="link-mark"> · продовження</span>}</div>
      <p className="setup">{episode.setup}</p>
      {/* Голос бачить: сильный атрибут заметил деталь, которой нет в сетапе, — и ниже
          появился вариант, которого у другого билда нет. Факт, не совет. */}
      {sceneInsights(episode, state, player).map((v) => (
        <p key={v.who} className={`insight voice-${v.who}`}><b>{VOICE_LABEL[v.who]}</b> — {v.line}</p>
      ))}
      <div className="options">
        {availableOptions(episode, state, player).map((o) => {
          // Показываем ярлыки уже со сдвигами от контекста: если ноги встали,
          // игрок должен видеть, что надёжный вариант перестал быть надёжным.
          const ctx = computeContext(state, player, o, episode.phase, conditions, flagRules);
          // Голос слышно, только когда он сильный: так объясняются сильные стороны и контекст.
          const voice = o.voice && voiceAudible(o.voice.who, o, state, player) ? o.voice : null;
          const shifted = ctx.position !== o.basePosition;
          return (
            <button key={o.id} className={`option ${o.insight ? 'option-insight' : ''}`} onClick={() => onChoose(o)}>
              <span className="option-label">
                {o.label}
                {/* Откуда взялся вариант — чтобы игрок связал кнопку с голосом или с тижнем, а не с удачей. */}
                {o.insight && <i className={`origin voice-${o.insight.who}`}>відкрив {VOICE_LABEL[o.insight.who]}</i>}
                {!o.insight && o.requires?.flags?.some((f) => f.startsWith('week_')) && <i className="origin origin-week">з тижня</i>}
                {!o.insight && o.requires?.flags?.includes('keeper_read') && <i className="origin origin-week">по підказці</i>}
              </span>
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
                {/* Цель проверки — как «Medium 10» в Disco Elysium: 2d10 + поправки проти цього числа.
                    Число, а не вероятность; зависит от формы риска после сдвигов контекста. */}
                <span className="tag target">ціль {THRESHOLDS[ctx.position].cost}</span>
                <span className="tag scale">{EFFECT_LABEL[ctx.effect]}</span>
                {chainHint(o) && <span className="tag chain">→ {chainHint(o)}</span>}
                <CostBar cost={optionCost(o)} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
