// Малюнки на полях зошита (WeekScreen, 19.09): синя паста, як діти малюють на обкладинці — м’яч, зірка,
// ворота, «10», бутса, смайл, блискавка, «ГОЛ!!», кубок, стрілка. Набір і нахил — по сиду тижня, щоб
// зошит «жив»; місця фіксовані вздовж полів, щоб не лягати на текст. Тремтіння — фільтр #pen (feTurbulence).

import type { ReactNode } from 'react';

const D: ReactNode[] = [
  <svg key="ball" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" /><path d="M13 5l5 4-2 6h-6l-2-6z" /><path d="M8 9L4 8M18 9l4-1M11 15l-3 6M15 15l3 6" /></svg>,
  <svg key="star" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2l3 7 7 .5-5.5 4.5 2 7-6.5-4-6.5 4 2-7L2 9.5 9 9z" /></svg>,
  <svg key="goal" width="34" height="22" viewBox="0 0 34 22"><path d="M2 20V3h30v17" /><path d="M6 3v17M10 3v17M14 3v17M18 3v17M22 3v17M26 3v17M2 8h30M2 13h30" /></svg>,
  <svg key="ten" width="28" height="30" viewBox="0 0 28 30"><text x="1" y="24" fontSize="26">10</text></svg>,
  <svg key="boot" width="36" height="22" viewBox="0 0 36 22"><path d="M2 14c4-6 8-8 14-6l4-4 6 2-2 6c4 2 8 4 10 8H4z" /><path d="M8 14l2 6M14 12l2 6" /></svg>,
  <svg key="smile" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9" /><circle cx="8" cy="9" r="1" /><circle cx="14" cy="9" r="1" /><path d="M7 14c2 3 6 3 8 0" /></svg>,
  <svg key="bolt" width="26" height="30" viewBox="0 0 26 30"><path d="M14 2l-6 14h6l-4 12 12-16h-7l5-10z" /></svg>,
  <svg key="gol" width="44" height="26" viewBox="0 0 44 26"><text x="0" y="20" fontSize="20">ГОЛ!!</text></svg>,
  <svg key="cup" width="30" height="30" viewBox="0 0 30 30"><path d="M6 4h18v6a9 9 0 0 1-18 0zM6 8H2v4a4 4 0 0 0 4 3M24 8h4v4a4 4 0 0 1-4 3M12 19l-1 6h8l-1-6M9 27h12" /></svg>,
  <svg key="arrow" width="28" height="14" viewBox="0 0 28 14"><path d="M2 7h20M17 2l6 5-6 5" /></svg>,
  <svg key="whistle" width="30" height="20" viewBox="0 0 30 20"><path d="M4 8h14l8-4v6l-8 2a8 8 0 1 1-14-4z" /><circle cx="11" cy="12" r="2" /></svg>,
  <svg key="cone" width="22" height="24" viewBox="0 0 22 24"><path d="M8 3h6l4 18H4zM7 9h8M6 15h10" /></svg>,
];

/** Слоти вздовж полів: [зліва?, top]. Ліве поле — між дірочками й червоною лінією; праворуч — лише
 *  один, біля заголовка: правого поля в зошиті немає, і малюнок лягав би на текст. */
const SLOTS: [boolean, number][] = [[true, 40], [true, 150], [true, 250], [true, 330], [true, 430], [true, 520], [true, 600], [true, 690], [true, 780], [false, 22]];

const hash = (seed: number, i: number) => { let h = (seed ^ (i * 2654435761)) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function Doodles({ seed }: { seed: number }) {
  const order = D.map((_, i) => i).sort((a, b) => hash(seed, a) - hash(seed, b));
  return (
    <>
      {SLOTS.map(([left, top], i) => {
        const d = D[order[i % order.length]];
        const rot = Math.round((hash(seed, 100 + i) - 0.5) * 24);
        return (
          <div key={i} className="doodle" aria-hidden="true" style={{ [left ? 'left' : 'right']: left ? 24 : 8, top, transform: `rotate(${rot}deg)` }}>
            {d}
          </div>
        );
      })}
    </>
  );
}
