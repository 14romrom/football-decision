// История матчей этого устройства — из неё считается тонус на брифинге.
// Локально и только для прототипа: карьеры пока нет, есть «сколько ты уже сыграл».

import type { MatchResult } from '../engine/conditions';
import type { EpisodeMemory } from '../engine/types';
import { SLOT_BASES, slotKey } from './slots';

const key = (slot?: number) => slotKey(SLOT_BASES.history, slot);

export type HistoryEntry = { result: MatchResult; scoreUs: number; scoreThem: number; at: number; episodes?: string[]; flavor?: string[]; feed?: string[] };

export function readHistory(slot?: number): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(key(slot));
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

/** Реплики второго голоса, прочитанные в последних матчах, — чтобы следующий матч начинал
 *  со свежих (flavor.ts берёт виденные только когда свежих не осталось). */
export function recentFlavor(horizon: number): string[] {
  return readHistory().slice(-horizon).flatMap((h) => h.flavor ?? []);
}

/** Строки ленты последних матчей — тот же принцип, что у реплик (feed.ts). */
export function recentFeed(horizon: number): string[] {
  return readHistory().slice(-horizon).flatMap((h) => h.feed ?? []);
}

export function recordResult(scoreUs: number, scoreThem: number, episodes: string[], flavor: string[] = [], feed: string[] = []) {
  const result: MatchResult = scoreUs > scoreThem ? 'W' : scoreUs < scoreThem ? 'L' : 'D';
  try {
    localStorage.setItem(key(), JSON.stringify([...readHistory(), { result, scoreUs, scoreThem, at: Date.now(), episodes, flavor, feed }]));
  } catch { /* приватный режим — тонус просто останется нейтральным */ }
}

// Прочитанные посты стрічки (engine/posts.ts) — отдельный ключ: стрічка собирается после того,
// как матч уже записан, и живёт своим горизонтом.
const postsKey = () => slotKey(SLOT_BASES.posts);
const POSTS_KEEP = 400;

export function recentPosts(): string[] {
  try {
    const raw = localStorage.getItem(postsKey());
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function recordPosts(texts: string[]) {
  try {
    localStorage.setItem(postsKey(), JSON.stringify([...recentPosts(), ...texts].slice(-POSTS_KEEP)));
  } catch { /* приватный режим */ }
}
