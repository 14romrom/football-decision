// Слоты карьеры (telemetry/slots.ts, saves.ts): три независимых хранилища на устройстве,
// нулевой слот — старые ключи без миграции, очистка слота не трогает соседей.
import { describe, it, expect, beforeEach } from 'vitest';
import { activeSlot, setActiveSlot, slotKey, clearSlot, SLOT_BASES, SLOT_COUNT } from '../src/telemetry/slots';
import { readCareer, writeCareer } from '../src/telemetry/career-storage';
import { readSeason, writeSeason } from '../src/telemetry/season-storage';
import { recordResult, readHistory } from '../src/telemetry/history';
import { readAllSlots, readSlotSummary, resetSlot } from '../src/telemetry/saves';
import { defaultCareer } from '../src/engine/career';
import { createSeason } from '../src/engine/season';
import { OPPONENTS } from '../src/content';

// Тесты идут в node — localStorage подменяем Map-заглушкой с тем же интерфейсом.
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    keys: () => [...m.keys()],
  };
}

describe('слоты карьеры', () => {
  let store: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    store = fakeStorage();
    (globalThis as unknown as { localStorage: unknown }).localStorage = store;
  });

  it('нулевой слот пишет в старые ключи — сохранения тестеров не мигрируют', () => {
    expect(activeSlot()).toBe(0);
    writeCareer({ ...defaultCareer(), matchesPlayed: 3 });
    expect(store.keys()).toContain(SLOT_BASES.career);
    expect(slotKey(SLOT_BASES.career, 0)).toBe(SLOT_BASES.career);
    expect(slotKey(SLOT_BASES.career, 2)).toBe(SLOT_BASES.career + '.s2');
  });

  it('слоты не видят друг друга: карьера, сезон и история — по активному слоту', () => {
    writeCareer({ ...defaultCareer(), matchesPlayed: 5 });
    writeSeason(createSeason(1, Object.keys(OPPONENTS)));
    recordResult(2, 1, ['ep_a']);
    setActiveSlot(1);
    expect(activeSlot()).toBe(1);
    expect(readCareer().matchesPlayed).toBe(0);
    expect(readSeason()).toBeNull();
    expect(readHistory()).toEqual([]);
    writeCareer({ ...defaultCareer(), matchesPlayed: 1 });
    setActiveSlot(0);
    expect(readCareer().matchesPlayed).toBe(5);
    expect(readCareer(1).matchesPlayed).toBe(1);
  });

  it('сводка: пустой слот, слот с сезоном без матчей — тоже пустой, сыгранный — с туром и местом', () => {
    const all = readAllSlots();
    expect(all).toHaveLength(SLOT_COUNT);
    expect(all.every((s) => s.empty)).toBe(true);
    // App создаёт сезон при первом заходе — это ещё не карьера.
    writeSeason(createSeason(7, Object.keys(OPPONENTS)));
    expect(readSlotSummary(0).empty).toBe(true);
    expect(readSlotSummary(0).round).toBe(1);
    const sn = createSeason(7, Object.keys(OPPONENTS));
    sn.round = 4;
    writeSeason(sn);
    writeCareer({ ...defaultCareer(), matchesPlayed: 4 });
    recordResult(1, 0, ['ep_a']);
    const s = readSlotSummary(0);
    expect(s.empty).toBe(false);
    expect(s.round).toBe(5);
    expect(s.matches).toBe(4);
    expect(s.position).toBeGreaterThan(0);
    expect(s.lastAt).not.toBeNull();
  });

  it('очистка слота не трогает соседний', () => {
    writeCareer({ ...defaultCareer(), matchesPlayed: 2 });
    setActiveSlot(2);
    writeCareer({ ...defaultCareer(), matchesPlayed: 9 });
    resetSlot(0);
    expect(readCareer(0).matchesPlayed).toBe(0);
    expect(readCareer(2).matchesPlayed).toBe(9);
    clearSlot(2);
    expect(readCareer(2).matchesPlayed).toBe(0);
    expect(store.keys().some((k) => k.endsWith('.s2'))).toBe(false);
  });
});
