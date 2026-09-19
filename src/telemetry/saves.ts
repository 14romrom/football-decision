// Сводка слотов для титульного экрана: «кто я и где» одной строкой — корешок удостоверения,
// а не «save 1». Читает хранилища напрямую по номеру слота, активный не трогает.

import type { VoiceKey } from '../engine/types';
import { ourRow, isSeasonOver, SEASON_ROUNDS } from '../engine/season';
import { dominantCareerVoice } from '../engine/week';
import { readCareer } from './career-storage';
import { readSeason } from './season-storage';
import { readHistory } from './history';
import { SLOT_COUNT, clearSlot } from './slots';

export type SlotSummary = {
  slot: number;
  /** Ни одного матча и нет сезона — слот пустой, на титуле это «Нова кар’єра». */
  empty: boolean;
  seasonNumber: number;
  /** Тур, который предстоит (1-based); после последнего — `rounds`, `over` = true. */
  round: number;
  rounds: number;
  over: boolean;
  matches: number;
  position: number | null;
  points: number;
  dominant: VoiceKey | null;
  /** Время последнего сыгранного матча — «давно не заходив» для реплики голоса на титуле. */
  lastAt: number | null;
};

export function readSlotSummary(slot: number): SlotSummary {
  const season = readSeason(slot);
  const career = readCareer(slot);
  const history = readHistory(slot);
  // App создаёт сезон при первом же заходе — сезон с нулём туров карьерой не считается.
  const empty = (!season || season.round === 0) && career.matchesPlayed === 0 && history.length === 0;
  const row = season ? ourRow(season) : null;
  return {
    slot,
    empty,
    seasonNumber: season?.number ?? 1,
    round: Math.min((season?.round ?? 0) + 1, SEASON_ROUNDS),
    rounds: SEASON_ROUNDS,
    over: season ? isSeasonOver(season) : false,
    matches: career.matchesPlayed,
    position: season && season.round > 0 ? row!.position : null,
    points: row?.points ?? 0,
    dominant: dominantCareerVoice(career),
    lastAt: history.length ? history[history.length - 1].at : null,
  };
}

export function readAllSlots(): SlotSummary[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => readSlotSummary(i));
}

/** «Стерти й почати»: чистит слот целиком — карьеру, сезон, историю, посты, логи решений. */
export function resetSlot(slot: number) {
  clearSlot(slot);
}
