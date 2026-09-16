// Все настроечные числа прототипа. Меняем баланс только здесь,
// после каждого изменения гоняем `npm run sim`.

import type { Position, Tier } from './types';

/** Верхние границы tier по итоговому score. clean — всё, что выше cost. */
export const THRESHOLDS: Record<Position, { badFail: number; fail: number; cost: number }> = {
  controlled: { badFail: 2, fail: 7, cost: 12 },
  risky: { badFail: 2, fail: 10, cost: 16 },
  desperate: { badFail: 3, fail: 12, cost: 18 },
};

export const MOMENTUM_BY_TIER: Record<Tier, number> = {
  clean: 1, cost: 0, fail: -1, badFail: -2,
};

export const BALANCE = {
  staminaStart: 100,
  composureStart: 60,
  coachTrustStart: 55,
  fanHypeStart: 45,

  /** Пассивный расход стамины за игровую минуту.
   *  Без него критерий приёмки «на самых дорогих опциях стамина кончается
   *  до 70-й минуты» недостижим: 7 эпизодов до 70-й × макс. 12 = 84 < 100. */
  staminaDrainPerMinute: 0.38,

  /** Флаг 'tired' вешается автоматически ниже этого порога. */
  tiredBelow: 30,

  contextMod: {
    staminaHigh: 1,        // stamina >= 70
    staminaLow: -2,        // stamina 20..39
    staminaCritical: -4,   // stamina < 20
    composureLateGood: 2,  // composureNow >= 70 и минута > 80
    composureLateBad: -2,  // composureNow < 30 и минута > 80
    bookedDefending: -2,   // флаг 'booked' на защитном действии
    injured: -2,           // микротравма тянется до конца матча
  },

  /** Пороги сдвигов позиции (см. context.ts). */
  shift: {
    exhaustedBelow: 25,       // stamina < 25 ...
    expensiveOption: 8,       // ... и staminaCost >= 8 => шаг к desperate
    nervesAfterMinute: 80,    // проигрываем и минута > 80 ...
    nervesPersonal: 2,        // ... и goals.personal >= 2 => шаг к desperate, но effect +1
    lowTrustBelow: 30,        // coachTrust < 30 => всё, кроме controlled, на шаг хуже
  },

  /** Контратака после badFail: вероятность, что она превратится в гол. */
  counterAttackConcede: 0.3,

  match: {
    /** 10 эпизодов: 4 в первом тайме, 6 во втором, последний после 85-й. */
    episodeMinutes: [7, 18, 29, 38, 50, 58, 66, 74, 82, 88],
    minuteJitter: 2,
    /** Базовый шанс гола в каждом промежутке между эпизодами (без нашего участия). */
    fillerGoalBase: 0.07,
    /** На сколько momentum смещает этот шанс в нашу/их сторону. */
    fillerGoalMomentum: 0.012,
  },

  /** Системные правила, которые не хочется дублировать в каждом исходе контента. */
  systemic: {
    /** Провал эгоистичного решения бьёт по доверию тренера сильнее командного. */
    selfishFailTrustPenalty: 2,
    /** Общий множитель на все изменения coachTrust. Нужен, чтобы за 10 эпизодов
     *  доверие не упиралось в 0 или 100: упёршееся доверие перестаёт быть ресурсом. */
    trustDeltaScale: 0.7,
    /** Трибуны реагируют на смелость сами по себе, до того как ясен результат.
     *  Осторожная игра трибуны не радует — отсюда минус у controlled. */
    boldnessHype: { controlled: -2, risky: 3, desperate: 6 },
  },

  /** Оценки на итоговом экране: намеренно считаются из разных вещей. */
  rating: {
    coach: { base: 2, trustWeight: 6, goal: 0.6, assist: 0.5, keyPass: 0.15, duel: 0.1, loss: -0.18, foul: -0.12 },
    fan: { base: 2, hypeWeight: 6, goal: 0.9, assist: 0.5, duel: 0.12, loss: -0.04 },
  },
} as const;

export const POSITION_ORDER: Position[] = ['controlled', 'risky', 'desperate'];
