// Знімок слота (M45/M34): п'ять ключів сховища — кар'єра, сезон, історія матчів, прочитані пости,
// лог рішень — складені під одним ім'ям, щоб потім повернути слот рівно в той стан.
//
// Два користувачі, різні за змістом:
//   `prematch` — службовий. Матч живе тільки в пам'яті (сесія в рефах App), тому вихід на головну
//     або перезавантаження означають, що матчу не було. Без знімка кар'єра встигає «з'їсти» наслідки
//     минулого туру (consumeStartPenalty у start): мандраж, флаги, «не в формі» зникли б, а матч
//     довелося б грати заново — уже чистим. Знімок робиться перед стартом і скидається, коли матч
//     записано в сезон.
//   `save` — контрольна точка гравця: зберігається руками з меню і автоматично на кінці сезону й
//     перед фіналом, щоб відпустку й фінал можна було пройти іншою гілкою, не стираючи слот.
//
// Знімок живе в межах свого слота (slots.ts): у кожної кар'єри свої контрольні точки.

import { SLOT_BASES, slotKey } from './slots';

export type ShotName = 'prematch' | 'save';
export type Shot = { at: number; label: string; data: Record<string, string | null> };

const BASES = Object.values(SLOT_BASES);
const shotKey = (name: ShotName) => slotKey(`football-decision.shot.${name}.v1`);

/** Зняти стан слота. `label` — людська підпис для меню («Травень, після 10-го туру»). */
export function takeShot(name: ShotName, label: string): void {
  try {
    const data: Record<string, string | null> = {};
    for (const base of BASES) data[base] = localStorage.getItem(slotKey(base));
    localStorage.setItem(shotKey(name), JSON.stringify({ at: Date.now(), label, data } satisfies Shot));
  } catch { /* приватний режим — просто не буде точки повернення */ }
}

export function readShot(name: ShotName): Shot | null {
  try {
    const raw = localStorage.getItem(shotKey(name));
    if (!raw) return null;
    const shot = JSON.parse(raw) as Shot;
    return shot && typeof shot === 'object' && shot.data ? shot : null;
  } catch {
    return null;
  }
}

/** Повернути слот у знятий стан. Знімок після цього не потрібен — і зникає, щоб меню не пропонувало
 *  повернутися вдруге туди, де ти вже стоїш. Повертає true, якщо було що повертати. */
export function restoreShot(name: ShotName): boolean {
  const shot = readShot(name);
  if (!shot) return false;
  try {
    for (const base of BASES) {
      const value = shot.data[base];
      if (value === null || value === undefined) localStorage.removeItem(slotKey(base));
      else localStorage.setItem(slotKey(base), value);
    }
    localStorage.removeItem(shotKey(name));
    return true;
  } catch {
    return false;
  }
}

export function dropShot(name: ShotName): void {
  try { localStorage.removeItem(shotKey(name)); } catch { /* нічого */ }
}
