// Повернення (M51, 18.10): хто й що пише гравцеві, поки його немає. Лише вибір і час — без Capacitor,
// щоб це можна було перевірити тестом; ставить у чергу `ui/notify.ts`.
//
// Ритм — 1, 3 і 7 днів без входу, далі тиша (погоджено з користувачем у макеті M51). Текст — від стану
// кар'єри в момент, коли гру згорнули: після поразки пишуть інші люди й іншим тоном, ніж посеред
// незакритого тижня. Ніколи вночі: час зсувається у вікно 10:00–21:00 за годинником телефона.

import type { Career } from './career';
import { isSeasonOver, ourRow, type Season } from './season';
import { weekContext, weekPending } from './week';

export type AwayState = 'pre' | 'loss' | 'week' | 'win';
export type AwayLine = { who: string; line: string; else?: string };
export type AskSheet = { tab: string; text: string; say?: string; yes: string; no: string };
export type NotifyContent = {
  senders: Record<string, string>;
  states: Record<AwayState, AwayLine[]>;
  ask: { notify: AskSheet; review: AskSheet };
};

export const AWAY_DAYS = [1, 3, 7];
const DAY = 86_400_000;

/** Стан кар'єри для сповіщень. Поразка важить більше за тиждень: про неї й мовчання після неї
 *  пишуть інакше. Немає жодного матчу або кар'єру закінчено — не пишемо нічого. */
export function awayState(career: Career, season: Season | null): AwayState | null {
  if (!season || career.matchesPlayed === 0 || career.ended) return null;
  const last = season.rounds?.[season.rounds.length - 1];
  if (last && last.scoreUs < last.scoreThem) return 'loss';
  const ctx = weekContext(season, career, ourRow(season).position);
  if (ctx && !isSeasonOver(season) && weekPending(career, ctx)) return 'week';
  if (last && last.scoreUs > last.scoreThem) return 'win';
  return 'pre';
}

/** Момент показу: через `days` діб, але не вночі — до 10:00 зсуваємо на ранок, після 21:00 — на вечір того ж дня. */
export function awayTime(now: Date, days: number): Date {
  const d = new Date(now.getTime() + days * DAY);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 10) d.setHours(10, 15, 0, 0);
  else if (h >= 21) d.setHours(19, 30, 0, 0);
  return d;
}

/** Три сповіщення для стану. `next` — родовий відмінок наступного суперника; немає (сезон закінчено) —
 *  рядок бере свій запасний варіант `else`, щоб не лишити дірку в тексті. */
export function planAway(content: NotifyContent, state: AwayState, now: Date, next: string | null): { day: number; who: string; title: string; body: string; at: Date }[] {
  return content.states[state].slice(0, AWAY_DAYS.length).map((l, i) => ({
    day: AWAY_DAYS[i],
    who: l.who,
    title: content.senders[l.who] ?? l.who,
    body: !next && l.else ? l.else : l.line,
    at: awayTime(now, AWAY_DAYS[i]),
  }));
}

/** Прохання про відгук (M51): лише на доброму моменті й не раніше п'ятого матчу. «Пізніше» — знову не
 *  раніше ніж за 30 днів; відгук залишено — більше ніколи. Поразка, катастрофа, вилучення — ніколи. */
export const REVIEW = { minMatches: 5, laterDays: 30, minRating: 7.5 };
export function reviewDue(o: { matchesPlayed: number; won: boolean; rating: number; badMoment: boolean; may?: boolean; done: boolean; laterAt: number; now: number }): boolean {
  if (o.done || o.matchesPlayed < REVIEW.minMatches) return false;
  if (o.laterAt && o.now - o.laterAt < REVIEW.laterDays * DAY) return false;
  if (o.may) return true;
  return o.won && !o.badMoment && o.rating >= REVIEW.minRating;
}
