// Тиждень v3: три дні по три справи, у справи — ісходи з вагами (голос, перевірка атрибута,
// ситуація), сцени-продовження з підказкою голосу, обида голосів, які не кличуть.
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { defaultCareer, type Career } from '../src/engine/career';
import { createSeason, ourRow, recordRound, type Season } from '../src/engine/season';
import { BALANCE } from '../src/engine/balance';
import {
  finishWeek, neglectPenalties, offerWeekDays, planWeek, resolveOutcome, sceneFor, sceneOptionsFor, seenScenes, weekContext, weekVoiceSees,
  type ActivityEffect, type WeekOffer,
} from '../src/engine/week';
import { ACTIVITIES, FLAG_RULES, OPPONENTS, PLAYER, ROSTER, WEEK_SCENES, OPPONENT_KEYS } from '../src/content';
import { fillNamesDeep } from '../src/engine/names';
import type { VoiceKey } from '../src/engine/types';

const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
const VOICES: VoiceKey[] = ['ego', 'team', 'composure', 'vision', 'instinct', 'body'];
const ATTRS = Object.keys(PLAYER.attrs);
const KNOWN_FLAGS = new Set([...FLAG_RULES.map((f) => f.id), 'keeper_read']);

function seasonWith(results: [number, number][], fan = 6): Season {
  let sn = createSeason(7, OPPONENT_KEYS.second);
  results.forEach(([us, them], i) => {
    sn = recordRound(sn, { scoreUs: us, scoreThem: them, goals: 0, assists: 0, coachRating: 6, fanRating: fan, scorers: [] }, strengths, makeRng(100 + i));
  });
  return sn;
}
const ctxFor = (sn: Season, career: Career = defaultCareer()) => weekContext(sn, career, ourRow(sn).position)!;
const byId = (id: string) => ACTIVITIES.find((a) => a.id === id)!;
/** Эффект оставляет след: хоть что-то, кроме подписи. */
const leavesTrace = (e: ActivityEffect) => Object.keys(e).some((k) => k !== 'note');

describe('контент: ісходи справ і сцени', () => {
  it('у кожної справи є ісходи; у кожного — текст, підпис, слід і валідні голос/перевірка/сцена', () => {
    for (const a of ACTIVITIES) {
      expect(a.outcomes?.length, a.id).toBeGreaterThanOrEqual(1);
      const ids = new Set<string>();
      for (const o of a.outcomes!) {
        expect(ids.has(o.id), `${a.id}/${o.id} дубль`).toBe(false); ids.add(o.id);
        expect(o.text.length, `${a.id}/${o.id}`).toBeGreaterThan(20);
        expect(o.effect.note.length, `${a.id}/${o.id}`).toBeGreaterThan(5);
        expect(leavesTrace(o.effect), `${a.id}/${o.id} без сліду`).toBe(true);
        if (o.voice) expect(VOICES).toContain(o.voice);
        if (o.check) { expect(ATTRS).toContain(o.check.attr); expect(o.check.min).toBeGreaterThan(0); }
        if (o.followUp) expect(WEEK_SCENES.some((s) => s.id === o.followUp), `${a.id}/${o.id} → ${o.followUp}`).toBe(true);
        for (const f of o.effect.flags ?? []) expect(KNOWN_FLAGS.has(f.flag), `${a.id}/${o.id}: флаг ${f.flag}`).toBe(true);
        for (const f of o.effect.removeFlags ?? []) expect(KNOWN_FLAGS.has(f), `${a.id}/${o.id}: флаг ${f}`).toBe(true);
      }
    }
    // Две трети дел — с развилкой: иначе исход — просто новый текст.
    const branching = ACTIVITIES.filter((a) => (a.outcomes?.length ?? 0) >= 2).length;
    expect(branching / ACTIVITIES.length).toBeGreaterThan(0.66);
  });

  it('пам’ять сцен: бачену в кар’єрі сцену пропускаємо, поки є небачені; коли всі пройдені — знову можна', () => {
    const outcome = byId('hospital_visit').outcomes!.find((o) => o.followUp === 'sc_kid_promise')!;
    expect(sceneFor(outcome, WEEK_SCENES, new Set(), false)?.id).toBe('sc_kid_promise');
    expect(sceneFor(outcome, WEEK_SCENES, new Set(['sc_kid_promise']), false)).toBeUndefined();
    expect(sceneFor(outcome, WEEK_SCENES, new Set(WEEK_SCENES.map((s) => s.id)), false)?.id).toBe('sc_kid_promise');
    expect(sceneFor(outcome, WEEK_SCENES, new Set(), true)).toBeUndefined();   // одна на тиждень
    const career: Career = { ...defaultCareer(), weekLog: [{ season: 1, round: 2, chosen: [], offered: [], scene: { id: 'sc_kid_promise', option: 'x' } }] };
    expect(seenScenes(career).has('sc_kid_promise')).toBe(true);
  });

  it('сцени: 3–4 варіанти, один із підказкою голосу, кожен зі слідом; сцени досяжні', () => {
    const reachable = new Set(ACTIVITIES.flatMap((a) => (a.outcomes ?? []).map((o) => o.followUp)).filter(Boolean));
    for (const s of WEEK_SCENES) {
      expect(reachable.has(s.id), `сцена ${s.id} нізвідки не веде`).toBe(true);
      expect(s.options.length).toBeGreaterThanOrEqual(3);
      expect(s.options.length).toBeLessThanOrEqual(4);
      expect(s.options.filter((o) => o.insight).length, s.id).toBe(1);
      for (const o of s.options) {
        expect(leavesTrace(o.effect), `${s.id}/${o.id}`).toBe(true);
        expect(o.effect.note.length).toBeGreaterThan(5);
        if (o.insight) expect(VOICES).toContain(o.insight.who);
        for (const f of o.effect.flags ?? []) expect(KNOWN_FLAGS.has(f.flag), `${s.id}/${o.id}: ${f.flag}`).toBe(true);
      }
    }
  });

  it('після підстановки імен сирих плейсхолдерів не лишається', () => {
    const raw = /\{[a-z0-9.]+\}/;
    for (const a of fillNamesDeep(ACTIVITIES, ROSTER)) {
      for (const o of a.outcomes!) { expect(o.text, `${a.id}/${o.id}`).not.toMatch(raw); expect(o.effect.note).not.toMatch(raw); }
    }
    for (const s of fillNamesDeep(WEEK_SCENES, ROSTER)) {
      expect(s.setup, s.id).not.toMatch(raw);
      for (const o of s.options) { expect(o.text, `${s.id}/${o.id}`).not.toMatch(raw); expect(o.label).not.toMatch(raw); expect(o.effect.note).not.toMatch(raw); }
    }
  });
});

describe('resolveOutcome: голос, атрибут, ситуація', () => {
  const c = ctxFor(seasonWith([[1, 1]]));
  const share = (career: Career, id: string, outcome: string, n = 1500) => {
    let k = 0;
    for (let i = 0; i < n; i++) if (resolveOutcome(byId(id), PLAYER, c, career, makeRng(i))?.id === outcome) k += 1;
    return k / n;
  };

  it('домінантний голос кар’єри тягне свій ісход: Его на вечері частіше свариться', () => {
    const ego: Career = { ...defaultCareer(), voiceCounts: { ...defaultCareer().voiceCounts, ego: BALANCE.week.dominantMin + 2 } };
    const plain = share(defaultCareer(), 'team_dinner', 'quarrel');
    const withEgo = share(ego, 'team_dinner', 'quarrel');
    expect(withEgo).toBeGreaterThan(plain * 1.5);
    expect(withEgo).toBeLessThan(0.7);       // не приговор: и с Его вечер чаще проходит мирно
  });

  it('перевірка атрибута: слабкий атрибут майже закриває ісход, сильний — відкриває', () => {
    const weak = { ...PLAYER, attrs: { ...PLAYER.attrs, composure: 40 } };
    const strong = { ...PLAYER, attrs: { ...PLAYER.attrs, composure: 70 } };
    const with_ = (p: typeof PLAYER) => {
      let k = 0;
      for (let i = 0; i < 1500; i++) if (resolveOutcome(byId('gym'), p, c, defaultCareer(), makeRng(i))?.id === 'smart') k += 1;
      return k / 1500;
    };
    expect(with_(weak)).toBeLessThan(0.15);
    expect(with_(strong)).toBeGreaterThan(with_(weak) * 2);
  });

  it('ситуація підсилює ісход: після поразки безсоння частіше', () => {
    const afterLoss = ctxFor(seasonWith([[0, 2]]));
    const afterWin = ctxFor(seasonWith([[2, 0]]));
    const cnt = (cx: typeof c) => { let k = 0; for (let i = 0; i < 1500; i++) if (resolveOutcome(byId('sleep'), PLAYER, cx, defaultCareer(), makeRng(i))?.id === 'insomnia') k += 1; return k / 1500; };
    expect(cnt(afterLoss)).toBeGreaterThan(cnt(afterWin) * 1.5);
  });

  it('детерміновано: той самий rng — той самий вечір', () => {
    expect(resolveOutcome(byId('team_dinner'), PLAYER, c, defaultCareer(), makeRng(42))?.id)
      .toBe(resolveOutcome(byId('team_dinner'), PLAYER, c, defaultCareer(), makeRng(42))?.id);
  });
});

describe('weekVoiceSees і варіанти сцени', () => {
  it('Его бачить на трибунах ≥ 7 або як домінантний; Команда — при довірі тренера', () => {
    const loud = ctxFor(seasonWith([[1, 1]], 8));
    const quiet = ctxFor(seasonWith([[1, 1]], 5));
    expect(weekVoiceSees('ego', PLAYER, loud, defaultCareer())).toBe(true);
    expect(weekVoiceSees('ego', PLAYER, quiet, defaultCareer())).toBe(false);
    const egoCareer: Career = { ...defaultCareer(), voiceCounts: { ...defaultCareer().voiceCounts, ego: BALANCE.week.dominantMin } };
    expect(weekVoiceSees('ego', PLAYER, quiet, egoCareer)).toBe(true);
    const trusted: Career = { ...defaultCareer(), coachTrust: BALANCE.teamSeesTrust };
    const distrusted: Career = { ...defaultCareer(), coachTrust: BALANCE.teamSeesTrust - 10 };
    expect(weekVoiceSees('team', PLAYER, ctxFor(seasonWith([[1, 1]]), trusted), trusted)).toBe(true);
    expect(weekVoiceSees('team', PLAYER, ctxFor(seasonWith([[1, 1]]), distrusted), distrusted)).toBe(false);
  });

  it('варіант із підказкою показується тільки коли голос бачить', () => {
    const scene = WEEK_SCENES.find((s) => s.id === 'sc_coach_call')!;
    expect(sceneOptionsFor(scene, () => false).some((o) => o.insight)).toBe(false);
    expect(sceneOptionsFor(scene, () => true).some((o) => o.insight)).toBe(true);
    expect(sceneOptionsFor(scene, () => false).length).toBe(3);
  });
});

describe('три дні по три справи', () => {
  const c = ctxFor(seasonWith([[1, 1]]));

  it('дні заповнені, голоси в дні різні, не більше двох справ одного голосу, без дублів', () => {
    for (let seed = 0; seed < 50; seed++) {
      const days = offerWeekDays(ACTIVITIES, c, defaultCareer(), makeRng(seed));
      expect(days.length).toBe(BALANCE.week.days);
      const all = days.flat();
      expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
      const perVoice: Partial<Record<VoiceKey, number>> = {};
      for (const day of days) {
        expect(day.length).toBe(BALANCE.week.perDay);
        expect(new Set(day.map((a) => a.voice)).size).toBe(day.length);
        for (const a of day) perVoice[a.voice] = (perVoice[a.voice] ?? 0) + 1;
      }
      for (const n of Object.values(perVoice)) expect(n).toBeLessThanOrEqual(BALANCE.week.maxPerVoice);
    }
  });

  it('тренер закрив місто: три базових голоси, але всі три дні заповнені', () => {
    const locked = ctxFor(seasonWith([[0, 4]]));
    for (let seed = 0; seed < 30; seed++) {
      const days = offerWeekDays(ACTIVITIES, locked, defaultCareer(), makeRng(seed));
      for (const day of days) expect(day.length, `seed ${seed}`).toBe(BALANCE.week.perDay);
    }
  });

  it('planWeek дає кожній пропозиції ісход, і той самий сид — ті самі вечори', () => {
    const a = planWeek(ACTIVITIES, PLAYER, c, defaultCareer(), makeRng(5));
    const b = planWeek(ACTIVITIES, PLAYER, c, defaultCareer(), makeRng(5));
    expect(a.flat().every((o) => o.outcome)).toBe(true);
    expect(a.flat().map((o) => o.activity.id + ':' + o.outcome!.id)).toEqual(b.flat().map((o) => o.activity.id + ':' + o.outcome!.id));
  });
});

describe('обида голосів', () => {
  it('голос, якого не кличуть neglectWeeks тижнів поспіль, замовкає на матч; вибір скидає лічильник', () => {
    let career = defaultCareer();
    for (let w = 0; w < BALANCE.week.neglectWeeks - 1; w++) {
      const r = neglectPenalties(career, ['ego', 'body'], ['body']);
      career = r.career;
      expect(r.penalties).toEqual([]);
    }
    expect(career.voiceNeglect?.ego).toBe(BALANCE.week.neglectWeeks - 1);
    expect(career.voiceNeglect?.body).toBe(0);
    const r = neglectPenalties(career, ['ego', 'body'], ['body']);
    expect(r.penalties.map((p) => p.effect.quieter)).toEqual([['ego']]);
    expect(r.career.voiceNeglect?.ego).toBe(0);
    // Не пропонували — не ображається.
    expect(neglectPenalties(defaultCareer(), ['body'], []).career.voiceNeglect?.ego).toBeUndefined();
  });
});

describe('finishWeek: ісход замість ефекту за замовчуванням, сцена, журнал', () => {
  const c = ctxFor(seasonWith([[1, 1]]));
  const dinner = byId('team_dinner');
  const quarrel = dinner.outcomes!.find((o) => o.id === 'quarrel')!;
  const gym = byId('gym');
  const overdid = gym.outcomes!.find((o) => o.id === 'overdid')!;
  const days: WeekOffer[][] = [[{ activity: dinner, outcome: quarrel }], [{ activity: gym, outcome: overdid }], []];

  it('застосовується ефект ісходу, сцена і бирки; тиждень записаний з ісходами і сценою', () => {
    const { career, tags } = finishWeek(defaultCareer(), c, days, [
      { day: 0, activityId: 'team_dinner', scene: { id: 'sc_quarrel_partner', option: 'apologize' } },
      { day: 1, activityId: 'gym', trainAttr: 'strength' },
    ], WEEK_SCENES);
    // Сварка ставит partner_annoyed, сцена «перепросити» его снимает и ставит partner_trusts.
    const flags = (career.carriedFlags ?? []).map((f) => f.flag);
    expect(flags).toContain('partner_trusts');
    expect(flags).not.toContain('partner_annoyed');
    // Перебор в зале: −14 сил, а не −8 по умолчанию.
    expect(career.nextMatch?.start?.stamina).toBe(-14 - 4);
    expect(career.training?.strength).toBe(1);
    expect(tags).toContain('Его гучніше');
    const log = career.weekLog!.at(-1)!;
    expect(log.outcomes).toEqual(['team_dinner:quarrel', 'gym:overdid']);
    expect(log.scene).toEqual({ id: 'sc_quarrel_partner', option: 'apologize' });
    expect(log.offered).toEqual(['team_dinner', 'gym']);
  });

  it('без ісходу — ефект справи за замовчуванням; пропущений день нічого не робить', () => {
    const { career } = finishWeek(defaultCareer(), c, [[{ activity: gym, outcome: null }], [], []], [{ day: 0, activityId: 'gym', trainAttr: 'pace' }], WEEK_SCENES);
    expect(career.nextMatch?.start?.stamina).toBe(gym.effect.stamina);
    expect(career.weekLog!.at(-1)!.outcomes).toEqual([]);
  });
});
