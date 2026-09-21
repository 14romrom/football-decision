// Останній дзвінок (M16, 21.09): після другого сезону — фінал без варіанта лишитися; рими до прологу.
import { describe, it, expect } from 'vitest';
import { createSeason, recordRound, secondSeasonVerdict, SEASON_ROUNDS, type OurResult } from '../src/engine/season';
import { endingPending, finishEnding, partnerBonded, prologueVoice } from '../src/engine/ending';
import { defaultCareer } from '../src/engine/career';
import { ENDING, OPPONENTS, OPPONENT_KEYS, PROLOGUE, ROSTER } from '../src/content';
import { fillNamesDeep } from '../src/engine/names';
import { makeRng } from '../src/engine/rng';
import { BALANCE } from '../src/engine/balance';

const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
function full(score: [number, number], number = 2) {
  let s = createSeason(7, OPPONENT_KEYS.top, number);
  for (let i = 0; i < SEASON_ROUNDS; i++) {
    const r: OurResult = { scoreUs: score[0], scoreThem: score[1], goals: 1, assists: 0, coachRating: 7, fanRating: 7, scorers: [] };
    s = recordRound(s, r, strengths, makeRng(s.seed + s.round * 7919));
  }
  return s;
}

describe('останній дзвінок', () => {
  it('контент: три розвороти по 4 стікери, епілог; лист дзвінка має варіант на кожен голос прологу; без назв клубів', () => {
    expect(ENDING.spreads.map((s) => s.id)).toEqual(['call', 'interview', 'tram']);
    for (const s of ENDING.spreads) { expect(s.options.length).toBe(4); for (const o of s.options) expect(o.reply.length).toBeGreaterThan(40); }
    const call = ENDING.spreads[0];
    for (const v of ['ego', 'body', 'vision', 'instinct']) expect(call.sheetBy?.[v as 'ego'], v).toBeTruthy();
    expect(call.options.find((o) => o.id === 'call_team')!.replyCold).toBeTruthy();
    const text = JSON.stringify(fillNamesDeep(ENDING, ROSTER));
    for (const k of Object.keys(OPPONENTS)) expect(text).not.toContain(OPPONENTS[k].name.nom);
    expect(text).not.toMatch(/\{[a-z]|%/);
    expect(ENDING.epilogue.sign).toContain('Далі буде');
  });

  it('вердикт другого сезону — «Дзвонить скаут» завжди; фінал чекає після другого сезону', () => {
    const s = full([2, 1]);
    const v = secondSeasonVerdict(s, 70);
    expect(v.kind).toBe('transfer');
    expect(v.title).toBe('Дзвонить скаут');
    expect(v.text).toContain('Лізі чемпіонів');
    expect(secondSeasonVerdict(full([0, 3]), 20).kind).toBe('transfer');
    expect(endingPending(defaultCareer(), 2, true)).toBe(true);
    expect(endingPending(defaultCareer(), 1, true)).toBe(false);
    expect(endingPending({ ...defaultCareer(), ended: { season: 2 } }, 2, true)).toBe(false);
  });

  it('фініш: кар’єру завершено, вибори записано; голос прологу — рима; партнер холодний без дуету', () => {
    const c = { ...defaultCareer(), prologue: { scout: 'scout_ego', call: 'call_team', base: 'base_vision' } };
    expect(prologueVoice(c, PROLOGUE)).toBe('ego');
    expect(prologueVoice(defaultCareer(), PROLOGUE)).toBeUndefined();
    expect(partnerBonded(defaultCareer())).toBe(false);
    expect(partnerBonded({ ...defaultCareer(), partnerBond: BALANCE.people.partnerBonded })).toBe(true);
    const { career } = finishEnding(c, ENDING.spreads, [{ spread: 'call', option: 'call_body' }, { spread: 'interview', option: 'int_team' }, { spread: 'tram', option: 'tram_vision' }], 2);
    expect(career.ended).toEqual({ season: 2 });
    expect(career.ending).toEqual({ call: 'call_body', interview: 'int_team', tram: 'tram_vision' });
    expect(career.agentLog?.at(-1)).toEqual({ season: 2, choice: 'leave' });
    expect(career.carriedFlags?.some((f) => f.flag === 'tibo_joke_told')).toBe(true);
  });
});
