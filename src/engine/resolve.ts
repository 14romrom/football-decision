// Единственный бросок в игре: 2d10 + модификатор атрибута + контекст.
// Функция чистая — rng приходит аргументом, поэтому её можно прогнать миллион раз.

import { CATASTROPHE_BAND, CRIT_SUCCESS, THRESHOLDS } from './balance';
import { computeContext } from './context';
import type { ApplyEffect, Episode, EpisodeOption, FlagRule, MatchState, Outcome, Player, Position, Resolution, ResultBadge, Tier } from './types';
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
  flagRules: FlagRule[] = [],
): Resolution {
  const ctx = computeContext(state, player, option, phase, cond, flagRules);
  const rawRoll = rng.roll();
  // Пара граней — из rng; подменённый в тестах roll() пары не оставляет, делим сумму поровну.
  const last = rng.lastDice;
  const dice: [number, number] = last && last[0] + last[1] === rawRoll
    ? last
    : [Math.max(1, Math.min(10, Math.ceil(rawRoll / 2))), Math.max(1, Math.min(10, Math.floor(rawRoll / 2)))];
  const totalScore = rawRoll + ctx.flat;
  const tier = tierFor(ctx.position, rawRoll, totalScore);
  return {
    rawRoll,
    dice,
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

/** Единственное место, где решается, какой Outcome показывать и логировать.
 *  Раньше RollView и applyChoice считали это отдельно и расходились: на критическом
 *  успехе экран броска показывал обычный «чисто», а в ленту уходил другой, крит-текст —
 *  игрок читал не то, что потом видел в хронологии матча. */
export function pickOutcome(option: EpisodeOption, res: Resolution): Outcome {
  return res.critical === 'success' && option.outcomes.crit ? option.outcomes.crit : option.outcomes[res.tier];
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

/** Ярус («Чисто»/«Вийшло, але…») — про якість спроби. Ці теги — про сам факт: що
 *  саме сталося в грі. Порядок задає пріоритет; показуємо всі, що спрацювали
 *  (зазвичай 1, зрідка 2), а не тільки перший. */
const BADGE_RULES: { test: (a: ApplyEffect) => boolean; badge: ResultBadge }[] = [
  { test: (a) => !!a.goal, badge: { icon: '⚽', label: 'Гол!', tone: 'good' } },
  { test: (a) => !!a.assist, badge: { icon: '🅰️', label: 'Гольова передача', tone: 'good' } },
  { test: (a) => !!a.teamGoal, badge: { icon: '⚽', label: 'Гол команди', tone: 'good' } },
  { test: (a) => !!a.concede, badge: { icon: '🥅', label: 'Пропущений гол', tone: 'bad' } },
  { test: (a) => !!a.keyPass, badge: { icon: '🎯', label: 'Точний пас', tone: 'good' } },
  { test: (a) => !!a.duelWon, badge: { icon: '💪', label: 'Виграна дуель', tone: 'good' } },
  { test: (a) => (a.losses ?? 0) > 0, badge: { icon: '❌', label: 'Втрата м’яча', tone: 'bad' } },
  { test: (a) => !!a.corner, badge: { icon: '🚩', label: 'Кутовий', tone: 'neutral' } },
  { test: (a) => !!a.counterAttack, badge: { icon: '⚠️', label: 'Ризик контратаки', tone: 'bad' } },
  { test: (a) => !!a.foul, badge: { icon: '🟨', label: 'Фол', tone: 'bad' } },
  { test: (a) => !!a.addFlags?.includes('booked'), badge: { icon: '🟨', label: 'Жовта картка', tone: 'bad' } },
  { test: (a) => !!a.addFlags?.includes('injured'), badge: { icon: '🤕', label: 'Пошкодження', tone: 'bad' } },
  { test: (a) => !!a.addFlags?.includes('knock'), badge: { icon: '🩹', label: 'Мікротравма', tone: 'bad' } },
  { test: (a) => !!a.removeFlags?.includes('knock') && !a.addFlags?.includes('injured'), badge: { icon: '🩹', label: 'Нога відпустила', tone: 'good' } },
];

export function resultBadges(apply: ApplyEffect | undefined): ResultBadge[] {
  if (!apply) return [];
  return BADGE_RULES.filter((r) => r.test(apply)).map((r) => r.badge);
}
