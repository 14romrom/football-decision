// Единственный бросок в игре: d20 + модификатор атрибута + контекст.
// Функция чистая — rng приходит аргументом, поэтому её можно прогнать миллион раз.

import { THRESHOLDS } from './balance';
import { computeContext } from './context';
import type { Episode, EpisodeOption, MatchState, Player, Position, Resolution, Tier } from './types';
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
): Resolution {
  const ctx = computeContext(state, player, option, phase);
  const roll = rng.d20();
  const totalScore = roll + ctx.flat;
  return {
    roll,
    attrMod: ctx.attrMod,
    mods: ctx.mods,
    totalScore,
    position: ctx.position,
    basePosition: option.basePosition,
    effect: ctx.effect,
    tier: tierForScore(ctx.position, totalScore),
  };
}

/** Ярлыки, которые видит игрок. Ни одного числа — это условие эксперимента. */
export const POSITION_LABEL: Record<Position, string> = {
  controlled: 'уверенно',
  risky: 'рискованно',
  desperate: 'отчаянно',
};

export const EFFECT_LABEL = {
  limited: 'удержать',
  standard: 'создать',
  great: 'решить',
} as const;

export const TIER_LABEL: Record<Tier, string> = {
  clean: 'Чисто',
  cost: 'Получилось, но…',
  fail: 'Не вышло',
  badFail: 'Катастрофа',
};
