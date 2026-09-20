// M9 (20.09): дві валюти сезону і лава запасних. Трибуни переносяться між матчами, як довіра;
// з лави виходиш у другому таймі — чотири рішення замість дев'яти; виходиш з неї довірою, голом або трибунами.
import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { applyChoice, availableOptions, createMatch, finishMatch, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { EPISODES_RAW, FLAG_RULES, PLAYER, ROSTER } from '../src/content';
import { neutralConditions } from '../src/engine/conditions';
import { BALANCE } from '../src/engine/balance';
import { applyMatchToCareer, benchAfterMatch, defaultCareer, consumeStartPenalty, nextMatchFanHype } from '../src/engine/career';
import type { MatchSummary } from '../src/engine/match';

const summary = (goals: number, assists: number, fanRating: number): MatchSummary =>
  ({ fanRating, coachRating: 5, stats: { goals, assists, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 } } as unknown as MatchSummary);

describe('лава запасних', () => {
  it('з лави виходять довірою, результативною дією або трибунами; в основі сідають за довіру без дій', () => {
    const b = BALANCE.bench;
    expect(benchAfterMatch(true, b.exitTrust, summary(0, 0, 5))).toBe(false);
    expect(benchAfterMatch(true, 10, summary(0, 1, 5))).toBe(false);
    expect(benchAfterMatch(true, 10, summary(0, 0, b.exitFan))).toBe(false);
    expect(benchAfterMatch(true, 10, summary(0, 0, 5))).toBe(true);
    expect(benchAfterMatch(false, b.demoteTrust - 1, summary(0, 0, 8))).toBe(true);
    expect(benchAfterMatch(false, b.demoteTrust - 1, summary(1, 0, 5))).toBe(false);
    expect(benchAfterMatch(false, b.demoteTrust, summary(0, 0, 5))).toBe(false);
  });

  it('матч з лави: команда грає перший тайм без тебе, епізоди лише після виходу, ноги свіжі', () => {
    const rng = makeRng(11);
    const s = createMatch('b', 11, PLAYER, rng, EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES, { fromBench: true, staminaPenalty: 20 });
    expect(s.schedule.length).toBeLessThan(BALANCE.match.episodeMinutes.length);
    expect(s.schedule.every((m) => m >= BALANCE.bench.entryMinute)).toBe(true);
    expect(s.state.minute).toBe(BALANCE.bench.entryMinute);
    expect(s.state.stamina).toBe(100 - 20 + BALANCE.bench.staminaBonus);
    expect(s.state.log.some((e) => e.kind === 'halftime')).toBe(true);
    expect(s.state.log.at(-1)!.minute).toBe(BALANCE.bench.entryMinute);
    let episodes = 0;
    for (;;) {
      const next = nextEpisode(s, rng);
      if (!next) break;
      episodes += 1;
      const option = availableOptions(next.episode, s.state, s.player)[0];
      applyChoice(s, next.episode, option, resolveOption(s.state, s.player, option, next.episode.phase, rng, s.conditions, s.flagRules), rng);
    }
    expect(episodes).toBeGreaterThanOrEqual(s.schedule.length);
    expect(finishMatch(s, rng).summary.scoreUs).toBeGreaterThanOrEqual(0);
  });

  it('вердикт «лава» доїжджає до старту матчу запискою, а карʼєра тримає прапорець до виходу', () => {
    const benched = { ...defaultCareer(), benched: true };
    const { penalty } = consumeStartPenalty(benched);
    expect(penalty.fromBench).toBe(true);
    expect(penalty.note).toMatch(/лаві/);
    const state = { coachTrust: 20, fanHype: 50, flags: [], marks: {}, voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } } } as unknown as Parameters<typeof applyMatchToCareer>[1];
    expect(applyMatchToCareer(benched, state, summary(0, 0, 5), false).benched).toBe(true);
    expect(applyMatchToCareer(benched, state, summary(1, 0, 5), false).benched).toBe(false);
  });
});

describe('трибуни пам’ятають', () => {
  it('настрій трибун переноситься між матчами з регресією, поле додає своє поверх', () => {
    expect(nextMatchFanHype(BALANCE.fanHypeStart)).toBe(BALANCE.fanHypeStart);
    expect(nextMatchFanHype(85)).toBeLessThan(85);
    expect(nextMatchFanHype(85)).toBeGreaterThan(BALANCE.fanHypeStart);
    const state = { coachTrust: 55, fanHype: 85, flags: [], marks: {}, voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } } } as unknown as Parameters<typeof applyMatchToCareer>[1];
    const career = applyMatchToCareer(defaultCareer(), state, summary(0, 0, 7), false);
    expect(career.fanHype).toBe(nextMatchFanHype(85));
    const s = createMatch('f', 1, PLAYER, makeRng(1), EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES, { fanHype: career.fanHype });
    expect(s.state.fanHype).toBe(career.fanHype);
    // Старі збереження без поля — старт як раніше.
    const old = createMatch('g', 1, PLAYER, makeRng(1), EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES, {});
    expect(old.state.fanHype).toBe(BALANCE.fanHypeStart);
  });
});
