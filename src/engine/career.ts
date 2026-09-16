// Рост между матчами (M2): опыт → уровень → +1 атрибут, тренировка, перенос доверия
// тренера и последствий карточек/травм. Чистая логика без React и без localStorage —
// хранилище отдельно (telemetry/career-storage.ts), здесь только правила.

import { BALANCE } from './balance';
import type { Rng } from './rng';
import type { Attribute, MatchState, Player, VoiceKey } from './types';
import type { MatchSummary } from './match';

export type Career = {
  xp: number;
  level: number;
  /** Очки прокачки поверх стартовых атрибутов (лист персонажа = attrs + attrPoints). */
  attrPoints: Partial<Record<Attribute, number>>;
  /** Доверие тренера на конец последнего матча — стартовая точка для следующего
   *  (с регрессией к среднему, см. nextMatchCoachTrust), не сбрасывается на 55 каждый раз. */
  coachTrust: number;
  /** Несгоревшие жёлтые за карьеру; на третьей — тренер начинает следующий матч настороже. */
  careerYellows: number;
  /** Сколько ближайших матчей ещё аукается травма (сниженный старт сил). */
  injuredMatches: number;
  /** Правда только на один следующий матч после травмы/картки — потребляется при старте. */
  pendingSentOff: boolean;
  /** Накопленный профиль голосов за карьеру — материал для будущих черт (M4). */
  voiceCounts: Record<VoiceKey, number>;
  matchesPlayed: number;
  /** Один бросок тренировки на цикл «между матчами»; сбрасывается при старте нового матча. */
  trainedThisCycle: boolean;
};

export function defaultCareer(): Career {
  return {
    xp: 0,
    level: 1,
    attrPoints: {},
    coachTrust: BALANCE.coachTrustStart,
    careerYellows: 0,
    injuredMatches: 0,
    pendingSentOff: false,
    voiceCounts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 },
    matchesPlayed: 0,
    trainedThisCycle: false,
  };
}

/** Опыт за матч: база + оценки + бонус за чёткий характер (доминирующий голос —
 *  тот же порог BALANCE.voiceDominantMin, что и в пересказе, — один критерий на игру). */
export function xpForMatch(summary: MatchSummary, hadDominantVoice: boolean): number {
  const base = 8;
  const ratings = Math.round(summary.coachRating) + Math.round(summary.fanRating);
  const character = hadDominantVoice ? 3 : 0;
  return base + ratings + character;
}

/** Кумулятивный порог опыта для каждого уровня: первые уровни быстро, дальше — реже.
 *  LEVEL_THRESHOLDS[i] — сколько опыта нужно для уровня i+2 (уровень 1 — старт без опыта). */
export const LEVEL_THRESHOLDS = [20, 45, 75, 110, 150, 195, 245, 300, 360, 425];

export function levelForXp(xp: number): number {
  let level = 1;
  for (const threshold of LEVEL_THRESHOLDS) {
    if (xp < threshold) break;
    level += 1;
  }
  return level;
}

export function xpToNextLevel(xp: number): { xpIntoLevel: number; xpForLevel: number } | null {
  const level = levelForXp(xp);
  if (level - 2 >= LEVEL_THRESHOLDS.length) return null; // потолок таблицы — дальше уровни не считаем
  const prevThreshold = level === 1 ? 0 : LEVEL_THRESHOLDS[level - 2];
  const nextThreshold = LEVEL_THRESHOLDS[level - 1];
  if (nextThreshold === undefined) return null;
  return { xpIntoLevel: xp - prevThreshold, xpForLevel: nextThreshold - prevThreshold };
}

/** Игрок для этого матча: базовые атрибуты + накопленные очки прокачки, зажато в 1..99.
 *  attrMod() сам ограничивает модификатор потолком +12 — раскачать бросок до абсурда
 *  прокачкой нельзя, даже если атрибут дойдёт до 99. */
export function effectivePlayer(base: Player, career: Career): Player {
  const attrs = { ...base.attrs };
  for (const [attr, bonus] of Object.entries(career.attrPoints) as [Attribute, number][]) {
    attrs[attr] = Math.max(1, Math.min(99, attrs[attr] + bonus));
  }
  return { ...base, attrs };
}

/** Доверие тренера между матчами: тянется к базовому значению, а не сохраняется дословно —
 *  иначе один провальный матч навсегда портит карьеру, а один удачный — навсегда её решает. */
export function nextMatchCoachTrust(endingTrust: number): number {
  const reversion = 0.4;
  return Math.round(endingTrust * (1 - reversion) + BALANCE.coachTrustStart * reversion);
}

export type StartPenalty = { staminaPenalty: number; coachTrustPenalty: number; note?: string };

/** Штрафы старта следующего матча от травмы/картки прошлого — и одновременно их
 *  потребление (счётчики уменьшаются). Вызывается один раз при старте матча. */
export function consumeStartPenalty(career: Career): { career: Career; penalty: StartPenalty } {
  let staminaPenalty = 0;
  let coachTrustPenalty = 0;
  let note: string | undefined;
  const next = { ...career };

  if (career.pendingSentOff) {
    coachTrustPenalty = 25;
    note = 'Тренер не забув червону картку з минулого матчу — починаєш із меншою довірою.';
    next.pendingSentOff = false;
  } else if (career.careerYellows >= 3) {
    coachTrustPenalty = 15;
    note = 'Тренер пам’ятає про жовті картки — починаєш під пильнішим наглядом.';
    next.careerYellows = 0;
  }

  if (career.injuredMatches > 0) {
    staminaPenalty = 20;
    note = note ? note + ' Ще й тіло не до кінця відновилося.' : 'Ти граєш після травми — сили менше з першої хвилини.';
    next.injuredMatches = career.injuredMatches - 1;
  }

  return { career: next, penalty: { staminaPenalty, coachTrustPenalty, note } };
}

/** Обновление карьеры по итогам матча: опыт, уровень (без авто-траты очка — это отдельный
 *  экран выбора), доверие тренера, счётчик жёлтых/травм, профиль голосов. */
export function applyMatchToCareer(
  career: Career, state: MatchState, summary: MatchSummary, hadDominantVoice: boolean,
): Career {
  const xp = career.xp + xpForMatch(summary, hadDominantVoice);
  const next: Career = {
    ...career,
    xp,
    level: levelForXp(xp),
    coachTrust: nextMatchCoachTrust(state.coachTrust),
    matchesPlayed: career.matchesPlayed + 1,
    voiceCounts: { ...career.voiceCounts },
    // Окно тренировки открывается здесь, на границе «матч закончился», а не при
    // старте следующего — иначе между результатом и меню кнопка ещё выглядела бы
    // использованной с прошлого раза.
    trainedThisCycle: false,
  };
  for (const [voice, count] of Object.entries(state.voices.counts) as [VoiceKey, number][]) {
    next.voiceCounts[voice] += count;
  }
  if (state.flags.includes('sent_off')) next.pendingSentOff = true;
  else if (state.flags.includes('booked')) next.careerYellows = career.careerYellows + 1;
  if (state.flags.includes('injured')) next.injuredMatches = Math.max(career.injuredMatches, 1);
  return next;
}

export const TRAIN_THRESHOLD = 13; // 2d10 >= 13 — около 36%, тренировка не гарантирована

export function trainAttribute(career: Career, attr: Attribute, rng: Rng): { career: Career; success: boolean; roll: number } {
  const roll = rng.roll();
  const success = roll >= TRAIN_THRESHOLD;
  if (!success) return { career: { ...career, trainedThisCycle: true }, success, roll };
  const attrPoints = { ...career.attrPoints, [attr]: (career.attrPoints[attr] ?? 0) + 1 };
  return { career: { ...career, attrPoints, trainedThisCycle: true }, success, roll };
}
