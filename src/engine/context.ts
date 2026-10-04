// Контекстные модификаторы: плоские бонусы к score и сдвиги формы риска.
// Всё, что здесь считается, потом показывается игроку списком после броска —
// это единственный способ увидеть, что прошлые решения на что-то повлияли.

import { BALANCE, COMPOSURE_CALM, POSITION_ORDER } from './balance';
import { neutralConditions, signatureAttrs, type MatchConditions } from './conditions';
import { attrMod } from './attr';
import { VOICE_LABEL, voiceAudible } from './voices';
import { ATTRIBUTE_LABEL, type Effect, type EpisodeOption, type Episode, type FlagRule, type MatchState, type ModLine, type Player, type Position } from './types';
import { t } from '../content/i18n';

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
  if (base === 0) return { label: '', value: 0, source: 'player', short: '' };
  const share = cost >= c.fatigueFullCost ? 1 : cost >= c.fatigueHalfCost ? 0.5 : 0.25;
  const value = -Math.max(1, Math.round(-base * share));
  const label = stamina < 20
    ? (share === 1 ? t('ноги стали') : t('ноги стали, але це дешево'))
    : (share === 1 ? t('втомився') : t('втомився, але це дешево'));
  return { label, value, source: 'player', short: stamina < 20 ? t('ноги') : t('втома') };
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
  mods.push({ label: ATTRIBUTE_LABEL[option.attribute] + ' (' + player.attrs[option.attribute] + ')', value: am, source: 'player', short: ATTRIBUTE_LABEL[option.attribute] });

  const c = BALANCE.contextMod;

  // Истощение — уровнями, и штраф зависит от цены варианта: уставшие ноги мешают
  // спринту, а не простому пасу. На нулевых силах дешёвое решение остаётся рабочим —
  // это и делает «берегти сили» тактикой, а не приговором (плейтест: 8 из 9 решений
  // при силах ≤10 проваливались, потому что штраф был одинаковым для всего).
  const tired = fatiguePenalty(state.stamina, option.staminaCost);
  if (state.stamina >= 70) mods.push({ label: t('свіжість'), value: c.staminaHigh, source: 'player', short: t('свіжий') });
  else if (tired.value !== 0) mods.push(tired);

  if (state.momentum !== 0) {
    const m = Math.max(c.momentumMin, Math.min(c.momentumMax, state.momentum));
    mods.push({ label: m > 0 ? t('кураж') : t('куражу немає'), value: m, source: 'player', short: m > 0 ? t('кураж') : t('без куражу') });
  }

  // Попередній момент провалився — наступне рішення важче (тестер 17.09: «−1 після невдачі»).
  // Спокій не тягне минулий провал у наступне рішення (COMPOSURE_CALM).
  const lastTier = [...state.log].reverse().find((e) => e.kind === 'episode')?.tier;
  const calm = COMPOSURE_CALM.ignoresAfterFail && option.attribute === 'composure';
  if ((lastTier === 'fail' || lastTier === 'badFail') && !calm) mods.push({ label: t('після провалу'), value: c.afterFail, source: 'player', short: t('після провалу') });

  if (state.minute > 80) {
    if (state.composureNow >= 70) mods.push({ label: t('спокійний у кінцівці'), value: c.composureLateGood, source: 'player', short: t('кінцівка') });
    else if (state.composureNow < 30) mods.push({ label: t('кінець матчу, нерви'), value: c.composureLateBad, source: 'player', short: t('нерви') });
  }

  if (state.flags.includes('booked') && isDefensiveAction(option, phase)) {
    mods.push({ label: t('жовта, йдеш обережніше'), value: c.bookedDefending, source: 'player', short: t('жовта') });
  }

  if (state.flags.includes('injured')) {
    mods.push({ label: t('пошкодження'), value: c.injured, source: 'player', short: t('травма') });
  }

  // Последствия прошлых решений: флаг стоит — строка есть. Это и есть
  // «я сам підготував цей момент» в цифрах.
  // Черты соперника (them_*) не складываются: у «Сан-Дореа» star, dribbler и playmaker все
  // бьют по позиції в обороне, и тестер 18.09 получал −3 на «вибити головою куди завгодно» —
  // это не задумывалось, это три правила на одном атрибуте. На бросок идёт одна, самая
  // сильная черта; остальные флаги (свои последствия, воротарь) — как и раньше, все.
  let trait: { label: string; value: number; source: 'player' | 'field' } | null = null;
  for (const rule of flagRules) {
    if (!state.flags.includes(rule.id)) continue;
    // Правило с нулём — маркер: флаг нужен сценам (сетапы, реактивные эпизоды), а не броску.
    if (rule.value === 0) continue;
    if (rule.attributes && !rule.attributes.includes(option.attribute)) continue;
    if (rule.phases && !rule.phases.includes(phase)) continue;
    if (rule.options && !rule.options.includes(option.id)) continue;
    const line = { label: rule.label, value: rule.value, source: rule.source ?? 'field' as const, short: rule.short ?? rule.label.split(/[\s,—]+/).slice(0, 2).join(' ') };
    if (rule.id.startsWith('them_')) {
      if (!trait || Math.abs(line.value) > Math.abs(trait.value)) trait = line;
      continue;
    }
    mods.push(line);
  }
  if (trait) mods.push(trait);

  // Голоса имеют вес (плейтест 17.09: «голоса ни на что не влияют»). Голос атрибута,
  // который слышно на варианте, ведёт: +1 — ты в своей стихии. Команда бонуса к броску не даёт
  // (её варианты и так самые надёжные — аудит 20.09: EV 1.56 против 0.44 у Его), а серия одного
  // из них глушит другого: три раза подряд слушал Его — командные варианты на −1, и наоборот.
  // Его ведёт тоже (M9, 20.09): он слышен только на кураже, его варианты — ризик/відчай с 15% чистых,
  // и без +1 это был единственный голос, которого слушать невыгодно всегда. +1 не трогает полосу
  // катастрофы — кураж делает удар точнее, не безопаснее.
  const v = BALANCE.voice;
  if (option.voice && voiceAudible(option.voice.who, option, state, player) && option.voice.who !== 'team') {
    mods.push({ label: VOICE_LABEL[option.voice.who] + t(' веде'), value: v.listenBonus, source: 'player', short: VOICE_LABEL[option.voice.who] });
  }
  const streak = state.voices.streak;
  if (streak.who === 'ego' && streak.count >= v.streakAt && option.goals.team >= 2) {
    mods.push({ label: t('Его заглушило команду'), value: v.streakPenalty, source: 'player', short: t('Его') });
  }
  if (streak.who === 'team' && streak.count >= v.streakAt && option.goals.personal >= 2) {
    mods.push({ label: t('команда чекає на пас'), value: v.streakPenalty, source: 'player', short: t('Команда') });
  }

  // Условия матча. Каждая строка — то, что игрок прочитал на брифинге.
  const k = BALANCE.conditions;
  if (cond.venue === 'home' && signatureAttrs(player).includes(option.attribute)) {
    mods.push({ label: t('рідні трибуни чекають саме цього'), value: k.homeSignatureBonus, source: 'field', short: t('свої') });
  }
  if (cond.venue === 'away' && state.minute >= k.awayLateMinute) {
    mods.push({ label: t('чужий стадіон, кінцівка'), value: k.awayLateNerves, source: 'field', short: t('виїзд') });
  }
  // Ліга і сила суперника не складаються (те саме правило, що для рис суперника): іде одна, найсильніша.
  // Інакше в другому сезоні кожен матч проти сильного клубу відкривався з −2, і вища ліга ставала стіною.
  if (cond.league === 'top' || cond.strength === 'strong') {
    const top = cond.league === 'top' ? { label: t('вища ліга'), value: k.topLeague, short: t('вища ліга') } : null;
    const strong = cond.strength === 'strong' ? { label: t('сильний суперник'), value: k.strongOpponent, short: t('сильні') } : null;
    const worst = [top, strong].filter((x): x is NonNullable<typeof x> => !!x).sort((a2, b2) => a2.value - b2.value)[0];
    mods.push({ ...worst, source: 'field' });
  }
  if (cond.strength === 'weak') mods.push({ label: t('слабкий суперник'), value: k.weakOpponent, source: 'field', short: t('слабкі') });
  if (cond.weather === 'rain' && (option.attribute === 'dribbling' || option.attribute === 'passing')) {
    mods.push({ label: t('мокрий газон'), value: k.rainPenalty, source: 'field', short: t('газон') });
  }
  if (cond.weather === 'wind' && (option.attribute === 'finishing' || (phase === 'setpiece' && option.attribute === 'passing'))) {
    mods.push({ label: t('вітер'), value: k.windPenalty, source: 'field', short: t('вітер') });
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
