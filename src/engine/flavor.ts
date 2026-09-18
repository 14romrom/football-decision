// Ироничная реплика после исхода. Тексты исходов статичны и не знают, какой
// счёт и какая минута; этот слой знает — и именно он даёт ощущение, что игра
// реагирует на ситуацию, а не только на кубик. Правила — данные (flavor.json).

import { BALANCE } from './balance';
import type { MatchConditions } from './conditions';
import type { Rng } from './rng';
import type { MatchState, SituationWhen, Tier } from './types';

/** voice — кто говорит; без него голос выводится из условия (flavorVoice). */
export type FlavorRule = { when: SituationWhen; lines: string[]; voice?: string };

/** Сцена, о которой реплика: семья и фаза эпизода. */
export type Scene = { family?: string; phase?: string };

export function scoreState(state: MatchState): 'leading' | 'trailing' | 'level' {
  const diff = state.scoreUs - state.scoreThem;
  return diff > 0 ? 'leading' : diff < 0 ? 'trailing' : 'level';
}

/** Подходит ли условие к текущему моменту матча. Условия матча (venue/weather/strength)
 *  необязательны: реплики их не знают, варианты сетапа — знают. */
export function matchesSituation(
  w: SituationWhen, state: MatchState, conditions?: MatchConditions, tier?: Tier, scene?: Scene,
): boolean {
  if (w.tier && w.tier !== tier) return false;
  if (w.family && w.family !== scene?.family) return false;
  if (w.phase && w.phase !== scene?.phase) return false;
  if (w.score && w.score !== scoreState(state)) return false;
  if (w.minMinute !== undefined && state.minute < w.minMinute) return false;
  if (w.maxMinute !== undefined && state.minute > w.maxMinute) return false;
  if (w.tired !== undefined && w.tired !== state.stamina < BALANCE.tiredBelow) return false;
  if (w.booked !== undefined && w.booked !== state.flags.includes('booked')) return false;
  if (w.lowTrust !== undefined && w.lowTrust !== state.coachTrust < BALANCE.shift.lowTrustBelow) return false;
  if (w.momentumMin !== undefined && state.momentum < w.momentumMin) return false;
  if (w.momentumMax !== undefined && state.momentum > w.momentumMax) return false;
  if (w.flags && !w.flags.every((f) => state.flags.includes(f))) return false;
  if (w.venue && w.venue !== conditions?.venue) return false;
  if (w.weather && w.weather !== conditions?.weather) return false;
  if (w.strength && w.strength !== conditions?.strength) return false;
  return true;
}

/** Самое конкретное из подходящих правил побеждает: реплика про жёлтую важнее общей. */
export function mostSpecific<T extends { when: SituationWhen }>(
  rules: T[], state: MatchState, conditions?: MatchConditions, tier?: Tier, scene?: Scene,
): T[] {
  const fitting = rules.filter((r) => matchesSituation(r.when, state, conditions, tier, scene));
  if (fitting.length === 0) return [];
  const best = Math.max(...fitting.map((r) => Object.keys(r.when).length));
  return fitting.filter((r) => Object.keys(r.when).length === best);
}

export function pickFlavor(rules: FlavorRule[], state: MatchState, tier: Tier, rng: Rng, scene?: Scene): string | undefined {
  return pickFlavorLine(rules, state, tier, rng, scene)?.text;
}

/** Кто говорит реплику — по тому, на что она реагирует. Экран броска показывает её как
 *  вторую реплику после голоса атрибута (Disco Elysium): «КУРАЖ [+2] — Знову…». */
export function flavorVoice(when: SituationWhen): string {
  if (when.momentumMin !== undefined || when.momentumMax !== undefined) return 'КУРАЖ';
  if (when.tired) return 'ТІЛО';
  if (when.booked) return 'СУДДЯ';
  if (when.lowTrust) return 'ТРЕНЕР';
  if (when.score) return 'ТАБЛО';
  if (when.minMinute !== undefined) return 'ГОДИННИК';
  return 'ТРИБУНИ';
}

/** Семейная реплика знает сцену, общая — только счёт и минуту. Строгое «побеждает самое
 *  конкретное» давало 34% повторов за сезон: у семьи на исход три строки, а edge_shot
 *  выпадает дважды за матч. Поэтому пул — все подходящие правила с весом по конкретности
 *  (3^ключей: семейная втрое вероятнее общей), а уже виденные в этом матче строки
 *  выкидываются, пока есть свежие. */
export function pickFlavorLine(
  rules: FlavorRule[], state: MatchState, tier: Tier, rng: Rng, scene?: Scene, seen: Set<string> = new Set(),
): { text: string; voice: string } | undefined {
  const fitting = rules.filter((r) => matchesSituation(r.when, state, undefined, tier, scene));
  if (fitting.length === 0) return undefined;
  const pool: { text: string; voice: string; weight: number }[] = [];
  for (const r of fitting) {
    const weight = 3 ** Object.keys(r.when).length;
    const voice = r.voice ?? flavorVoice(r.when);
    for (const text of r.lines) pool.push({ text, voice, weight });
  }
  return pickFresh(pool, seen, rng);
}

/** Взвешенный выбор, где уже виденные строки уступают свежим: общий механизм реплик
 *  (flavor.json) и ленты между эпизодами (feed.json). Виденные берутся, только когда свежих
 *  не осталось, — тогда пул исчерпан и повтор честнее молчания. */
export function pickFresh<T extends { text: string; weight: number }>(pool: T[], seen: Set<string>, rng: Rng): T | undefined {
  if (pool.length === 0) return undefined;
  const fresh = pool.filter((l) => !seen.has(l.text));
  const candidates = fresh.length > 0 ? fresh : pool;
  const total = candidates.reduce((sum, l) => sum + l.weight, 0);
  let x = rng.next() * total;
  for (const l of candidates) {
    x -= l.weight;
    if (x <= 0) return l;
  }
  return candidates[candidates.length - 1];
}
