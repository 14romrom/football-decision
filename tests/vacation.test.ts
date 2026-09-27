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
  it('контент: шість розворотів, у кожному 4–5 варіантів, свідок дає тяжкість, Спокій тільки зі стану 2', () => {
    expect(VACATION.map((s) => s.id)).toEqual(['trip', 'sc_pitch_no_date', 'sc_night_before', 'sc_pitch_again', 'sc_medical', 'return']);
    for (const s of VACATION) {
      expect(s.options.length, s.id).toBeGreaterThanOrEqual(4);
      expect(s.options.length, s.id).toBeLessThanOrEqual(5);
      for (const o of s.options) { expect(o.say.length).toBeGreaterThan(5); expect(o.reply.length).toBeGreaterThan(40); expect(o.effect.note.length).toBeGreaterThan(5); }
    }
    // M28: тяжкість і свідок — на листі «знову газон» (що ти сказав {oldsub.dat}), а не на самому огляді.
    const again = VACATION.find((s) => s.id === 'sc_pitch_again')!;
    for (const o of again.options) { expect(o.injury, o.id).toBeTruthy(); expect(o.witness, o.id).toBeTruthy(); }
    expect(new Set(again.options.map((o) => o.witness)).size).toBe(again.options.length);
    // Улики газону без дати відповідають «тоді чи зараз» і нічого не ламають: у них немає ні травми, ні свідка.
    const clues = VACATION.find((s) => s.id === 'sc_pitch_no_date')!;
    for (const o of clues.options) { expect(o.injury, o.id).toBeUndefined(); expect(o.witness, o.id).toBeUndefined(); }
    expect(new Set(clues.options.map((o) => o.voice)).size).toBe(clues.options.length);
    // Спокій молчить до стану 2 — і на газоні, і на огляді.
    for (const s of VACATION) for (const o of s.options) if (o.voice === 'composure') expect(o.arcMin, o.id).toBe(2);
    expect(VACATION.find((s) => s.id === 'sc_medical')!.options.some((o) => o.voice === 'composure')).toBe(true);
    // Від’їзд абстрактно: у листах відпустки немає назв чужих клубів.
    const text = JSON.stringify(fillNamesDeep(VACATION, ROSTER));
    for (const k of OPPONENT_KEYS.top) expect(text).not.toContain(OPPONENTS[k].name.nom);
    expect(text).not.toMatch(/%|ймовірн/i);
  });

  it('кінець першого сезону: дзвінок безумовний, недовіра — окремим рядком', () => {
    const won = full([3, 0], 8, 8, 1);
    expect(firstSeasonVerdict(won, 80).kind).toBe('transfer');
    expect(firstSeasonVerdict(won, 80).text).toMatch(/вже влітку|за протоколом/);
    const dull = full([0, 2], 5, 5.5);
    const v = firstSeasonVerdict(dull, 30);
    expect(v.kind).toBe('transfer');
    expect(v.text).toMatch(/за регламентом/);
    // Лава по ходу сезону прибрана (26.09): недовіра переїжджає в новий сезон хваткою тренера.
    expect(v.text).toMatch(/під наглядом/);
    expect(agentPending(defaultCareer(), won, v)).toBeNull();
    expect(vacationPending(defaultCareer(), 1, true)).toBe(true);
    expect(vacationPending(defaultCareer(), 2, true)).toBe(false);
    expect(vacationPending({ ...defaultCareer(), vacation: { trip: 'trip_base' } }, 1, true)).toBe(false);
  });

  it('фініш: форма за вибором (не травма — рішення 21.09), лог агента «зірвалося через медогляд», дублер пішов у клуб, що піднявся з нами', () => {
    const sn = full([3, 0], 7, 7, 1);
    const promo = promotion(sn)!;
    const heavy = finishVacation(defaultCareer(), VACATION, [{ spread: 'trip', option: 'trip_tibo' }, { spread: 'sc_pitch_no_date', option: 'clue_sure' }, { spread: 'sc_night_before', option: 'night_lie' }, { spread: 'sc_pitch_again', option: 'wit_silent' }, { spread: 'sc_medical', option: 'exam_prove' }, { spread: 'return', option: 'ret_joke' }], promo, 1);
    expect(heavy.career.injuredMatches).toBe(0);
    expect(heavy.career.nextMatch?.start?.stamina).toBe(-12);
    expect(heavy.career.carriedFlags?.filter((f) => f.flag === 'out_of_form').map((f) => f.after)).toEqual([0, 1]);
    expect(heavy.career.agentLog).toEqual([{ season: 1, choice: 'leave', reason: 'medical' }]);
    expect(heavy.career.subLeft).toBe(true);
    expect(heavy.career.subClub).toBe(promo.with[0]);
    expect(heavy.career.vacation).toEqual({ trip: 'trip_tibo', sc_pitch_no_date: 'clue_sure', sc_night_before: 'night_lie', sc_pitch_again: 'wit_silent', sc_medical: 'exam_prove', return: 'ret_joke' });
    // Свідок: промовчав на газоні — у другому сезоні {oldsub} нічого не знає.
    expect(heavy.career.larsson).toBe('none');
    expect(heavy.career.carriedFlags?.some((f) => f.flag === 'tibo_joke_told')).toBe(true);
    const start = consumeStartPenalty(heavy.career);
    expect(start.penalty.staminaPenalty).toBe(0);
    expect(start.penalty.flags.some((f) => f.flag === 'out_of_form')).toBe(true);
    expect(start.penalty.facts.outOfForm).toBe(true);
    expect(start.career.carriedFlags?.filter((f) => f.flag === 'out_of_form').length).toBe(1);   // другий матч ще не в формі
    const light = finishVacation(defaultCareer(), VACATION, [{ spread: 'sc_pitch_again', option: 'wit_truth' }], promo, 1);
    expect(light.career.nextMatch?.start?.stamina).toBe(-4);
    expect(light.career.carriedFlags?.filter((f) => f.flag === 'out_of_form').length).toBe(1);
    expect(light.career.larsson).toBe('knows');
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
