// Тиждень між матчами: шесть предложений по голосам из пула на карьеру, до двух дел,
// эффекты читаются через голоса и брифинг следующего матча.
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { createMatch, fillTrigger } from '../src/engine/match';
import { neutralConditions } from '../src/engine/conditions';
import { applyMatchToCareer, consumeStartPenalty, defaultCareer, effectivePlayer, POINT_VALUE, type Career } from '../src/engine/career';
import { createSeason, ourRow, recordRound, type Season } from '../src/engine/season';
import { voiceSees } from '../src/engine/voices';
import { attrMod } from '../src/engine/attr';
import { BALANCE } from '../src/engine/balance';
import {
  applyWeek, coachLocksCity, matchesActivity, offerWeek, recordWeek, VOICE_ORDER, weekContext, weekPending,
  type Activity, type WeekContext,
} from '../src/engine/week';
import { ACTIVITIES, EPISODES_RAW, FLAG_RULES, OPPONENTS, PLAYER, ROSTER } from '../src/content';
import { fillNamesDeep } from '../src/engine/names';
import type { MatchState } from '../src/engine/types';
import type { MatchSummary } from '../src/engine/match';

const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));

function seasonWith(results: [number, number, number?][], fan = 6): Season {
  let sn = createSeason(7, Object.keys(OPPONENTS));
  results.forEach(([us, them, goals = 0], i) => {
    sn = recordRound(sn, { scoreUs: us, scoreThem: them, goals, assists: 0, coachRating: 6, fanRating: fan, scorers: [] }, strengths, makeRng(100 + i));
  });
  return sn;
}
const ctxFor = (sn: Season, career: Career = defaultCareer()) => weekContext(sn, career, ourRow(sn).position)!;
const byId = (id: string) => ACTIVITIES.find((a) => a.id === id)!;
const emptyState = (): MatchState => ({
  minute: 90, scoreUs: 0, scoreThem: 0, stamina: 30, composureNow: 50, coachTrust: 55, fanHype: 45, momentum: 0,
  stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 }, flags: [], marks: {},
  voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } },
  log: [],
});

describe('контекст и предложения', () => {
  it('без сыгранного тура недели нет; после — результат, разгром, травма, флаги', () => {
    expect(weekContext(createSeason(1, Object.keys(OPPONENTS)), defaultCareer(), 3)).toBeNull();
    const c = ctxFor(seasonWith([[0, 3]]), { ...defaultCareer(), injuredMatches: 1, carriedFlags: [
      { flag: 'partner_annoyed', mark: { minute: 1, episodeId: 'e', optionId: 'o', past: 'x' } },
      { flag: 'ref_annoyed', mark: { minute: 0, episodeId: 'w', optionId: 'o', past: 'y' }, after: 1 },
    ] });
    expect(c).toMatchObject({ result: 'loss', bigLoss: true, injured: true, flags: ['partner_annoyed'], hasScored: false });
  });

  it('шесть предложений — по одному на голос, все подходят по условиям', () => {
    const c = ctxFor(seasonWith([[2, 1, 1]]));
    const offers = offerWeek(ACTIVITIES, c, defaultCareer(), makeRng(1));
    expect(offers.map((a) => a.voice)).toEqual(VOICE_ORDER);
    for (const a of offers) expect(matchesActivity(a.when, c), a.id).toBe(true);
  });

  it('после разгрома тренер закрывает город: только Тіло, Бачення, Холоднокровність', () => {
    const c = ctxFor(seasonWith([[0, 4]]));
    expect(coachLocksCity(c)).toBe(true);
    const offers = offerWeek(ACTIVITIES, c, defaultCareer(), makeRng(1));
    expect(offers.map((a) => a.voice).sort()).toEqual(['body', 'composure', 'vision']);
  });

  it('once — раз за сезон, cooldown — не раньше чем через N туров, недавно показанное весит меньше', () => {
    const c = ctxFor(seasonWith([[1, 0, 1], [1, 0], [1, 0]]));
    const chosen: Career = { ...defaultCareer(), level: 3, weekLog: [{ season: 1, round: 2, chosen: ['veneers', 'yoga'], offered: ['veneers', 'yoga'] }] };
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) for (const a of offerWeek(ACTIVITIES, c, chosen, makeRng(i))) seen.add(a.id);
    expect(seen.has('veneers')).toBe(false);   // once
    expect(seen.has('yoga')).toBe(false);      // cooldown 2, прошёл 1 тур
    // Недавно показанное, но не выбранное — реже, не никогда.
    const offered: Career = { ...defaultCareer(), weekLog: [{ season: 1, round: 2, chosen: [], offered: ['gym'] }] };
    let gym = 0;
    for (let i = 0; i < 200; i++) if (offerWeek(ACTIVITIES, c, offered, makeRng(i)).some((a) => a.id === 'gym')) gym += 1;
    let gymFresh = 0;
    for (let i = 0; i < 200; i++) if (offerWeek(ACTIVITIES, c, defaultCareer(), makeRng(i)).some((a) => a.id === 'gym')) gymFresh += 1;
    expect(gym).toBeGreaterThan(0);
    expect(gym).toBeLessThan(gymFresh);
  });

  it('дела по флагу всплывают, когда флаг есть: партнёр ображений → поговорити', () => {
    const career: Career = { ...defaultCareer(), carriedFlags: [{ flag: 'partner_annoyed', mark: { minute: 1, episodeId: 'e', optionId: 'o', past: 'x' } }] };
    const c = ctxFor(seasonWith([[1, 1]]), career);
    let hits = 0;
    for (let i = 0; i < 30; i++) if (offerWeek(ACTIVITIES, c, career, makeRng(i)).some((a) => a.id === 'apologize_partner')) hits += 1;
    expect(hits).toBeGreaterThan(12);   // вес 8 против ~11 обычных дел Команди
    expect(offerWeek(ACTIVITIES, ctxFor(seasonWith([[1, 1]])), defaultCareer(), makeRng(1)).some((a) => a.id === 'apologize_partner')).toBe(false);
  });

  it('неделя записывается, и после этого не pending', () => {
    const c = ctxFor(seasonWith([[1, 0]]));
    expect(weekPending(defaultCareer(), c)).toBe(true);
    const offers = offerWeek(ACTIVITIES, c, defaultCareer(), makeRng(1));
    const after = recordWeek(defaultCareer(), c, offers, []);
    expect(weekPending(after, c)).toBe(false);
    expect(after.weekLog![0].offered.length).toBe(6);
  });
});

describe('эффекты недели', () => {
  it('голос гучніший — +1 к модификатору его атрибутов на один матч, потом исчезает', () => {
    const { career } = applyWeek(defaultCareer(), [{ activity: byId('yoga') }]);
    const { penalty, career: consumed } = consumeStartPenalty(career);
    const p = effectivePlayer(PLAYER, consumed, penalty.attrBonus);
    expect(attrMod(p.attrs.composure)).toBe(attrMod(PLAYER.attrs.composure) + 1);
    expect(consumed.nextMatch).toBeUndefined();
    // Следующий матч — без бонуса.
    expect(consumeStartPenalty(consumed).penalty.attrBonus).toBeUndefined();
    expect(penalty.note).toContain('Йога');
  });

  it('два дела складываются; Его тихіше не трогает атрибуты; сили и тренер', () => {
    const { career, tags } = applyWeek(defaultCareer(), [{ activity: byId('gym'), trainAttr: 'pace' }, { activity: byId('team_dinner') }]);
    expect(career.coachTrust).toBe(defaultCareer().coachTrust + 3);
    expect(career.nextMatch?.start?.stamina).toBe(-12);
    expect(career.nextMatch?.attrBonus).toMatchObject({ pace: POINT_VALUE, strength: POINT_VALUE });
    expect(career.training?.pace).toBe(1);
    expect(tags).toContain('Тіло гучніше');
    expect(tags).toContain('Команда гучніше');
    expect(tags).toContain('сили ↓');
  });

  it('тренировки копятся: trainToPoint раз в один атрибут = +1 очко назавжди', () => {
    let career = defaultCareer();
    for (let i = 0; i < BALANCE.week.trainToPoint; i++) career = applyWeek(career, [{ activity: byId('gym'), trainAttr: 'pace' }]).career;
    expect(career.attrPoints.pace).toBe(1);
    expect(career.training?.pace).toBe(0);
    expect(attrMod(effectivePlayer(PLAYER, career).attrs.pace)).toBe(attrMod(PLAYER.attrs.pace) + 1);
  });

  it('відео з аналітиком кладёт keeper_read в следующий матч; побачення дальше — нет', () => {
    const { career } = applyWeek(defaultCareer(), [{ activity: byId('video_analyst') }]);
    const { penalty } = consumeStartPenalty(career);
    expect(penalty.flags.map((f) => f.flag)).toEqual(['keeper_read']);
    const s = createMatch('w', 1, PLAYER, makeRng(1), EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES, { flags: penalty.flags });
    expect(s.state.flags).toContain('keeper_read');
    expect(s.state.marks.keeper_read.past).toContain('відео');
  });

  it('отложенный флаг едет молча N матчей и всплывает с «ще два тури тому»', () => {
    const { career } = applyWeek(defaultCareer(), [{ activity: byId('ref_stories') }]);
    const m1 = consumeStartPenalty(career);
    expect(m1.penalty.flags).toEqual([]);
    const afterM1 = applyMatchToCareer(m1.career, emptyState(), {} as MatchSummary, false);
    const m2 = consumeStartPenalty(afterM1);
    expect(m2.penalty.flags.map((f) => f.flag)).toEqual(['ref_annoyed']);
    const s = createMatch('w', 1, PLAYER, makeRng(1), EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES, { flags: m2.penalty.flags });
    const rx = s.episodes.find((e) => e.id === 'rx_ref_watching')!;
    expect(fillTrigger(rx.setup, s.state.marks.ref_annoyed)).toMatch(/^Ще два тури тому ти назвав суддівство ганьбою в сторіз/);
  });

  it('лікар лечит травму к следующему матчу: без штрафа сил', () => {
    const injured: Career = { ...defaultCareer(), injuredMatches: 2 };
    expect(consumeStartPenalty(injured).penalty.staminaPenalty).toBe(20);
    const { career } = applyWeek(injured, [{ activity: byId('doctor') }]);
    const { penalty, career: after } = consumeStartPenalty(career);
    expect(penalty.staminaPenalty).toBe(0);
    expect(after.injuredMatches).toBe(0);
  });

  it('вініри: три голоси тихіше — стартовий Реєс на матч перестаёт бачити Інстинктом', () => {
    const { career } = applyWeek({ ...defaultCareer(), level: 3 }, [{ activity: byId('veneers') }]);
    const { penalty, career: consumed } = consumeStartPenalty(career);
    const p = effectivePlayer(PLAYER, consumed, penalty.attrBonus);
    expect(voiceSees('instinct', PLAYER)).toBe(true);
    expect(voiceSees('instinct', p)).toBe(false);
  });
});

describe('контент недели', () => {
  const EFFECT_KEYS = ['louder', 'quieter', 'stamina', 'composure', 'fanHype', 'momentum', 'coachTrust', 'train', 'flags', 'removeFlags', 'heal', 'note'];
  const KNOWN_FLAGS = new Set([...FLAG_RULES.map((r) => r.id), 'booked', 'injured', 'sent_off', 'tired', 'keeper_read', 'knock']);

  it('≥48 дел, у каждого голоса ≥6, id уникальны, строки в тоне: без «!» и процентов, имена — плейсхолдерами', () => {
    expect(ACTIVITIES.length).toBeGreaterThanOrEqual(48);
    expect(new Set(ACTIVITIES.map((a) => a.id)).size).toBe(ACTIVITIES.length);
    for (const v of VOICE_ORDER) expect(ACTIVITIES.filter((a) => a.voice === v).length, v).toBeGreaterThanOrEqual(6);
    for (const a of ACTIVITIES) {
      expect(a.line.length, a.id).toBeGreaterThan(20);
      expect(a.line, a.id).not.toMatch(/!/);
      expect(a.effect.note, a.id).not.toMatch(/\d+\s?%/);
      expect(a.effect.note.length, a.id).toBeGreaterThan(10);
      expect(() => fillNamesDeep(a, ROSTER), a.id).not.toThrow();
      for (const k of Object.keys(a.effect)) expect(EFFECT_KEYS, `${a.id}: ${k}`).toContain(k);
      for (const f of a.effect.flags ?? []) expect(KNOWN_FLAGS.has(f.flag), `${a.id}: ${f.flag}`).toBe(true);
      for (const f of a.effect.removeFlags ?? []) expect(KNOWN_FLAGS.has(f), `${a.id}: ${f}`).toBe(true);
      const attrs = a.effect.train;
      if (attrs && attrs !== 'choice') expect(Object.keys(PLAYER.attrs), a.id).toContain(attrs);
      // Дело должно что-то менять в матче или карьере — иначе это анекдот без выбора (кінь — исключение по замыслу).
      const meaningful = (Object.keys(a.effect) as (keyof Activity['effect'])[]).filter((k) => k !== 'note');
      expect(meaningful.length, a.id).toBeGreaterThan(0);
    }
  });

  it('у каждого голоса есть дело без условий — неделя никогда не пустая', () => {
    const c: WeekContext = ctxFor(seasonWith([[1, 1]]));
    for (const v of VOICE_ORDER) {
      const any = ACTIVITIES.some((a) => a.voice === v && matchesActivity(a.when, c));
      expect(any, v).toBe(true);
    }
  });

  it('на дистанции сезона игрок видит много разных дел', () => {
    let career = { ...defaultCareer(), level: 3 };
    let sn = createSeason(3, Object.keys(OPPONENTS));
    const seen = new Set<string>();
    for (let r = 0; r < 10; r++) {
      sn = recordRound(sn, { scoreUs: r % 3, scoreThem: 1, goals: r % 2, assists: 0, coachRating: 6, fanRating: 7, scorers: [] }, strengths, makeRng(r));
      const c = ctxFor(sn, career);
      const offers = offerWeek(ACTIVITIES, c, career, makeRng(500 + r));
      offers.forEach((a) => seen.add(a.id));
      career = recordWeek(applyWeek(career, offers.slice(0, 2).map((a) => ({ activity: a, trainAttr: 'pace' as const }))).career, c, offers, offers.slice(0, 2));
      career = { ...career, nextMatch: undefined };
    }
    expect(seen.size).toBeGreaterThanOrEqual(30);
  });
});

describe('старые сохранения', () => {
  it('записи недели первой версии (sceneId без chosen/offered) не валят offerWeek', () => {
    const legacy = { ...defaultCareer(), weekLog: [{ season: 1, round: 1, sceneId: 'wk_press_loss', optionId: 'own_it' } as unknown as NonNullable<Career['weekLog']>[number]] };
    const c = ctxFor(seasonWith([[0, 1]]), legacy);
    expect(() => offerWeek(ACTIVITIES, c, legacy, makeRng(1))).not.toThrow();
    expect(offerWeek(ACTIVITIES, c, legacy, makeRng(1)).length).toBe(6);
  });
});
