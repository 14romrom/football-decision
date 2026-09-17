import { describe, it, expect } from 'vitest';
import { BALANCE } from '../src/engine/balance';
import {
  applyMatchToCareer, consumeStartPenalty, defaultCareer, effectivePlayer, levelForXp,
  LEVEL_THRESHOLDS, nextMatchCoachTrust, pointEffect, POINT_VALUE, spendPoint, xpForMatch, xpToNextLevel,
} from '../src/engine/career';
import { attrMod } from '../src/engine/attr';
import { PLAYER } from '../src/content';
import type { MatchState } from '../src/engine/types';
import type { MatchSummary } from '../src/engine/match';

const state = (over: Partial<MatchState> = {}): MatchState => ({
  minute: 90, scoreUs: 1, scoreThem: 0, stamina: 20, composureNow: 60, coachTrust: 55, fanHype: 60, momentum: 0,
  stats: { goals: 1, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 },
  flags: [], marks: {},
  voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } },
  log: [], ...over,
});

const summary = (over: Partial<MatchSummary> = {}): MatchSummary => ({
  scoreUs: 1, scoreThem: 0, stats: state().stats, staminaLeft: 20,
  coachRating: 6, fanRating: 7, recap: [], points: 3, goals: [], ...over,
});

describe('career: опыт и уровни', () => {
  it('xp = база + округлённые оценки + бонус за характер', () => {
    expect(xpForMatch(summary({ coachRating: 6, fanRating: 7 }), false)).toBe(8 + 6 + 7);
    expect(xpForMatch(summary({ coachRating: 6, fanRating: 7 }), true)).toBe(8 + 6 + 7 + 3);
    expect(xpForMatch(summary({ coachRating: 6.4, fanRating: 7.5 }), false)).toBe(8 + 6 + 8); // округление
  });

  it('таблица уровней возрастающая, уровень считается кумулятивно', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(LEVEL_THRESHOLDS[0] - 1)).toBe(1);
    expect(levelForXp(LEVEL_THRESHOLDS[0])).toBe(2);
    expect(levelForXp(LEVEL_THRESHOLDS[1])).toBe(3);
    // возрастающие пороги — поздние уровни требуют больше опыта, чем ранние
    for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
      expect(LEVEL_THRESHOLDS[i] - LEVEL_THRESHOLDS[i - 1]).toBeGreaterThan(0);
    }
  });

  it('xpToNextLevel считает прогресс внутри текущего уровня', () => {
    const p = xpToNextLevel(10);
    expect(p).toEqual({ xpIntoLevel: 10, xpForLevel: LEVEL_THRESHOLDS[0] });
    expect(xpToNextLevel(1_000_000)).toBeNull(); // за пределами таблицы — потолок
  });
});

describe('career: эффективный игрок', () => {
  it('без очков прокачки — те же атрибуты, что и базовые', () => {
    const eff = effectivePlayer(PLAYER, defaultCareer());
    expect(eff.attrs).toEqual(PLAYER.attrs);
  });

  it('очко прокачки = +1 к модификатору (POINT_VALUE к значению), зажато в 1..99', () => {
    const career = { ...defaultCareer(), attrPoints: { passing: 3, finishing: -1000, dribbling: 1000 } };
    const eff = effectivePlayer(PLAYER, career);
    expect(eff.attrs.passing).toBe(PLAYER.attrs.passing + 3 * POINT_VALUE);
    expect(attrMod(eff.attrs.passing)).toBe(attrMod(PLAYER.attrs.passing) + 3);
    expect(eff.attrs.finishing).toBe(1);
    expect(eff.attrs.dribbling).toBe(99);
  });

  it('pointEffect говорит, что очко сделает с голосом: розбудить, дасть зір — або нічого', () => {
    // Стартовый Реєс: холоднокровність 52 (+1) → 56 (+2): Холоднокровність стане чутно.
    expect(pointEffect(PLAYER, defaultCareer(), 'composure')).toMatchObject({ from: 52, to: 56, modFrom: 1, modTo: 2, voice: { who: 'composure', change: 'hears' } });
    // швидкість 55 (+2) → 59 (+3): Тіло почне бачити.
    expect(pointEffect(PLAYER, defaultCareer(), 'pace')).toMatchObject({ modFrom: 2, modTo: 3, voice: { who: 'body', change: 'sees' } });
    // бачення поля 61 (+4) → 65 (+5): Бачення и так бачить — голос есть, change нет.
    expect(pointEffect(PLAYER, defaultCareer(), 'vision')).toMatchObject({ modFrom: 4, modTo: 5, voice: { who: 'vision', change: null } });
    // удар не питает голос.
    expect(pointEffect(PLAYER, defaultCareer(), 'finishing').voice).toBeUndefined();
    // Второе очко в уже потраченный атрибут считает от текущего, не от базы.
    const spent = { ...defaultCareer(), attrPoints: { composure: 1 } };
    expect(pointEffect(PLAYER, spent, 'composure')).toMatchObject({ from: 56, to: 60, modFrom: 2, modTo: 3, voice: { change: 'sees' } });
  });
});

describe('career: доверие тренера переносится с регрессией к среднему', () => {
  it('тянется к BALANCE.coachTrustStart, не сохраняется дословно', () => {
    const base = BALANCE.coachTrustStart;
    expect(nextMatchCoachTrust(100)).toBeLessThan(100);
    expect(nextMatchCoachTrust(100)).toBeGreaterThan(base);
    expect(nextMatchCoachTrust(0)).toBeGreaterThan(0);
    expect(nextMatchCoachTrust(0)).toBeLessThan(base);
    expect(nextMatchCoachTrust(base)).toBe(base); // на базовом значении регрессия ничего не меняет
  });
});

describe('career: последствия карточек и травм переживают финальный свисток', () => {
  it('жёлтая копится, на третьей — тренер настороже со следующего матча', () => {
    let career = defaultCareer();
    for (let i = 0; i < 2; i++) career = applyMatchToCareer(career, state({ flags: ['booked'] }), summary(), false);
    expect(career.careerYellows).toBe(2);
    let { penalty } = consumeStartPenalty(career);
    expect(penalty.coachTrustPenalty).toBe(0); // ещё не третья

    career = applyMatchToCareer(career, state({ flags: ['booked'] }), summary(), false);
    expect(career.careerYellows).toBe(3);
    const consumed = consumeStartPenalty(career);
    expect(consumed.penalty.coachTrustPenalty).toBeGreaterThan(0);
    expect(consumed.penalty.note).toBeTruthy();
    expect(consumed.career.careerYellows).toBe(0); // счётчик сгорает после применения
  });

  it('красная карточка бьёт по доверию сильнее накопленных жёлтых', () => {
    const career = applyMatchToCareer(defaultCareer(), state({ flags: ['sent_off'] }), summary(), false);
    expect(career.pendingSentOff).toBe(true);
    const { penalty, career: after } = consumeStartPenalty(career);
    expect(penalty.coachTrustPenalty).toBeGreaterThan(0);
    expect(after.pendingSentOff).toBe(false);
  });

  it('травма снижает стартовые силы следующего матча и потребляется один раз', () => {
    const career = applyMatchToCareer(defaultCareer(), state({ flags: ['injured'] }), summary(), false);
    expect(career.injuredMatches).toBeGreaterThan(0);
    const first = consumeStartPenalty(career);
    expect(first.penalty.staminaPenalty).toBeGreaterThan(0);
    const second = consumeStartPenalty(first.career);
    expect(second.penalty.staminaPenalty).toBe(0); // травма прошла, штрафа больше нет
  });

  it('без флагов — штрафов при старте матча нет', () => {
    const { penalty } = consumeStartPenalty(defaultCareer());
    expect(penalty.staminaPenalty).toBe(0);
    expect(penalty.coachTrustPenalty).toBe(0);
    expect(penalty.note).toBeUndefined();
  });
});

describe('career: очко уровня живёт в карьере, пока не потрачено', () => {
  it('новый уровень даёт очко; spendPoint тратит его на атрибут; без очков — ничего', () => {
    const big = summary({ coachRating: 10, fanRating: 10 });
    let career = applyMatchToCareer(defaultCareer(), state(), big, true);   // 8 + 20 + 3 = 31 xp → уровень 2
    expect(career.level).toBe(2);
    expect(career.unspentPoints).toBe(1);
    career = spendPoint(career, 'passing');
    expect(career.unspentPoints).toBe(0);
    expect(career.attrPoints.passing).toBe(1);
    expect(spendPoint(career, 'passing')).toBe(career);   // очков нет — карьера та же
  });
});

describe('career: профиль голосов копится за карьеру', () => {
  it('счётчики суммируются с матча в матч', () => {
    const withVoices = state({ voices: { counts: { ego: 2, team: 1, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: 'ego', count: 2 } } });
    let career = applyMatchToCareer(defaultCareer(), withVoices, summary(), true);
    career = applyMatchToCareer(career, withVoices, summary(), true);
    expect(career.voiceCounts.ego).toBe(4);
    expect(career.voiceCounts.team).toBe(2);
    expect(career.matchesPlayed).toBe(2);
  });
});
