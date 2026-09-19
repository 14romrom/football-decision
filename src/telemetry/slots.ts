// Слоты карьеры (19.09, к титульному экрану). Три независимые карьеры на устройстве: у каждой
// свои карьера, сезон, история матчей, прочитанные посты и логи решений. Слот 0 пишет в те же
// ключи, что и раньше, — сохранения тестеров становятся первым слотом без миграции; слоты 1 и 2
// получают суффикс. Активный слот — отдельный ключ; хранилища читают его при каждом обращении,
// а смена слота перемонтирует App (key={slot}), чтобы refs перечитались.
//
// Только localStorage и никаких импортов из engine — иначе цикл с career-storage.

export const SLOT_COUNT = 3;
const ACTIVE_KEY = 'football-decision.slot';

/** Базовые ключи всех хранилищ одного слота — для очистки и сводки (saves.ts). */
export const SLOT_BASES = {
  career: 'football-decision.career.v1',
  season: 'football-decision.season.v1',
  history: 'football-decision.history.v1',
  posts: 'football-decision.posts.v1',
  decisions: 'fdp.decisions.v1',
} as const;

export function activeSlot(): number {
  try {
    const n = Number(localStorage.getItem(ACTIVE_KEY) ?? 0);
    return Number.isInteger(n) && n >= 0 && n < SLOT_COUNT ? n : 0;
  } catch {
    return 0;
  }
}

export function setActiveSlot(slot: number) {
  try { localStorage.setItem(ACTIVE_KEY, String(slot)); } catch { /* приватный режим */ }
}

/** Ключ хранилища для слота: нулевой — без суффикса (старые сохранения), остальные — `.sN`. */
export function slotKey(base: string, slot: number = activeSlot()): string {
  return slot === 0 ? base : `${base}.s${slot}`;
}

export function clearSlot(slot: number) {
  try {
    for (const base of Object.values(SLOT_BASES)) localStorage.removeItem(slotKey(base, slot));
  } catch { /* приватный режим */ }
}
