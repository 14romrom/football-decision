// Рядок міста в зошиті (21.09, після звірки з STORY.md: глава «Місто» доставлялась лише необов’язковими справами
// walk_base_1..3 — гравець, що три тижні обирав зал, доїжджав до відпустки, не побачивши ні трамвая, ні кави).
// Тепер щотижня під шапкою зошита — одне речення оповідача за станом арки: водій → кава → кіоск → «у нас».
// Правило M13: про місто — предметно. Взимку замість нього — чутка від агента (App). Контент — content/city.json.

import cityJson from '../content/city.json';

const CITY = cityJson as Record<string, string[]>;

/** Рядок за станом арки; черга — від сезону й туру, щоб за сезон не повторювався і після перезавантаження не мінявся. */
export function cityLine(arc: number, seasonNumber: number, round: number): string {
  const pool = CITY[String(Math.max(1, Math.min(4, arc)))] ?? [];
  if (!pool.length) return '';
  return pool[(seasonNumber * 7 + round) % pool.length];
}
