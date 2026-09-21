// Відпустка (M15, 21.09): дзвінок у травні безумовний, зрив — травма перед медоглядом у відпустці, дублер іде.
import { describe, it, expect } from 'vitest';
import { createSeason, firstSeasonVerdict, promotion, recordRound, SEASON_ROUNDS, type OurResult } from '../src/engine/season';
import { finishVacation, vacationPending } from '../src/engine/vacation';
import { agentPending } from '../src/engine/agent';
import { defaultCareer, consumeStartPenalty } from '../src/engine/career';
import { OPPONENTS, OPPONENT_KEYS, ROSTER, VACATION, syncRoster } from '../src/content';
import { fillNamesDeep } from '../src/engine/names';
import { makeRng } from '../src/engine/rng';

const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
function full(score: [number, number], coach = 6, fan = 6, goals = 0) {
  let s = createSeason(7, OPPONENT_KEYS.second);
  for (let i = 0; i < SEASON_ROUNDS; i++) {
    const r: OurResult = { scoreUs: score[0], scoreThem: score[1], goals, assists: 0, coachRating: coach, fanRating: fan, scorers: [] };
    s = recordRound(s, r, strengths, makeRng(s.seed + s.round * 7919));
  }
  return s;
}

describe('відпустка', () => {
  it('контент: три розвороти, у кожному 4 стікери, у медогляді — травма в кожному, Спокій тільки зі стану 2', () => {
    expect(VACATION.map((s) => s.id)).toEqual(['trip', 'medical', 'return']);
    for (const s of VACATION) {
      expect(s.options.length).toBe(4);
      for (const o of s.options) { expect(o.say.length).toBeGreaterThan(5); expect(o.reply.length).toBeGreaterThan(40); expect(o.effect.note.length).toBeGreaterThan(5); }
    }
    const med = VACATION.find((s) => s.id === 'medical')!;
    for (const o of med.options) expect(o.injury, o.id).toBeTruthy();
    expect(med.options.find((o) => o.voice === 'composure')!.arcMin).toBe(2);
    // Від’їзд абстрактно: у листах відпустки немає назв чужих клубів.
    const text = JSON.stringify(fillNamesDeep(VACATION, ROSTER));
    for (const k of OPPONENT_KEYS.top) expect(text).not.toContain(OPPONENTS[k].name.nom);
    expect(text).not.toMatch(/%|ймовірн/i);
  });

  it('кінець першого сезону: дзвінок безумовний, лава — окремим рядком', () => {
    const won = full([3, 0], 8, 8, 1);
    expect(firstSeasonVerdict(won, 80).kind).toBe('transfer');
    expect(firstSeasonVerdict(won, 80).text).toMatch(/вже влітку|за протоколом/);
    const dull = full([0, 2], 5, 5.5);
    const v = firstSeasonVerdict(dull, 30);
    expect(v.kind).toBe('transfer');
    expect(v.text).toMatch(/за регламентом/);
    expect(v.text).toMatch(/з лави/);
    expect(agentPending(defaultCareer(), won, v)).toBeNull();
    expect(vacationPending(defaultCareer(), 1, true)).toBe(true);
    expect(vacationPending(defaultCareer(), 2, true)).toBe(false);
    expect(vacationPending({ ...defaultCareer(), vacation: { trip: 'trip_base' } }, 1, true)).toBe(false);
  });

  it('фініш: форма за вибором (не травма — рішення 21.09), лог агента «зірвалося через медогляд», дублер пішов у клуб, що піднявся з нами', () => {
    const sn = full([3, 0], 7, 7, 1);
    const promo = promotion(sn)!;
    const heavy = finishVacation(defaultCareer(), VACATION, [{ spread: 'trip', option: 'trip_tibo' }, { spread: 'medical', option: 'med_show' }, { spread: 'return', option: 'ret_joke' }], promo, 1);
    expect(heavy.career.injuredMatches).toBe(0);
    expect(heavy.career.nextMatch?.start?.stamina).toBe(-12);
    expect(heavy.career.carriedFlags?.filter((f) => f.flag === 'out_of_form').map((f) => f.after)).toEqual([0, 1]);
    expect(heavy.career.agentLog).toEqual([{ season: 1, choice: 'leave', reason: 'medical' }]);
    expect(heavy.career.subLeft).toBe(true);
    expect(heavy.career.subClub).toBe(promo.with[0]);
    expect(heavy.career.vacation).toEqual({ trip: 'trip_tibo', medical: 'med_show', return: 'ret_joke' });
    expect(heavy.career.carriedFlags?.some((f) => f.flag === 'tibo_joke_told')).toBe(true);
    const start = consumeStartPenalty(heavy.career);
    expect(start.penalty.staminaPenalty).toBe(0);
    expect(start.penalty.flags.some((f) => f.flag === 'out_of_form')).toBe(true);
    expect(start.penalty.facts.outOfForm).toBe(true);
    expect(start.career.carriedFlags?.filter((f) => f.flag === 'out_of_form').length).toBe(1);   // другий матч ще не в формі
    const light = finishVacation(defaultCareer(), VACATION, [{ spread: 'medical', option: 'med_physio' }], promo, 1);
    expect(light.career.nextMatch?.start?.stamina).toBe(-4);
    expect(light.career.carriedFlags?.filter((f) => f.flag === 'out_of_form').length).toBe(1);
    // Другий сезон після відпустки — літній дзвінок, фінальний.
    const sn2 = { ...sn, number: 2 };
    expect(agentPending(heavy.career, sn2, { kind: 'transfer', title: '', text: '' })).toBe('summer');
  });

  it('syncRoster: дублер підміняється на місці і повертається', () => {
    const was = ROSTER.us.players.sub.nom;
    syncRoster(true);
    expect(ROSTER.us.players.sub.nom).not.toBe(was);
    expect(ROSTER.us.players.sub.gen.length).toBeGreaterThan(3);
    syncRoster(false);
    expect(ROSTER.us.players.sub.nom).toBe(was);
  });
});
