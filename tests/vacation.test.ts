// Відпустка (M15, 21.09): дзвінок у травні безумовний, зрив — травма перед медоглядом у відпустці, дублер іде.
import { describe, it, expect } from 'vitest';
import { createSeason, firstSeasonVerdict, promotion, recordRound, SEASON_ROUNDS, type OurResult } from '../src/engine/season';
import { finishVacation, vacationPending } from '../src/engine/vacation';
import { agentPending } from '../src/engine/agent';
import { defaultCareer, consumeStartPenalty, nightKnowledge, type Career } from '../src/engine/career';
import { EPISODES_RAW, OPPONENTS, OPPONENT_KEYS, ROSTER, VACATION, WEEK_SCENES, syncRoster } from '../src/content';
import { ANCHOR_SCENES } from '../src/engine/week';
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
  it('контент: порядок лінійний, у кожному розвороті 4–5 варіантів, свідок дає тяжкість, Спокій тільки зі стану 2', () => {
    // M35 (03.10): ніч іде перед газоном, а не «шість годин тому» після нього — плейтест читав скачок
    // у часі як три події поспіль (травмувався, поліз через паркан, травмувався ще раз).
    expect(VACATION.map((s) => s.id)).toEqual(['trip', 'sc_night_before', 'sc_pitch_no_date', 'sc_pitch_again', 'sc_medical', 'sc_window', 'return']);
    for (const s of VACATION) {
      if (s.id === 'sc_window') continue;   // лист-розв’язка нічого не питає
      expect(s.options.length, s.id).toBeGreaterThanOrEqual(4);
      expect(s.options.length, s.id).toBeLessThanOrEqual(5);
      for (const o of s.options) { expect(o.say.length).toBeGreaterThan(5); expect(o.reply.length).toBeGreaterThan(40); expect(o.effect.note.length).toBeGreaterThan(5); }
    }
    // Розв’язка названа словами, а не натяком (M35): що з переходом, чому і що буде далі.
    const window = VACATION.find((s) => s.id === 'sc_window')!;
    expect(window.options).toEqual([]);
    const windowText = window.sheet.join(' ');
    expect(windowText).toMatch(/скасовано/);
    expect(windowText).toMatch(/три тижні/);
    expect(windowText).toMatch(/вікн/);
    expect(windowText).toMatch(/[Мм]ісяць/);
    // Канон травми (M35): жодних трансплантатів і швів — тут розтягнення, розрив лишився в пролозі.
    expect(JSON.stringify(VACATION)).not.toMatch(/трансплантат|\bшв[аоу]\b|\bшов\b/);
    // M28: тяжкість і свідок — на листі «знову газон» (що ти сказав {oldsub.dat}), а не на самому огляді.
    const again = VACATION.find((s) => s.id === 'sc_pitch_again')!;
    for (const o of again.options) { expect(o.injury, o.id).toBeTruthy(); expect(o.witness, o.id).toBeTruthy(); }
    expect(new Set(again.options.map((o) => o.witness)).size).toBe(again.options.length);
    // Улики на газоні відповідають «те саме коліно чи нове» і нічого не ламають: ні травми, ні свідка.
    // Id лишився з часів, коли лист ішов без дати: він записаний у career.vacation збережених кар’єр.
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
    const heavy = finishVacation(defaultCareer(), VACATION, [{ spread: 'trip', option: 'trip_tibo' }, { spread: 'sc_night_before', option: 'night_lie' }, { spread: 'sc_pitch_no_date', option: 'clue_sure' }, { spread: 'sc_pitch_again', option: 'wit_silent' }, { spread: 'sc_medical', option: 'exam_prove' }, { spread: 'return', option: 'ret_joke' }], promo, 1);
    expect(heavy.career.injuredMatches).toBe(0);
    // Місяць без м’яча, а не літо без передсезонки (M35): форма м’якша, ніж була.
    expect(heavy.career.nextMatch?.start?.stamina).toBe(-8);
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

  it('хто знає про ту ніч (M28): фізіо — це база, «дійшов сам» — тиша, «не дивитися» — версія «старе коліно»', () => {
    const c = (larsson: Career['larsson'], clue?: string) => ({ ...defaultCareer(), larsson, ...(clue ? { vacation: { sc_pitch_no_date: clue } } : {}) });
    // Покликав фізіо — травму бачив клуб, і до вівторка про паркан знає вся база.
    expect(nightKnowledge(c('knows')).rumor).toBe(true);
    expect(nightKnowledge(c('unsure')).rumor).toBe(true);
    // Попросив мовчати або збрехав — Ларссон знає, клуб ні; дійшов сам — не знає ніхто.
    expect(nightKnowledge(c('silent')).rumor).toBe(false);
    expect(nightKnowledge(c('silent')).saw).toBe(true);
    expect(nightKnowledge(c('none')).secret).toBe(true);
    expect(nightKnowledge(c('none')).saw).toBe(false);
    // Версія «старе коліно» — або не став перевіряти на газоні, або сказав її Ларссону.
    expect(nightKnowledge(c('lied')).denied).toBe(true);
    expect(nightKnowledge(c('none', 'clue_sure')).denied).toBe(true);
    expect(nightKnowledge(c('none', 'clue_grass')).denied).toBe(false);
    // Три сцени другого сезону взаємно виключні: гравець бачить рівно одну.
    const scenes = (career: Career) => ['sc_knee_rumor', 'sc_knee_denied', 'sc_knee_quiet']
      .filter((id) => ANCHOR_SCENES.find((a) => a.scene === id)!.when!(career));
    expect(scenes(c('knows'))).toEqual(['sc_knee_rumor']);
    expect(scenes(c('none'))).toEqual(['sc_knee_quiet']);
    expect(scenes(c('lied'))).toEqual(['sc_knee_denied']);
    expect(scenes(c('none', 'clue_sure'))).toEqual(['sc_knee_denied']);
    for (const id of ['sc_knee_rumor', 'sc_knee_denied', 'sc_knee_quiet']) {
      const scene = WEEK_SCENES.find((s) => s.id === id)!;
      expect(scene.options.length, id).toBe(4);
      expect(scene.head, id).toBeTruthy();
    }
    // Знання міняє розмову, а не стик: варіант у матчі проти його клубу відкривають флагом.
    const ep = EPISODES_RAW.find((x) => x.id === 'rx_top_larsson_from_bench')!;
    expect(ep.options.find((o) => o.id === 'knee_between_us')!.requires!.flags).toEqual(['larsson_saw']);
    expect(ep.options.filter((o) => !o.requires).length).toBeGreaterThanOrEqual(3);
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
