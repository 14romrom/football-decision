// Единственный бросок в игре: 2d10 + модификатор атрибута + контекст.
// Функция чистая — rng приходит аргументом, поэтому её можно прогнать миллион раз.

import { DIE_FLOOR, THRESHOLDS } from './balance';
import { computeContext } from './context';
import type { Episode, EpisodeOption, MatchState, Player, Position, Resolution, Tier } from './types';
import { neutralConditions, type MatchConditions } from './conditions';
import type { Rng } from './rng';

export function tierForScore(position: Position, score: number): Tier {
  const t = THRESHOLDS[position];
  if (score <= t.badFail) return 'badFail';
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
  const roll = Math.max(rawRoll, DIE_FLOOR[ctx.position]);
  // Планка показывается как модификатор: игрок видит, что выпало, и за что добавили.
  const mods = rawRoll < roll ? [{ label: 'надійний хід', value: roll - rawRoll }, ...ctx.mods] : ctx.mods;
  const totalScore = roll + ctx.flat;
  return {
    rawRoll,
    roll,
    attrMod: ctx.attrMod,
    mods,
    totalScore,
    position: ctx.position,
    basePosition: option.basePosition,
    effect: ctx.effect,
    tier: tierForScore(ctx.position, totalScore),
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
