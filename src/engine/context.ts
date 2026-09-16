// Контекстные модификаторы: плоские бонусы к score и сдвиги формы риска.
// Всё, что здесь считается, потом показывается игроку списком после броска —
// это единственный способ увидеть, что прошлые решения на что-то повлияли.

import { BALANCE, POSITION_ORDER } from './balance';
import type { Attribute, Effect, EpisodeOption, Episode, MatchState, ModLine, Player, Position } from './types';

const ATTR_LABEL: Record<Attribute, string> = {
  finishing: 'удар',
  passing: 'пас',
  dribbling: 'дриблинг',
  pace: 'скорость',
  strength: 'корпус',
  defending: 'отбор',
  composure: 'хладнокровие',
};

export function attrMod(attr: number): number {
  // floor((attr - 50) / 5), зажато в -9..+9
  return Math.max(-9, Math.min(9, Math.floor((attr - 50) / 5)));
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
): ContextResult {
  const mods: ModLine[] = [];
  const am = attrMod(player.attrs[option.attribute]);
  if (am !== 0) mods.push({ label: ATTR_LABEL[option.attribute], value: am });

  const c = BALANCE.contextMod;

  if (state.stamina >= 70) mods.push({ label: 'свежесть', value: c.staminaHigh });
  else if (state.stamina >= 40) { /* 40..69 — без модификатора */ }
  else if (state.stamina >= 20) mods.push({ label: 'устал', value: c.staminaLow });
  else mods.push({ label: 'ноги встали', value: c.staminaCritical });

  if (state.momentum !== 0) {
    mods.push({ label: state.momentum > 0 ? 'кураж' : 'провалы давят', value: state.momentum });
  }

  if (state.minute > 80) {
    if (state.composureNow >= 70) mods.push({ label: 'спокоен в концовке', value: c.composureLateGood });
    else if (state.composureNow < 30) mods.push({ label: 'конец матча, нервы', value: c.composureLateBad });
  }

  if (state.flags.includes('booked') && isDefensiveAction(option, phase)) {
    mods.push({ label: 'жёлтая, идёшь аккуратнее', value: c.bookedDefending });
  }

  if (state.flags.includes('injured')) {
    mods.push({ label: 'повреждение', value: c.injured });
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
