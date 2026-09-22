// Лист «Що було в травні» (M19.2): підсумок першого сезону за зайнятим місцем — п’ять розворотів,
// по одному на кожен спосіб закінчити сезон, і кожен стікер лишає слід.
import { describe, it, expect } from 'vitest';
import { mayKind, maySpread } from '../src/engine/may';
import { createSeason, recordPlayoff, recordRound, SEASON_ROUNDS, standings, US, withPlayoff, type OurResult } from '../src/engine/season';
import { OPPONENTS, ROSTER, OPPONENT_KEYS } from '../src/content';
import { makeRng } from '../src/engine/rng';
import { fillNamesDeep } from '../src/engine/names';

const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
const ours = (a: number, b: number): OurResult => ({ scoreUs: a, scoreThem: b, goals: 0, assists: 0, coachRating: 6, fanRating: 6, scorers: [] });
const season = (score: [number, number], number = 1) => {
  let s = createSeason(7, OPPONENT_KEYS.second, number);
  for (let i = 0; i < SEASON_ROUNDS; i++) s = recordRound(s, ours(score[0], score[1]), strengths, makeRng(s.seed + s.round * 7919));
  return withPlayoff(s);
};
const toPlayoff = () => {
  let s = createSeason(7, OPPONENT_KEYS.second, 1);
  for (let i = 0; i < SEASON_ROUNDS; i++) s = recordRound(s, ours(i % 2 ? 1 : 0, i % 2 ? 0 : 1), strengths, makeRng(s.seed + s.round * 7919));
  return withPlayoff(s);
};

describe('лист травня', () => {
  it('вид листа за підсумком: чемпіон, вихід, стикові виграні й програні, регламент', () => {
    const champ = season([5, 0]);
    expect(standings(champ).find((r) => r.club === US)!.position).toBe(1);
    expect(mayKind(champ)).toBe('champion');
    expect(mayKind(season([0, 5]))).toBe('missed');
    const po = toPlayoff();
    expect(mayKind(recordPlayoff(po, ours(2, 1)))).toBe('playoff_won');
    expect(mayKind(recordPlayoff(po, ours(0, 2)))).toBe('playoff_lost');
    expect(mayKind(season([5, 0], 2))).toBeNull();   // другий сезон закриває фінал, не травень
  });

  it('кожен розворот: три стікери, у кожного слід і розв’язка, без «!» і плейсхолдерів після підстановки', () => {
    for (const s of [season([5, 0]), season([0, 5]), recordPlayoff(toPlayoff(), ours(2, 1)), recordPlayoff(toPlayoff(), ours(0, 2))]) {
      const spread = fillNamesDeep([maySpread(s)!], ROSTER)[0];
      expect(spread.options.length).toBe(3);
      expect(spread.sheet.join(' ')).not.toMatch(/\{[a-z]|!/);
      for (const o of spread.options) {
        expect(Object.keys(o.effect).some((k) => k !== 'note')).toBe(true);   // слід обов’язковий
        expect(o.effect.note.length).toBeGreaterThan(5);
        expect(`${o.say} ${o.line} ${o.reply} ${o.effect.note}`).not.toMatch(/\{[a-z]|!/);
      }
      expect(new Set(spread.options.map((o) => o.voice)).size).toBe(3);   // три різні голоси
    }
  });
});
