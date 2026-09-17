/** mulberry32: маленький сид-генератор. Нужен, чтобы матч воспроизводился по seed. */
export type Rng = {
  next(): number;              // [0,1)
  int(minInclusive: number, maxInclusive: number): number;
  /** Игровой бросок: 2d10, 2..20, колокол со средним 11. Замена d20 после плейтеста:
   *  серии 5-5-5-1 воспринимались как поломка, а скилл терялся на фоне плоского разброса. */
  roll(): number;
  /** Грани последнего roll(): экран броска показывает два кубика, а не сумму (Disco Elysium).
   *  Тесты подменяют roll() фиксированным числом — тогда пары нет, экран делит сумму сам. */
  lastDice?: [number, number];
  pick<T>(items: T[]): T;
  /** Взвешенный выбор; веса должны быть > 0. */
  weighted<T>(items: T[], weight: (item: T) => number): T;
  chance(p: number): boolean;
};

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const rng: Rng = {
    next,
    int,
    roll: () => {
      const a = int(1, 10);
      const b = int(1, 10);
      rng.lastDice = [a, b];
      return a + b;
    },
    pick: <T,>(items: T[]) => items[int(0, items.length - 1)],
    weighted: <T,>(items: T[], weight: (item: T) => number) => {
      const total = items.reduce((s, i) => s + weight(i), 0);
      let r = next() * total;
      for (const item of items) {
        r -= weight(item);
        if (r <= 0) return item;
      }
      return items[items.length - 1];
    },
    chance: (p: number) => next() < p,
  };
  return rng;
}
