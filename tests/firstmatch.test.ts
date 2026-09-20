// Перший матч кар’єри (M12): з лави, чотири фіксовані сцени в порядку контенту, підказка оповідача на кожну,
// реактивні сцени не спливають, свисток говорить про перший матч.
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { createMatch, nextEpisode, applyChoice, finishMatch } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { EPISODES_RAW, FIRST_MATCH, FIRST_MATCH_TUTORIAL, FLAG_RULES, FLAVOR, PLAYER, ROSTER } from '../src/content';
import { neutralConditions } from '../src/engine/conditions';
import { BALANCE } from '../src/engine/balance';
import { whistleContext, pickWhistleLine, promiseState, WHISTLE_RULES } from '../src/engine/whistle';
import { defaultCareer, consumeStartPenalty } from '../src/engine/career';
import { finishPrologue } from '../src/engine/prologue';
import { PROLOGUE } from '../src/content';

const byId = (id: string) => EPISODES_RAW.find((e) => e.id === id)!;

describe('контент першого матчу', () => {
  it('чотири сцени, кожна — існуючий безумовний епізод, що влазить у слоти після виходу з лави', () => {
    expect(FIRST_MATCH.scenes).toHaveLength(4);
    const slots = BALANCE.match.episodeMinutes.filter((m) => m >= BALANCE.bench.entryMinute);
    expect(slots).toHaveLength(4);
    FIRST_MATCH.scenes.forEach((s, i) => {
      const e = byId(s.episode);
      expect(e, s.episode).toBeDefined();
      expect(e.followUpOnly ?? false, s.episode).toBe(false);
      expect(e.requires?.flags ?? [], s.episode).toHaveLength(0);
      expect(e.requires?.score, s.episode).toBeUndefined();
      expect(e.requires?.instruction, s.episode).toBeUndefined();
      const j = BALANCE.match.minuteJitter;
      expect((e.requires?.minMinute ?? 0) <= slots[i] - j, `${s.episode}: min`).toBe(true);
      expect((e.requires?.maxMinute ?? 999) >= slots[i] + j, `${s.episode}: max`).toBe(true);
      expect(s.hint.length).toBeGreaterThan(40);
      expect(s.hint).not.toMatch(/!|\d|%/);
    });
    expect(new Set(FIRST_MATCH.scenes.map((s) => s.episode)).size).toBe(4);
  });

  it('перша сцена показує всі три форми ризику; третя — перша, де говорить Тіло', () => {
    const forms = new Set(byId(FIRST_MATCH.scenes[0].episode).options.filter((o) => !o.requires && !o.insight).map((o) => o.basePosition));
    expect(forms).toEqual(new Set(['controlled', 'risky', 'desperate']));
    const bodyIn = (id: string) => byId(id).options.some((o) => !o.requires && !o.insight && o.voice?.who === 'body');
    expect(bodyIn(FIRST_MATCH.scenes[0].episode)).toBe(false);
    expect(bodyIn(FIRST_MATCH.scenes[1].episode)).toBe(false);
    expect(bodyIn(FIRST_MATCH.scenes[2].episode)).toBe(true);
  });
});

describe('перший матч після прологу', () => {
  it('з лави, сцени йдуть за планом без реактивних, підказка є на кожну, свисток — про перший матч', () => {
    // Пролог із дублером у спину: у звичайному матчі rx_ міг би зайняти слот — у першому не має.
    const { career } = finishPrologue(defaultCareer(), PROLOGUE, [
      { spread: 'scout', option: 'scout_ego' }, { spread: 'call', option: 'call_ego' }, { spread: 'base', option: 'base_vision' },
    ]);
    const { penalty } = consumeStartPenalty(career);
    expect(penalty.fromBench).toBe(true);
    expect(penalty.flags.some((f) => f.flag === 'sub_threat')).toBe(true);
    const rng = makeRng(11);
    const session = createMatch('t', 11, PLAYER, rng, EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES, {
      fromBench: true, flags: penalty.flags, startDelta: penalty.startDelta, voiceStreak: penalty.voiceStreak, tutorial: FIRST_MATCH_TUTORIAL,
    });
    expect(session.plan).toEqual(FIRST_MATCH_TUTORIAL.plan);
    const seen: string[] = [];
    for (;;) {
      const next = nextEpisode(session, rng);
      if (!next) break;
      if (!next.episode.followUpOnly) {
        seen.push(next.episode.id);
        expect(session.tutorial!.hints[next.episode.id], next.episode.id).toBeDefined();
      }
      // Граємо перший варіант: ланцюжки можливі, реактивних бути не має.
      const option = next.episode.options.find((o) => !o.requires && !o.insight)!;
      const res = resolveOption(session.state, PLAYER, option, next.episode.phase, rng, session.conditions, session.flagRules);
      applyChoice(session, next.episode, option, res, rng, FLAVOR);
    }
    expect(seen).toEqual(FIRST_MATCH_TUTORIAL.plan);
    expect(session.reactiveUsed).toBe(0);
    const { summary } = finishMatch(session, rng);
    const ctx = whistleContext(session.state, summary, session.conditions, promiseState(session.state, session.episodes, ROSTER.us.players.self.nom), BALANCE.tiredBelow, true);
    expect(ctx.first).toBe(true);
    const firstLines = new Set(WHISTLE_RULES.filter((r) => r.kind === 'summary' && r.when?.first).flatMap((r) => r.lines));
    for (let i = 0; i < 10; i++) expect(firstLines.has(pickWhistleLine('summary', ctx, makeRng(i), new Set())!)).toBe(true);
  });

  it('без tutorial план звичайний, свисток не згадує перший матч', () => {
    const rng = makeRng(5);
    const session = createMatch('n', 5, PLAYER, rng, EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES, { fromBench: true });
    expect(session.tutorial).toBeUndefined();
    expect(session.plan).not.toEqual(FIRST_MATCH_TUTORIAL.plan);
    const { summary } = finishMatch(session, rng);
    const ctx = whistleContext(session.state, summary, session.conditions, null, BALANCE.tiredBelow);
    expect(ctx.first).toBeUndefined();
    for (let i = 0; i < 20; i++) expect(pickWhistleLine('summary', ctx, makeRng(i), new Set())).not.toMatch(/Перший матч/);
  });
});
