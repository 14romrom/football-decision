// Хранилище карьеры (M2) — тот же localStorage, что и история матчей, отдельный ключ.
// Правила роста — в engine/career.ts, здесь только чтение/запись и приватный режим.

import { defaultCareer, type Career } from '../engine/career';
import { BALANCE } from '../engine/balance';
import { SLOT_BASES, slotKey } from './slots';

/** Ключ активного слота (slots.ts); `slot` явно — для сводки титула по всем слотам. */
const key = (slot?: number) => slotKey(SLOT_BASES.career, slot);

export function readCareer(slot?: number): Career {
  try {
    const raw = localStorage.getItem(key(slot));
    if (!raw) return defaultCareer();
    // Слияние с дефолтом — если в будущем добавится новое поле Career, старые
    // сохранения не сломают чтение, просто получат значение по умолчанию.
    const career = { ...defaultCareer(), ...(JSON.parse(raw) as Partial<Career>) };
    // Миграция 17.09: до unspentPoints очко уровня жило только в состоянии экрана и терялось при
    // перезагрузке. Каждый уровень выше первого даёт одно очко — недостающие возвращаем.
    const spent = Object.values(career.attrPoints).reduce((s, v) => s + (v ?? 0), 0);
    // При выключенных уровнях (BALANCE.growth.levels) очков не возвращаем — иначе старые сохранения
    // получили бы фантомные очки за уровни, которых больше нет.
    career.unspentPoints = BALANCE.growth.levels ? Math.max(career.unspentPoints ?? 0, career.level - 1 - spent) : (career.unspentPoints ?? 0);
    // Миграция 17.09: записи недели первой (откаченной) версии — {sceneId, optionId} без chosen/offered —
    // валили offerWeek (пустой экран на сайте). Такие записи выбрасываем: неделя того тура покажется снова.
    career.weekLog = (career.weekLog ?? []).filter((e) => Array.isArray(e.chosen) && Array.isArray(e.offered));
    return career;
  } catch {
    return defaultCareer();
  }
}

export function writeCareer(career: Career) {
  try {
    localStorage.setItem(key(), JSON.stringify(career));
  } catch { /* приватный режим — прогресс просто не переживёт вкладку */ }
}
