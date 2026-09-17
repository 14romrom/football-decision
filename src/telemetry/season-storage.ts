// Хранилище сезона (M5-лайт) — localStorage, отдельный ключ. Правила — в engine/season.ts.

import type { Season } from '../engine/season';

const KEY = 'football-decision.season.v1';

export function readSeason(): Season | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Season) : null;
  } catch {
    return null;
  }
}

export function writeSeason(season: Season) {
  try {
    localStorage.setItem(KEY, JSON.stringify(season));
  } catch { /* приватный режим — сезон проживёт вкладку */ }
}
