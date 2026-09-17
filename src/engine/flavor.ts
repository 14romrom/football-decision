// Ироничная реплика после исхода. Тексты исходов статичны и не знают, какой
// счёт и какая минута; этот слой знает — и именно он даёт ощущение, что игра
// реагирует на ситуацию, а не только на кубик. Правила — данные (flavor.json).

import { BALANCE } from './balance';
import type { MatchConditions } from './conditions';
import type { Rng } from './rng';
import type { MatchState, SituationWhen, Tier } from './types';

export type FlavorRule = { when: SituationWhen; lines: string[] };

export function scoreState(state: MatchState): 'leading' | 'trailing' | 'level' {
  const diff = state.scoreUs - state.scoreThem;
  return diff > 0 ? 'leading' : diff < 0 ? 'trailing' : 'level';
}

/** Подходит ли условие к текущему моменту матча. Условия матча (venue/weather/strength)
 *  необязательны: реплики их не знают, варианты сетапа — знают. */
export function matchesSituation(
  w: SituationWhen, state: MatchState, conditions?: MatchConditions, tier?: Tier,
): boolean {
  if (w.tier && w.tier !== tier) return false;
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
  rules: T[], state: MatchState, conditions?: MatchConditions, tier?: Tier,
): T[] {
  const fitting = rules.filter((r) => matchesSituation(r.when, state, conditions, tier));
  if (fitting.length === 0) return [];
  const best = Math.max(...fitting.map((r) => Object.keys(r.when).length));
  return fitting.filter((r) => Object.keys(r.when).length === best);
}

export function pickFlavor(rules: FlavorRule[], state: MatchState, tier: Tier, rng: Rng): string | undefined {
  return pickFlavorLine(rules, state, tier, rng)?.text;
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

export function pickFlavorLine(rules: FlavorRule[], state: MatchState, tier: Tier, rng: Rng): { text: string; voice: string } | undefined {
  const top = mostSpecific(rules, state, undefined, tier);
  if (top.length === 0) return undefined;
  const rule = rng.pick(top);
  return { text: rng.pick(rule.lines), voice: flavorVoice(rule.when) };
}
