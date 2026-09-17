// Тиждень між матчами: сцена по условию, once/cooldown, отложенные флаги, которые
// всплывают реактивным эпизодом не в следующем матче, а через несколько туров.
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { createMatch, fillTrigger } from '../src/engine/match';
import { neutralConditions } from '../src/engine/conditions';
import { applyMatchToCareer, consumeStartPenalty, defaultCareer, type Career } from '../src/engine/career';
import { createSeason, ourRow, recordRound, type Season } from '../src/engine/season';
import {
  applyWeekChoice, matchesWeek, pickWeekScene, skipWeek, weekContext, weekPending, weekSceneText, whenTextFor,
} from '../src/engine/week';
import { EPISODES_RAW, FLAG_RULES, OPPONENTS, PLAYER, ROSTER, WEEKS } from '../src/content';
import { fillNamesDeep } from '../src/engine/names';
import type { MatchState } from '../src/engine/types';
import type { MatchSummary } from '../src/engine/match';

const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));

/** Сезон с сыгранными турами по списку счетов (наши голы : их голы, свои голы игрока). */
function seasonWith(results: [number, number, number?][]): Season {
  let sn = createSeason(7, Object.keys(OPPONENTS));
  results.forEach(([us, them, goals = 0], i) => {
    sn = recordRound(sn, { scoreUs: us, scoreThem: them, goals, assists: 0, coachRating: 6, fanRating: 6, scorers: [] }, strengths, makeRng(100 + i));
  });
  return sn;
}

const ctxFor = (sn: Season, career: Career = defaultCareer()) => weekContext(sn, career, ourRow(sn).position)!;

const scene = (id: string) => WEEKS.find((s) => s.id === id)!;

describe('контекст недели', () => {
  it('без сыгранных туров недели нет', () => {
    expect(weekContext(createSeason(1, Object.keys(OPPONENTS)), defaultCareer(), 3)).toBeNull();
  });

  it('результат, разгром, серия поражений и матчи без гола считаются с конца', () => {
    const c = ctxFor(seasonWith([[2, 0, 1], [0, 1], [0, 3]]));
    expect(c.result).toBe('loss');
    expect(c.bigLoss).toBe(true);
    expect(c.lossStreak).toBe(2);
    expect(c.drought).toBe(2);
    expect(c.scored).toBe(false);
    expect(c.round).toBe(3);
  });

  it('в контекст попадают только флаги, которые сработают в следующем матче, отложенные — нет', () => {
    const career: Career = { ...defaultCareer(), carriedFlags: [
      { flag: 'partner_annoyed', mark: { minute: 40, episodeId: 'e', optionId: 'o', past: 'пробив сам' } },
      { flag: 'ref_annoyed', mark: { minute: 0, episodeId: 'w', optionId: 'o', past: 'сказав' }, after: 1 },
    ] };
    expect(ctxFor(seasonWith([[1, 0]]), career).flags).toEqual(['partner_annoyed']);
  });
});

describe('выбор сцены', () => {
  it('после поражения — микрофон, после победы без флагов — недели нет', () => {
    const loss = ctxFor(seasonWith([[0, 1]]));
    expect(pickWeekScene(WEEKS, loss, defaultCareer(), makeRng(1))?.id).toBe('wk_press_loss');
    const win = ctxFor(seasonWith([[3, 0, 2]]));
    expect(pickWeekScene(WEEKS, win, defaultCareer(), makeRng(1))).toBeNull();
  });

  it('условие по флагу конкретнее условия по результату — роздягальня важнее микрофона', () => {
    const career: Career = { ...defaultCareer(), carriedFlags: [
      { flag: 'partner_annoyed', mark: { minute: 40, episodeId: 'e', optionId: 'o', past: 'пробив сам' } },
    ] };
    const c = ctxFor(seasonWith([[0, 1]]), career);
    expect(matchesWeek(scene('wk_press_loss').when, c)).toBe(true);
    expect(pickWeekScene(WEEKS, c, career, makeRng(1))?.id).toBe('wk_locker_partner');
  });

  it('cooldown: та же сцена не раньше чем через N туров того же сезона', () => {
    const c = ctxFor(seasonWith([[0, 1], [0, 2]]));
    const shown: Career = { ...defaultCareer(), weekLog: [{ season: 1, round: 1, sceneId: 'wk_press_loss', optionId: 'own_it' }] };
    expect(pickWeekScene(WEEKS, c, shown, makeRng(1))).toBeNull();
    const longAgo: Career = { ...defaultCareer(), weekLog: [{ season: 1, round: -5, sceneId: 'wk_press_loss', optionId: 'own_it' }] };
    expect(pickWeekScene(WEEKS, c, longAgo, makeRng(1))?.id).toBe('wk_press_loss');
  });

  it('неделя записывается — и с выбором, и пустой, — чтобы после перезагрузки не искать её заново', () => {
    const c = ctxFor(seasonWith([[0, 1]]));
    expect(weekPending(defaultCareer(), c)).toBe(true);
    expect(weekPending(skipWeek(defaultCareer(), c), c)).toBe(false);
    const { career } = applyWeekChoice(defaultCareer(), scene('wk_press_loss'), scene('wk_press_loss').options[0], c);
    expect(weekPending(career, c)).toBe(false);
    expect(career.weekLog?.[0]).toMatchObject({ season: 1, round: 1, sceneId: 'wk_press_loss', optionId: 'own_it' });
  });
});

describe('последствия недели', () => {
  const summary: MatchSummary = {} as MatchSummary;
  const emptyState = (): MatchState => ({
    minute: 90, scoreUs: 0, scoreThem: 0, stamina: 30, composureNow: 50, coachTrust: 55, fanHype: 45, momentum: 0,
    stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 }, flags: [], marks: {},
    voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } },
    log: [],
  });

  it('доверие тренера меняется сразу, старт следующего матча — через nextStart и Carryover', () => {
    const c = ctxFor(seasonWith([[0, 1]]));
    const s = scene('wk_press_loss');
    const { career, badges } = applyWeekChoice(defaultCareer(), s, s.options.find((o) => o.id === 'own_it')!, c);
    expect(career.coachTrust).toBe(defaultCareer().coachTrust + 6);
    expect(career.nextStart).toMatchObject({ fanHype: -4 });
    expect(badges.map((b) => b.tone)).toEqual(['good', 'bad']);
    const { penalty, career: consumed } = consumeStartPenalty(career);
    expect(penalty.startDelta).toMatchObject({ fanHype: -4 });
    expect(penalty.note).toContain('взяв поразку на себе');
    expect(consumed.nextStart).toBeUndefined();
    const session = createMatch('w', 1, PLAYER, makeRng(1), EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES, { startDelta: penalty.startDelta });
    const plain = createMatch('w', 1, PLAYER, makeRng(1), EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES);
    expect(session.state.fanHype).toBe(plain.state.fanHype - 4);
  });

  it('отложенный флаг едет молча ровно N матчей, переживает свисток и всплывает с «ще два тури тому»', () => {
    const c = ctxFor(seasonWith([[0, 1]]));
    const s = scene('wk_press_loss');
    const { career } = applyWeekChoice(defaultCareer(), s, s.options.find((o) => o.id === 'blame_ref')!, c);
    expect(career.carriedFlags).toEqual([expect.objectContaining({ flag: 'ref_annoyed', after: 1 })]);

    // Матч 1 после недели: флага в нём нет, счётчик уменьшился.
    const m1 = consumeStartPenalty(career);
    expect(m1.penalty.flags).toEqual([]);
    expect(m1.career.carriedFlags).toEqual([expect.objectContaining({ flag: 'ref_annoyed', after: 0 })]);
    // Свисток матча 1 не теряет отложенный флаг.
    const afterM1 = applyMatchToCareer(m1.career, emptyState(), summary, false);
    expect(afterM1.carriedFlags?.map((f) => f.flag)).toEqual(['ref_annoyed']);

    // Матч 2: флаг стартует, метка говорит, когда это было.
    const m2 = consumeStartPenalty(afterM1);
    expect(m2.penalty.flags.map((f) => f.flag)).toEqual(['ref_annoyed']);
    expect(m2.career.carriedFlags).toEqual([]);
    const session = createMatch('w', 1, PLAYER, makeRng(1), EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES, { flags: m2.penalty.flags });
    expect(session.state.flags).toContain('ref_annoyed');
    const rx = session.episodes.find((e) => e.id === 'rx_ref_watching')!;
    expect(fillTrigger(rx.setup, session.state.marks.ref_annoyed)).toMatch(/^Ще два тури тому ти назвав суддівство ганьбою в пресі/);
  });

  it('«когда» по задержке: следующий матч — минулого тижня, дальше — счёт туров', () => {
    expect(whenTextFor(0)).toBe('ще минулого тижня');
    expect(whenTextFor(1)).toBe('ще два тури тому');
    expect(whenTextFor(2)).toBe('ще три тури тому');
  });

  it('роздягальня знает поступок из матча, а извинение снимает обиду и ставит долг на следующий матч', () => {
    const career: Career = { ...defaultCareer(), carriedFlags: [
      { flag: 'partner_annoyed', mark: { minute: 40, episodeId: 'e', optionId: 'o', past: 'пробив сам, коли він був вільний', previousMatch: true } },
    ] };
    const c = ctxFor(seasonWith([[0, 1]]), career);
    const s = scene('wk_locker_partner');
    expect(weekSceneText(s, career)).toContain('як ти пробив сам, коли він був вільний ще минулого матчу');
    const { career: after } = applyWeekChoice(career, s, s.options.find((o) => o.id === 'apologize')!, c);
    expect(after.carriedFlags?.map((f) => f.flag)).toEqual(['partner_trusts']);
    expect(after.carriedFlags?.[0].after).toBeUndefined();
    expect(consumeStartPenalty(after).penalty.flags.map((f) => f.flag)).toEqual(['partner_trusts']);
  });
});

describe('контент недели', () => {
  it('2–3 варианта, у каждого результат; плейсхолдеры разрешаются, чужих флагов нет', () => {
    const known = new Set([...FLAG_RULES.map((r) => r.id), 'booked', 'injured', 'sent_off', 'tired', 'keeper_read', 'knock']);
    for (const s of WEEKS) {
      expect(s.options.length, s.id).toBeGreaterThanOrEqual(2);
      expect(s.options.length, s.id).toBeLessThanOrEqual(3);
      expect(() => fillNamesDeep(s, ROSTER), s.id).not.toThrow();
      for (const o of s.options) {
        expect(o.result.length, `${s.id}/${o.id}`).toBeGreaterThan(20);
        for (const f of o.apply?.flags ?? []) {
          expect(known.has(f.flag), `${s.id}/${o.id}: ${f.flag}`).toBe(true);
          expect(f.past.length, `${s.id}/${o.id}: past`).toBeGreaterThan(5);
        }
        for (const f of o.apply?.removeFlags ?? []) expect(known.has(f), `${s.id}/${o.id}: ${f}`).toBe(true);
      }
      for (const f of s.when.flags ?? []) expect(known.has(f), `${s.id}: when ${f}`).toBe(true);
      expect(JSON.stringify(s), s.id).not.toMatch(/\d+\s?%/);
    }
  });

  it('у каждого флага недели есть реактивный эпизод, который его отыгрывает', () => {
    const reactive = new Set(EPISODES_RAW.flatMap((e) => e.requires?.flags ?? []));
    for (const s of WEEKS) for (const o of s.options) for (const f of o.apply?.flags ?? []) {
      expect(reactive.has(f.flag), `${s.id}/${o.id}: ${f.flag}`).toBe(true);
    }
  });
});
