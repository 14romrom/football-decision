// Розв’язка на поле (19.09, шаг 3 плана анимации): что поле разыгрывает после штампа вердикта.
// Считается из того, что уже есть в исходе — событий ленты (гол свій/чужий), apply (втрата,
// ключовий пас, дуель, фол, картки) и семьи сцены (удар без гола — сейв или мимо по ярусу).
// Контент ничего нового не знает. Само движение — ui/Pitch.tsx.

import type { Episode, EpisodeOption, Resolution, TimelineEvent } from './types';
import { pickOutcome } from './resolve';

export type FinaleKind = 'goal' | 'concede' | 'save' | 'miss' | 'pass' | 'loss' | 'foul' | 'red' | 'duel' | 'pulse';

const SHOT_FAMILIES = new Set(['edge_shot', 'one_on_one', 'finishing', 'penalty', 'free_kick']);

export function finaleFor(episode: Episode, option: EpisodeOption, res: Resolution, events: TimelineEvent[]): FinaleKind {
  if (events.some((e) => e.kind === 'goalThem')) return 'concede';
  if (events.some((e) => e.kind === 'goalUs')) return 'goal';
  const apply = pickOutcome(option, res).apply;
  if (apply?.addFlags?.includes('sent_off')) return 'red';
  if (apply?.foul || apply?.addFlags?.includes('booked')) return 'foul';
  if ((apply?.losses ?? 0) > 0 || apply?.counterAttack) return 'loss';
  if (apply?.keyPass || apply?.assist) return 'pass';
  if (apply?.duelWon) return 'duel';
  if (episode.family && SHOT_FAMILIES.has(episode.family)) return res.tier === 'badFail' ? 'miss' : 'save';
  return 'pulse';
}
