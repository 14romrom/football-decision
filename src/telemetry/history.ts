// История матчей этого устройства — из неё считается тонус на брифинге.
// Локально и только для прототипа: карьеры пока нет, есть «сколько ты уже сыграл».

import type { MatchResult } from '../engine/conditions';
import type { EpisodeMemory } from '../engine/types';

const KEY = 'football-decision.history.v1';

export type HistoryEntry = { result: MatchResult; scoreUs: number; scoreThem: number; at: number; episodes?: string[] };

export function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/** Память эпизодов на горизонте сезона: id → сколько матчей назад его играли
 *  (1 — прошлый матч). Повторно сыгранный считается по самому свежему разу. */
export function episodeMemory(horizon: number): EpisodeMemory {
  const memory: EpisodeMemory = {};
  const recent = readHistory().slice(-horizon);
  recent.forEach((h, i) => {
    const age = recent.length - i;
    for (const id of h.episodes ?? []) memory[id] = Math.min(memory[id] ?? age, age);
  });
  return memory;
}

export function recordResult(scoreUs: number, scoreThem: number, episodes: string[]) {
  const result: MatchResult = scoreUs > scoreThem ? 'W' : scoreUs < scoreThem ? 'L' : 'D';
  try {
    localStorage.setItem(KEY, JSON.stringify([...readHistory(), { result, scoreUs, scoreThem, at: Date.now(), episodes }]));
  } catch { /* приватный режим — тонус просто останется нейтральным */ }
}
