// Хранилище карьеры (M2) — тот же localStorage, что и история матчей, отдельный ключ.
// Правила роста — в engine/career.ts, здесь только чтение/запись и приватный режим.

import { defaultCareer, type Career } from '../engine/career';

const KEY = 'football-decision.career.v1';

export function readCareer(): Career {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultCareer();
    // Слияние с дефолтом — если в будущем добавится новое поле Career, старые
    // сохранения не сломают чтение, просто получат значение по умолчанию.
    return { ...defaultCareer(), ...(JSON.parse(raw) as Partial<Career>) };
  } catch {
    return defaultCareer();
  }
}

export function writeCareer(career: Career) {
  try {
    localStorage.setItem(KEY, JSON.stringify(career));
  } catch { /* приватный режим — прогресс просто не переживёт вкладку */ }
}
