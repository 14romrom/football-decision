// Условия матча: стадион, соперник, установка тренера, погода и тонус футболиста.
// Генерируются игрой по сиду (тонус — из истории матчей), показываются на брифинге
// и дальше работают как контекст: модификаторы к броску, стартовые ресурсы,
// реакция тренера и трибун. Игрок их не выбирает — погоду не выбирают.

import { BALANCE } from './balance';
import type { Rng } from './rng';
import type { Attribute, Player } from './types';

/** 'neutral' — только для прогона и тестов: игра его не генерирует. */
export type Venue = 'home' | 'away' | 'neutral';
export type Strength = 'strong' | 'even' | 'weak';
export type Instruction = 'hold' | 'press' | 'free' | 'none';
export type Weather = 'clear' | 'rain' | 'heat' | 'wind';

export type Tone = {
  /** −2..+2 по результатам последних матчей. */
  confidence: number;
  /** 0..3 — сколько матчей подряд без паузы уже сыграно. */
  fatigue: number;
};

export type MatchConditions = {
  venue: Venue;
  opponentKey: string;
  strength: Strength;
  instruction: Instruction;
  weather: Weather;
  tone: Tone;
  /** Аналитик перед матчем рассказал про воротаря — флаг keeper_read с первой минуты. */
  keeperTip?: boolean;
  /** Ліга матчу (M17): без поля — друга. Епізоди з requires.league іншої ліги в пул не потрапляють. */
  league?: 'top' | 'second';
};

export type MatchResult = 'W' | 'D' | 'L';

/** Нейтральные условия — для балансного прогона и тестов: ни одного модификатора. */
export function neutralConditions(opponentKey = 'sandorea'): MatchConditions {
  return {
    venue: 'neutral', opponentKey, strength: 'even', instruction: 'none', weather: 'clear',
    tone: { confidence: 0, fatigue: 0 },
  };
}

/** Тонус из истории: форма — последние три результата, усталость — матчи подряд.
 *  Каждый четвёртый матч предваряет пауза, поэтому усталость идёт циклом 0-1-2-3. */
export function toneFromHistory(results: MatchResult[]): Tone {
  const last = results.slice(-3);
  const confidence = Math.max(-2, Math.min(2, last.reduce((s, r) => s + (r === 'W' ? 1 : r === 'L' ? -1 : 0), 0)));
  return { confidence, fatigue: results.length % 4 };
}

/** Условия матча. Соперник и поле — из расписания сезона, если оно есть (fixture);
 *  без него — случайные, как в прогоне. Установка тренера и погода случайны всегда. */
export function generateConditions(
  rng: Rng, opponents: Record<string, { strength: Strength }>, tone: Tone,
  fixture?: { opponentKey: string; venue: 'home' | 'away' },
): MatchConditions {
  const opponentKey = fixture?.opponentKey ?? rng.pick(Object.keys(opponents));
  const venue: Venue = fixture?.venue ?? (rng.chance(0.5) ? 'home' : 'away');
  return {
    venue,
    opponentKey,
    strength: opponents[opponentKey].strength,
    instruction: rng.pick<Instruction>(['hold', 'press', 'free']),
    weather: rng.weighted<Weather>(['clear', 'rain', 'heat', 'wind'], (w) => (w === 'clear' ? 3 : 1)),
    tone,
    keeperTip: rng.chance(BALANCE.keeperRead.analystChance),
  };
}

/** Два сильнейших атрибута — те, за которые домашние трибуны любят именно этого игрока. */
export function signatureAttrs(player: Player): Attribute[] {
  return (Object.entries(player.attrs) as [Attribute, number][])
    .sort((a, b) => b[1] - a[1]).slice(0, BALANCE.conditions.signatureAttrs).map(([k]) => k);
}

/** Стартовые ресурсы с поправкой на тонус. */
export function startResources(c: MatchConditions): { stamina: number; composure: number; fanHype: number; momentum: number } {
  const k = BALANCE.conditions;
  return {
    stamina: BALANCE.staminaStart - c.tone.fatigue * k.fatigueStamina,
    composure: BALANCE.composureStart + c.tone.confidence * k.confidenceComposure,
    momentum: Math.max(-k.confidenceMomentumCap, Math.min(k.confidenceMomentumCap, c.tone.confidence)),
    fanHype: BALANCE.fanHypeStart + (c.venue === 'home' ? k.homeHypeStart : c.venue === 'away' ? k.awayHypeStart : 0),
  };
}

/** Множитель на реакцию трибун: дома они громче, на выезде тебя не любят. */
export function hypeScale(c: MatchConditions): number {
  return c.venue === 'home' ? BALANCE.conditions.homeHypeScale : c.venue === 'away' ? BALANCE.conditions.awayHypeScale : 1;
}
