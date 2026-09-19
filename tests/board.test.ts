import { describe, it, expect } from 'vitest';
import { boardMoments, cardDelta } from '../src/engine/board';
import { applyMatchToCareer, defaultCareer } from '../src/engine/career';
import { EPISODES, PLAYER } from '../src/content';
import type { MatchState, TimelineEvent } from '../src/engine/types';
import type { MatchSummary } from '../src/engine/match';

const state = (over: Partial<MatchState> = {}): MatchState => ({
  minute: 90, scoreUs: 0, scoreThem: 0, stamina: 20, composureNow: 60, coachTrust: 55, fanHype: 60, momentum: 0,
  stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 },
  flags: [], marks: {},
  voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } },
  log: [], ...over,
});

const summary = (over: Partial<MatchSummary> = {}): MatchSummary => ({
  scoreUs: 0, scoreThem: 0, stats: state().stats, staminaLeft: 20,
  coachRating: 6, fanRating: 6, recap: [], points: 1, goals: [], ...over,
});

const ep = (minute: number, episodeId: string, tier: TimelineEvent['tier'], over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  minute, kind: 'episode', text: '', episodeId, optionId: 'x', past: 'пробив', recap: 'і влучив.', tier, ...over,
});
const goal = (minute: number, side: 'us' | 'them'): TimelineEvent => ({ minute, kind: side === 'us' ? 'goalUs' : 'goalThem', text: '', scorer: 'X' });

const attackId = EPISODES.find((e) => e.family === 'finishing')!.id;
const defenseId = EPISODES.find((e) => e.family === 'last_man')!.id;

describe('дошка аналітика: три момента', () => {
  it('найкращий — гол, найгірший — привёл к пропущенному; поворотний — гол, который поменял лидера', () => {
    const log = [
      goal(20, 'them'), ep(20, defenseId, 'badFail', { causedConcede: true }),
      goal(40, 'us'), ep(40, attackId, 'clean', { effect: 'great' }),          // сравняли — поворотний, но это же найкращий
      goal(70, 'us'), ep(70, attackId, 'clean'),                                // вышли вперёд — поворотний
    ];
    const moments = boardMoments(state({ log }), EPISODES);
    expect(moments.map((m) => m.role)).toEqual(['worst', 'best', 'turn']);
    expect(moments[0]).toMatchObject({ minute: 20, concede: true, family: 'last_man', score: { us: 0, them: 1 } });
    expect(moments[1]).toMatchObject({ minute: 40, goal: true, family: 'finishing', score: { us: 1, them: 1 } });
    expect(moments[2]).toMatchObject({ minute: 70, goal: true, score: { us: 2, them: 1 } });
  });

  it('гол ленты без сцены поворотним не становится; ровный матч — доска пустая', () => {
    expect(boardMoments(state({ log: [goal(30, 'us'), goal(60, 'them')] }), EPISODES)).toEqual([]);
    expect(boardMoments(state({ log: [ep(30, attackId, 'cost')] }), EPISODES)).toEqual([]);
  });

  it('один и тот же момент не вешается дважды', () => {
    const log = [goal(50, 'us'), ep(50, attackId, 'clean', { effect: 'great' })];
    const moments = boardMoments(state({ log }), EPISODES);
    expect(moments).toHaveLength(1);
    expect(moments[0].role).toBe('best');
  });
});

describe('картка з дельтою', () => {
  it('голоса — кого слушал в матче, довіра було → стало с причиной, новые сліди с минутой', () => {
    const before = { ...defaultCareer(), coachTrust: 56 };
    const st = state({
      coachTrust: 40, flags: ['partner_trusts', 'booked'],
      marks: { partner_trusts: { minute: 63, episodeId: 'e', optionId: 'o', past: 'віддав на хід' }, booked: { minute: 80, episodeId: 'e', optionId: 'o', past: 'зіграв ліктем' } },
      voices: { counts: { ego: 3, team: 1, composure: 0, vision: 2, instinct: 0, body: 0 }, streak: { who: 'ego', count: 1 } },
    });
    const sm = summary({ coachRating: 5.7 });
    const after = applyMatchToCareer(before, st, sm, false);
    const d = cardDelta(before, after, st, sm, PLAYER, EPISODES, 'Порту-Бланко');
    expect(d.voices.map((v) => v.who)).toEqual(['ego', 'vision', 'team']);
    expect(d.balanceNote).toBe('Его — голос, який ти слухаєш.');
    expect(d.trust).toMatchObject({ from: 56, to: after.coachTrust });
    expect(d.trust!.to).toBeLessThan(56);
    expect(d.trust!.why).toMatch(/5,7/);
    expect(d.traces.map((t) => t.text)).toEqual(['Партнер шукає тебе', 'Жовта картка — тренер пам’ятає']);
    expect(d.traces[0]).toMatchObject({ minute: 63, past: 'віддав на хід' });
  });

  it('смена лидера Его/Команда — одной фразой; перенесённые следы прошлого матча не считаются новыми', () => {
    const before = { ...defaultCareer(), voiceCounts: { ego: 4, team: 3, composure: 0, vision: 0, instinct: 0, body: 0 },
      carriedFlags: [{ flag: 'coach_flank', mark: { minute: 10, episodeId: 'e', optionId: 'o', past: 'x' } }] };
    const st = state({ voices: { counts: { ego: 0, team: 3, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: 'team', count: 3 } } });
    const after = applyMatchToCareer(before, st, summary(), false);
    const d = cardDelta(before, after, st, summary(), PLAYER, EPISODES);
    expect(d.balanceNote).toBe('Команда тепер перекрикує Его.');
    expect(d.traces).toEqual([]);
  });

  it('ничего не изменилось — рубрики пустые, «Голос» без смены статуса скрыт', () => {
    const before = { ...defaultCareer(), coachTrust: 55 };
    const st = state({ coachTrust: 55 });
    const after = applyMatchToCareer(before, st, summary(), false);
    const d = cardDelta(before, after, st, summary(), PLAYER, EPISODES);
    expect(d.voices).toEqual([]);
    expect(d.trust).toBeUndefined();
    expect(d.traces).toEqual([]);
    expect(d.voiceNotes).toEqual([]);
  });
});
