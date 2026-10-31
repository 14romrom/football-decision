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

/** Штраф усталости — одне значення на рівень сил, однакове для будь-якого ходу (27.10, рішення
 *  користувача). Було «рівень × частка за ціною варіанта» (до −4 на дорогих при силах < 20): у зоні
 *  «на кубик» «ноги» стояли двічі з різними числами, а в кінцівці 27–30% сміливих варіантів не мали
 *  чистого ісходу взагалі. Дорогий хід і далі карається — витратою сил, яка швидше спускає на нижчий рівень. */
export function fatiguePenalty(stamina: number): ModLine {
  const c = BALANCE.contextMod;
  const value = stamina < 20 ? c.staminaCritical : stamina < 40 ? c.staminaLow : 0;
  if (value === 0) return { label: '', value: 0, source: 'player', short: '' };
  return stamina < 20
    ? { label: t('ноги стали'), value, source: 'player', short: t('ноги'), group: 'body' }
    : { label: t('втомився'), value, source: 'player', short: t('втома'), group: 'body' };
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

  // Истощение — уровнями по силам, одинаково для любого хода (fatiguePenalty).
  const tired = fatiguePenalty(state.stamina);
  if (state.stamina >= 70) mods.push({ label: t('свіжість'), value: c.staminaHigh, source: 'player', short: t('свіжий'), group: 'body' });
  else if (tired.value !== 0) mods.push(tired);

  if (state.momentum !== 0) {
    const m = Math.max(c.momentumMin, Math.min(c.momentumMax, state.momentum));
    mods.push({ label: m > 0 ? t('кураж') : t('куражу немає'), value: m, source: 'player', short: m > 0 ? t('кураж') : t('без куражу'), group: 'head' });
  }

  // Попередній момент провалився — наступне рішення важче (тестер 17.09: «−1 після невдачі»).
  // Спокій не тягне минулий провал у наступне рішення (COMPOSURE_CALM).
  const lastTier = [...state.log].reverse().find((e) => e.kind === 'episode')?.tier;
  const calm = COMPOSURE_CALM.ignoresAfterFail && option.attribute === 'composure';
  if ((lastTier === 'fail' || lastTier === 'badFail') && !calm) mods.push({ label: t('після провалу'), value: c.afterFail, source: 'player', short: t('після провалу'), group: 'head' });

  if (state.minute > 80) {
    if (state.composureNow >= 70) mods.push({ label: t('спокійний у кінцівці'), value: c.composureLateGood, source: 'player', short: t('кінцівка'), group: 'head' });
    else if (state.composureNow < 30) mods.push({ label: t('кінець матчу, нерви'), value: c.composureLateBad, source: 'player', short: t('нерви'), group: 'head' });
  }

  if (state.flags.includes('booked') && isDefensiveAction(option, phase)) {
    mods.push({ label: t('жовта, йдеш обережніше'), value: c.bookedDefending, source: 'player', short: t('жовта'), group: 'head' });
  }

  if (state.flags.includes('injured')) {
    mods.push({ label: t('пошкодження'), value: c.injured, source: 'player', short: t('травма'), group: 'body' });
  }

  // Последствия прошлых решений: флаг стоит — строка есть. Это и есть
  // «я сам підготував цей момент» в цифрах.
  // Черты соперника (them_*) не складываются: у «Гурніка» (тоді — «Сан-Дореа») star, dribbler и playmaker все
  // бьют по позиції в обороне, и тестер 18.09 получал −3 на «вибити головою куди завгодно» —
  // это не задумывалось, это три правила на одном атрибуте. На бросок идёт одна, самая
  // сильная черта; остальные флаги (свои последствия, воротарь) — как и раньше, все.
  let trait: ModLine | null = null;
  for (const rule of flagRules) {
    if (!state.flags.includes(rule.id)) continue;
    // Правило с нулём — маркер: флаг нужен сценам (сетапы, реактивные эпизоды), а не броску.
    if (rule.value === 0) continue;
    if (rule.attributes && !rule.attributes.includes(option.attribute)) continue;
    if (rule.phases && !rule.phases.includes(phase)) continue;
    if (rule.options && !rule.options.includes(option.id)) continue;
    const line = { label: rule.label, value: rule.value, source: rule.source ?? 'field' as const, short: rule.short ?? rule.label.split(/[\s,—]+/).slice(0, 2).join(' '), group: rule.group ?? 'opp' };
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
    mods.push({ label: VOICE_LABEL[option.voice.who] + t(' веде'), value: v.listenBonus, source: 'player', short: VOICE_LABEL[option.voice.who], group: 'head' });
  }
  const streak = state.voices.streak;
  if (streak.who === 'ego' && streak.count >= v.streakAt && option.goals.team >= 2) {
    mods.push({ label: t('Его заглушило команду'), value: v.streakPenalty, source: 'player', short: t('Его'), group: 'head' });
  }
  if (streak.who === 'team' && streak.count >= v.streakAt && option.goals.personal >= 2) {
    mods.push({ label: t('команда чекає на пас'), value: v.streakPenalty, source: 'player', short: t('Команда'), group: 'head' });
  }

  // Условия матча. Каждая строка — то, что игрок прочитал на брифинге.
  const k = BALANCE.conditions;
  if (cond.venue === 'home' && signatureAttrs(player).includes(option.attribute)) {
    mods.push({ label: t('рідні трибуни чекають саме цього'), value: k.homeSignatureBonus, source: 'field', short: t('свої'), group: 'cond' });
  }
  if (cond.venue === 'away' && cond.league === 'top') {
    mods.push({ label: t('виїзд у вищій лізі'), value: k.awayTop, source: 'field', short: t('виїзд'), group: 'cond' });
  } else if (cond.venue === 'away' && state.minute >= k.awayLateMinute) {
    mods.push({ label: t('чужий стадіон, кінцівка'), value: k.awayLateNerves, source: 'field', short: t('виїзд'), group: 'cond' });
  }
  // Ліга і сила суперника не складаються (те саме правило, що для рис суперника): іде одна, найсильніша.
  // Інакше в другому сезоні кожен матч проти сильного клубу відкривався з −2, і вища ліга ставала стіною.
  if (cond.league === 'top' || cond.strength === 'strong') {
    const top = cond.league === 'top' ? { label: t('вища ліга'), value: k.topLeague, short: t('вища ліга') } : null;
    const strong = cond.strength === 'strong' ? { label: t('сильний суперник'), value: k.strongOpponent, short: t('сильні') } : null;
    const worst = [top, strong].filter((x): x is NonNullable<typeof x> => !!x).sort((a2, b2) => a2.value - b2.value)[0];
    mods.push({ ...worst, source: 'field', group: worst === top ? 'cond' : 'opp' });
  }
  if (cond.strength === 'weak') mods.push({ label: t('слабкий суперник'), value: k.weakOpponent, source: 'field', short: t('слабкі'), group: 'opp' });
  // Ведемо з запасом — розслабилися (BALANCE.conditions.relaxLead): кураж і «слабкі» лишаються на екрані,
  // а окремий рядок їх гасить, щоб гравець бачив, куди вони поділися.
  if (state.scoreUs - state.scoreThem >= k.relaxLead) {
    const eased = Math.max(0, Math.min(c.momentumMax, state.momentum)) + (cond.strength === 'weak' ? k.weakOpponent : 0);
    if (eased > 0) mods.push({ label: t('ведемо — розслабилися'), value: -eased, source: 'field', short: t('розслабились'), group: 'cond' });
  }
  // Дзеркально: вони ведуть із запасом — розслабилися вони. Наш спад куражу й їхня сила гасяться рядком.
  if (state.scoreThem - state.scoreUs >= k.relaxLead) {
    const eased = -Math.min(0, Math.max(c.momentumMin, state.momentum)) + (cond.strength === 'strong' ? -k.strongOpponent : 0);
    if (eased > 0) mods.push({ label: t('вони ведуть — розслабилися'), value: eased, source: 'field', short: t('вони розслабились'), group: 'cond' });
  }
  // Тебе пасуть (BALANCE.conditions.markedPer): після твого гола чи асиста — на твоїх ударах і обводці.
  // Репутація (24.10): після 3+ голів і асистів за два минулі матчі їхній тренер готується — опіка з першої
  // хвилини, наче одна результативна дія вже є (state.markedRep). Стеля та сама: markedMax.
  const contrib = state.stats.goals + state.stats.assists + (state.markedRep ?? 0);
  const marks = option.attribute === 'dribbling' || Object.values(option.outcomes).some((x) => x?.apply?.goal || (k.markedScope === 'involved' && x?.apply?.assist));
  if (contrib > 0 && k.markedPer && marks) {
    mods.push({ label: t('тебе пасуть'), value: Math.max(k.markedMax, k.markedPer * contrib), source: 'field', short: t('пасуть'), group: 'opp' });
  }
  if (cond.weather === 'rain' && (option.attribute === 'dribbling' || option.attribute === 'passing')) {
    mods.push({ label: t('мокрий газон'), value: k.rainPenalty, source: 'field', short: t('газон'), group: 'cond' });
  }
  if (cond.weather === 'wind' && (option.attribute === 'finishing' || (phase === 'setpiece' && option.attribute === 'passing'))) {
    mods.push({ label: t('вітер'), value: k.windPenalty, source: 'field', short: t('вітер'), group: 'cond' });
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
