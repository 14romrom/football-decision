// Хранилище сезона (M5-лайт) — localStorage, отдельный ключ. Правила — в engine/season.ts.

import type { Season } from '../engine/season';
import { SLOT_BASES, slotKey } from './slots';

const key = (slot?: number) => slotKey(SLOT_BASES.season, slot);

export function readSeason(slot?: number): Season | null {
  try {
    const raw = localStorage.getItem(key(slot));
    return raw ? (JSON.parse(raw) as Season) : null;
  } catch {
    return null;
  }
}

export function writeSeason(season: Season) {
  try {
    localStorage.setItem(key(), JSON.stringify(season));
  } catch { /* приватный режим — сезон проживёт вкладку */ }
}
