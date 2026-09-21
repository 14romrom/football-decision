// Сцена агента (M12): після вердикту «трансфер» — розвилка; «так» зривається за обставинами сезону,
// без покарання; наслідки — у перший матч нового сезону; вибір записано в кар’єру.
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { defaultCareer } from '../src/engine/career';
import { createSeason, recordRound, seasonVerdict, type Season } from '../src/engine/season';
import { agentPending, collapseReason, resolveAgent } from '../src/engine/agent';
import { AGENT, OPPONENTS, ROSTER, OPPONENT_KEYS } from '../src/content';
import { fillNamesDeep } from '../src/engine/names';

const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
/** Сезон-зірка: голи в кожному турі, високі оцінки — вердикт «трансфер» за протоколом. */
function starSeason(): Season {
  let sn = createSeason(3, OPPONENT_KEYS.second);
  while (sn.fixtures.some((f) => f.round === sn.round)) {
    sn = recordRound(sn, { scoreUs: 3, scoreThem: 0, goals: 1, assists: 1, coachRating: 8, fanRating: 8.5, scorers: [] }, strengths, makeRng(sn.round));
  }
  return sn;
}

describe('контент агента', () => {
  it('три відповіді з наслідком, два голоси, три обставини; плейсхолдери розв’язуються; без «!»', () => {
    expect(AGENT.options.map((o) => o.id)).toEqual(['leave', 'stay', 'wait']);
    for (const o of AGENT.options) { expect(o.text.length).toBeGreaterThan(40); expect(o.effect.note.length).toBeGreaterThan(10); expect(Object.keys(o.effect).length).toBeGreaterThan(1); }
    expect(AGENT.options.find((o) => o.id === 'leave')!.after).toBeTruthy();
    expect(AGENT.voices.map((v) => v.who)).toEqual(['ego', 'team']);
    expect(Object.keys(AGENT.collapse).sort()).toEqual(['debts', 'medical', 'scout']);
    expect(JSON.stringify(AGENT)).not.toMatch(/!/);
    expect(JSON.stringify(fillNamesDeep(AGENT, ROSTER))).not.toMatch(/\{[a-z.]+\}/);
  });
});

describe('сцена агента', () => {
  it('чекає тільки після «трансферу» і тільки раз на сезон', () => {
    const sn = starSeason();
    const verdict = seasonVerdict(sn, 70);
    expect(verdict.kind).toBe('transfer');
    expect(agentPending(defaultCareer(), sn, verdict)).toBe('winter');
    expect(agentPending(defaultCareer(), sn, { kind: 'extend', title: '', text: '' })).toBeNull();
    const { career } = resolveAgent(defaultCareer(), sn, AGENT, 'stay');
    expect(agentPending(career, sn, verdict)).toBeNull();
    expect(career.agentLog).toEqual([{ season: sn.number, choice: 'stay' }]);
  });

  it('«так» зривається за обставинами: травма → медогляд, лідер → борги, інакше → скаут; Реєс лишається', () => {
    const sn = starSeason();
    expect(collapseReason({ ...defaultCareer(), injuriesSeason: 1 }, sn)).toBe('medical');
    expect(collapseReason(defaultCareer(), sn)).toBe('debts');   // сезон-зірка — лідер
    // Не лідер: одна перемога, решта поразки.
    let low = createSeason(4, OPPONENT_KEYS.second);
    while (low.fixtures.some((f) => f.round === low.round)) {
      low = recordRound(low, { scoreUs: 1, scoreThem: 2, goals: 1, assists: 0, coachRating: 6, fanRating: 8, scorers: [] }, strengths, makeRng(low.round));
    }
    expect(collapseReason(defaultCareer(), low)).toBe('scout');
    const { text, reason, career, loot } = resolveAgent(defaultCareer(), sn, AGENT, 'leave');
    expect(reason).toBe('debts');
    expect(text).toContain(AGENT.collapse.debts);
    expect(text.endsWith(AGENT.options[0].after!)).toBe(true);
    expect(career.agentLog?.[0]).toEqual({ season: sn.number, choice: 'leave', reason: 'debts' });
    // Без покарання: довіра й трибуни не падають, Его гучніше на перший матч.
    expect(career.coachTrust).toBe(defaultCareer().coachTrust);
    expect(career.nextMatch?.start?.fanHype ?? 0).toBeGreaterThanOrEqual(0);
    expect(career.nextMatch?.voiceStreak?.who).toBe('ego');
    expect(loot.some((l) => l.kind === 'voice' && l.who === 'ego')).toBe(true);
  });

  it('«ні» — місто й тренер; «зачекати» — Спокій на старт', () => {
    const sn = starSeason();
    const stay = resolveAgent(defaultCareer(), sn, AGENT, 'stay').career;
    expect(stay.coachTrust).toBeGreaterThan(defaultCareer().coachTrust);
    expect(stay.nextMatch?.start?.fanHype).toBeGreaterThan(0);
    expect(stay.nextMatch?.voiceStreak?.who).toBe('team');
    const wait = resolveAgent(defaultCareer(), sn, AGENT, 'wait').career;
    expect(wait.nextMatch?.start?.composure).toBeGreaterThan(0);
    expect(wait.coachTrust).toBe(defaultCareer().coachTrust);
  });
});
