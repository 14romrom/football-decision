// Ироничная реплика после исхода. Тексты исходов статичны и не знают, какой
// счёт и какая минута; этот слой знает — и именно он даёт ощущение, что игра
// реагирует на ситуацию, а не только на кубик. Правила — данные (flavor.json).

import { BALANCE } from './balance';
import type { Rng } from './rng';
import type { MatchState, Tier } from './types';

export type FlavorRule = {
  when: {
    tier?: Tier;
    score?: 'leading' | 'trailing' | 'level';
    minMinute?: number;
    tired?: boolean;
    booked?: boolean;
    lowTrust?: boolean;
    momentumMin?: number;
    momentumMax?: number;
  };
  lines: string[];
};

function matches(rule: FlavorRule, state: MatchState, tier: Tier): boolean {
  const w = rule.when;
  if (w.tier && w.tier !== tier) return false;
  if (w.score) {
    const diff = state.scoreUs - state.scoreThem;
    const score = diff > 0 ? 'leading' : diff < 0 ? 'trailing' : 'level';
    if (w.score !== score) return false;
  }
  if (w.minMinute !== undefined && state.minute < w.minMinute) return false;
  if (w.tired !== undefined && w.tired !== state.stamina < BALANCE.tiredBelow) return false;
  if (w.booked !== undefined && w.booked !== state.flags.includes('booked')) return false;
  if (w.lowTrust !== undefined && w.lowTrust !== state.coachTrust < BALANCE.shift.lowTrustBelow) return false;
  if (w.momentumMin !== undefined && state.momentum < w.momentumMin) return false;
  if (w.momentumMax !== undefined && state.momentum > w.momentumMax) return false;
  return true;
}

/** Самое конкретное из подходящих правил побеждает: реплика про жёлтую важнее общей. */
export function pickFlavor(rules: FlavorRule[], state: MatchState, tier: Tier, rng: Rng): string | undefined {
  const fitting = rules.filter((r) => matches(r, state, tier));
  if (fitting.length === 0) return undefined;
  const best = Math.max(...fitting.map((r) => Object.keys(r.when).length));
  const top = fitting.filter((r) => Object.keys(r.when).length === best);
  return rng.pick(rng.pick(top).lines);
}
