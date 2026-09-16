// Контекстные модификаторы: плоские бонусы к score и сдвиги формы риска.
// Всё, что здесь считается, потом показывается игроку списком после броска —
// это единственный способ увидеть, что прошлые решения на что-то повлияли.

import { ATTR_MOD, BALANCE, POSITION_ORDER } from './balance';
import { neutralConditions, signatureAttrs, type MatchConditions } from './conditions';
import type { Attribute, Effect, EpisodeOption, Episode, MatchState, ModLine, Player, Position } from './types';

const ATTR_LABEL: Record<Attribute, string> = {
  finishing: 'удар',
  passing: 'пас',
  dribbling: 'дриблінг',
  pace: 'швидкість',
  strength: 'корпус',
  defending: 'відбір',
  composure: 'холоднокровність',
};

export function attrMod(attr: number): number {
  const { base, step, max } = ATTR_MOD;
  return Math.max(0, Math.min(max, Math.floor((attr - base) / step)));
}

const EFFECT_ORDER: Effect[] = ['limited', 'standard', 'great'];

function shiftPosition(p: Position, steps: number): Position {
  const i = POSITION_ORDER.indexOf(p);
  return POSITION_ORDER[Math.max(0, Math.min(POSITION_ORDER.length - 1, i + steps))];
}

function shiftEffect(e: Effect, steps: number): Effect {
  const i = EFFECT_ORDER.indexOf(e);
  return EFFECT_ORDER[Math.max(0, Math.min(EFFECT_ORDER.length - 1, i + steps))];
}

function isDefensiveAction(option: EpisodeOption, phase: Episode['phase']): boolean {
  return phase === 'defense' || option.attribute === 'defending' || option.attribute === 'strength';
}

export type ContextResult = {
  attrMod: number;
  mods: ModLine[];       // включает строку атрибута — это то, что видит игрок
  flat: number;          // сумма mods
  position: Position;
  effect: Effect;
};

export function computeContext(
  state: MatchState,
  player: Player,
  option: EpisodeOption,
  phase: Episode['phase'],
  cond: MatchConditions = neutralConditions(),
): ContextResult {
  const mods: ModLine[] = [];
  // Строка атрибута показывается всегда, со значением: игрок должен видеть, что его скилл
  // участвует в броске, даже когда бонус нулевой.
  const am = attrMod(player.attrs[option.attribute]);
  mods.push({ label: ATTR_LABEL[option.attribute] + ' (' + player.attrs[option.attribute] + ')', value: am });

  const c = BALANCE.contextMod;

  if (state.stamina >= 70) mods.push({ label: 'свіжість', value: c.staminaHigh });
  else if (state.stamina >= 40) { /* 40..69 — без модификатора */ }
  else if (state.stamina >= 20) mods.push({ label: 'втомився', value: c.staminaLow });
  else mods.push({ label: 'ноги стали', value: c.staminaCritical });

  if (state.momentum !== 0) {
    const m = Math.max(c.momentumMin, Math.min(c.momentumMax, state.momentum));
    mods.push({ label: m > 0 ? 'кураж' : 'провали тиснуть', value: m });
  }

  if (state.minute > 80) {
    if (state.composureNow >= 70) mods.push({ label: 'спокійний у кінцівці', value: c.composureLateGood });
    else if (state.composureNow < 30) mods.push({ label: 'кінець матчу, нерви', value: c.composureLateBad });
  }

  if (state.flags.includes('booked') && isDefensiveAction(option, phase)) {
    mods.push({ label: 'жовта, йдеш обережніше', value: c.bookedDefending });
  }

  if (state.flags.includes('injured')) {
    mods.push({ label: 'пошкодження', value: c.injured });
  }

  // Условия матча. Каждая строка — то, что игрок прочитал на брифинге.
  const k = BALANCE.conditions;
  if (cond.venue === 'home' && signatureAttrs(player).includes(option.attribute)) {
    mods.push({ label: 'рідні трибуни чекають саме цього', value: k.homeSignatureBonus });
  }
  if (cond.venue === 'away' && state.minute >= k.awayLateMinute) {
    mods.push({ label: 'чужий стадіон, кінцівка', value: k.awayLateNerves });
  }
  if (cond.strength === 'strong') mods.push({ label: 'сильний суперник', value: k.strongOpponent });
  if (cond.strength === 'weak') mods.push({ label: 'слабкий суперник', value: k.weakOpponent });
  if (cond.weather === 'rain' && (option.attribute === 'dribbling' || option.attribute === 'passing')) {
    mods.push({ label: 'мокрий газон', value: k.rainPenalty });
  }
  if (cond.weather === 'wind' && (option.attribute === 'finishing' || (phase === 'setpiece' && option.attribute === 'passing'))) {
    mods.push({ label: 'вітер', value: k.windPenalty });
  }

  // Сдвиги формы риска. Накапливаем и зажимаем в один шаг: контекст может
  // сдвинуть позицию на шаг, но не превратить надёжный пас в авантюру.
  let posShift = 0;
  let effShift = 0;

  const s = BALANCE.shift;
  if (state.stamina < s.exhaustedBelow && option.staminaCost >= s.expensiveOption) posShift += 1;

  const losing = state.scoreUs < state.scoreThem;
  if (losing && state.minute > s.nervesAfterMinute && option.goals.personal >= s.nervesPersonal) {
    posShift += 1;
    effShift += 1;   // отчаяние даёт масштаб
  }

  if (state.coachTrust < s.lowTrustBelow && option.basePosition !== 'controlled') posShift += 1;

  posShift = Math.max(-1, Math.min(1, posShift));
  effShift = Math.max(-1, Math.min(1, effShift));

  return {
    attrMod: am,
    mods,
    flat: mods.reduce((sum, m) => sum + m.value, 0),
    position: shiftPosition(option.basePosition, posShift),
    effect: shiftEffect(option.effect, effShift),
  };
}
