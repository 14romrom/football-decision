// Контекстные модификаторы: плоские бонусы к score и сдвиги формы риска.
// Всё, что здесь считается, потом показывается игроку списком после броска —
// это единственный способ увидеть, что прошлые решения на что-то повлияли.

import { BALANCE, POSITION_ORDER } from './balance';
import { neutralConditions, signatureAttrs, type MatchConditions } from './conditions';
import { attrMod } from './attr';
import { VOICE_LABEL, voiceAudible } from './voices';
import { ATTRIBUTE_LABEL, type Effect, type EpisodeOption, type Episode, type FlagRule, type MatchState, type ModLine, type Player, type Position } from './types';

export { attrMod };

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
  return phase === 'defense' || option.attribute === 'positioning' || option.attribute === 'strength';
}

/** Штраф усталости: уровень по силам × доля по цене варианта. */
export function fatiguePenalty(stamina: number, cost: number): ModLine {
  const c = BALANCE.contextMod;
  const base = stamina < 20 ? c.staminaCritical : stamina < 40 ? c.staminaLow : 0;
  if (base === 0) return { label: '', value: 0 };
  const share = cost >= c.fatigueFullCost ? 1 : cost >= c.fatigueHalfCost ? 0.5 : 0.25;
  const value = -Math.max(1, Math.round(-base * share));
  const label = stamina < 20
    ? (share === 1 ? 'ноги стали' : 'ноги стали, але це дешево')
    : (share === 1 ? 'втомився' : 'втомився, але це дешево');
  return { label, value };
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
  flagRules: FlagRule[] = [],
): ContextResult {
  const mods: ModLine[] = [];
  // Строка атрибута показывается всегда, со значением: игрок должен видеть, что его скилл
  // участвует в броске, даже когда бонус нулевой.
  const am = attrMod(player.attrs[option.attribute]);
  mods.push({ label: ATTRIBUTE_LABEL[option.attribute] + ' (' + player.attrs[option.attribute] + ')', value: am });

  const c = BALANCE.contextMod;

  // Истощение — уровнями, и штраф зависит от цены варианта: уставшие ноги мешают
  // спринту, а не простому пасу. На нулевых силах дешёвое решение остаётся рабочим —
  // это и делает «берегти сили» тактикой, а не приговором (плейтест: 8 из 9 решений
  // при силах ≤10 проваливались, потому что штраф был одинаковым для всего).
  const tired = fatiguePenalty(state.stamina, option.staminaCost);
  if (state.stamina >= 70) mods.push({ label: 'свіжість', value: c.staminaHigh });
  else if (tired.value !== 0) mods.push(tired);

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

  // Последствия прошлых решений: флаг стоит — строка есть. Это и есть
  // «я сам підготував цей момент» в цифрах.
  for (const rule of flagRules) {
    if (!state.flags.includes(rule.id)) continue;
    if (rule.attributes && !rule.attributes.includes(option.attribute)) continue;
    if (rule.phases && !rule.phases.includes(phase)) continue;
    mods.push({ label: rule.label, value: rule.value });
  }

  // Голоса имеют вес (плейтест 17.09: «голоса ни на что не влияют»). Голос атрибута,
  // который слышно на варианте, ведёт: +1 — ты в своей стихии. Его и Команда бонуса
  // к броску не дают, но серия одного из них глушит другого: три раза подряд слушал
  // Его — командные варианты на −1 («Его заглушило команду»), и наоборот.
  const v = BALANCE.voice;
  if (option.voice && voiceAudible(option.voice.who, option, state, player)
    && option.voice.who !== 'ego' && option.voice.who !== 'team') {
    mods.push({ label: VOICE_LABEL[option.voice.who] + ' веде', value: v.listenBonus });
  }
  const streak = state.voices.streak;
  if (streak.who === 'ego' && streak.count >= v.streakAt && option.goals.team >= 2) {
    mods.push({ label: 'Его заглушило команду', value: v.streakPenalty });
  }
  if (streak.who === 'team' && streak.count >= v.streakAt && option.goals.personal >= 2) {
    mods.push({ label: 'команда чекає на пас', value: v.streakPenalty });
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
  if (state.coachTrust >= s.highTrustAbove) effShift += 1;   // довіра дає масштаб

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
