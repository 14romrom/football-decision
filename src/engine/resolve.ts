// Единственный бросок в игре: 2d10 + модификатор атрибута + контекст.
// Функция чистая — rng приходит аргументом, поэтому её можно прогнать миллион раз.

import { CATASTROPHE_BAND, CRIT_SUCCESS, THRESHOLDS } from './balance';
import { computeContext } from './context';
import type { Episode, EpisodeOption, MatchState, Player, Position, Resolution, Tier } from './types';
import type { Rng } from './rng';
import { neutralConditions, type MatchConditions } from './conditions';

/** Ярус исхода. Катастрофа и критический успех — по сырым кубикам, остальное — по score. */
export function tierFor(position: Position, rawRoll: number, score: number): Tier {
  if (rawRoll <= CATASTROPHE_BAND[position]) return 'badFail';
  if (rawRoll >= CRIT_SUCCESS) return 'clean';
  const t = THRESHOLDS[position];
  if (score <= t.fail) return 'fail';
  if (score <= t.cost) return 'cost';
  return 'clean';
}

export function resolveOption(
  state: MatchState,
  player: Player,
  option: EpisodeOption,
  phase: Episode['phase'],
  rng: Rng,
  cond: MatchConditions = neutralConditions(),
): Resolution {
  const ctx = computeContext(state, player, option, phase, cond);
  const rawRoll = rng.roll();
  const totalScore = rawRoll + ctx.flat;
  const tier = tierFor(ctx.position, rawRoll, totalScore);
  return {
    rawRoll,
    roll: rawRoll,
    attrMod: ctx.attrMod,
    mods: ctx.mods,
    totalScore,
    position: ctx.position,
    basePosition: option.basePosition,
    effect: ctx.effect,
    tier,
    critical: rawRoll <= CATASTROPHE_BAND[ctx.position] ? 'fail' : rawRoll >= CRIT_SUCCESS ? 'success' : null,
  };
}

/** Ярлыки, которые видит игрок. Ни одного числа — это условие эксперимента. */
export const POSITION_LABEL: Record<Position, string> = {
  controlled: 'упевнено',
  risky: 'ризиковано',
  desperate: 'відчайдушно',
};

export const EFFECT_LABEL = {
  limited: 'утримати',
  standard: 'створити',
  great: 'вирішити',
} as const;

export const TIER_LABEL: Record<Tier, string> = {
  clean: 'Чисто',
  cost: 'Вийшло, але…',
  fail: 'Не вийшло',
  badFail: 'Катастрофа',
};
