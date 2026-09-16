// История матчей этого устройства — из неё считается тонус на брифинге.
// Локально и только для прототипа: карьеры пока нет, есть «сколько ты уже сыграл».

import type { MatchResult } from '../engine/conditions';

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

/** Эпизоды последних матчей — чтобы планировщик не показывал их снова. */
export function recentEpisodes(matches: number): string[] {
  return readHistory().slice(-matches).flatMap((h) => h.episodes ?? []);
}

export function recordResult(scoreUs: number, scoreThem: number, episodes: string[]) {
  const result: MatchResult = scoreUs > scoreThem ? 'W' : scoreUs < scoreThem ? 'L' : 'D';
  try {
    localStorage.setItem(KEY, JSON.stringify([...readHistory(), { result, scoreUs, scoreThem, at: Date.now(), episodes }]));
  } catch { /* приватный режим — тонус просто останется нейтральным */ }
}
