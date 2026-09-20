// Арка персонажа (M13): стан 1–4 накопиченням, тексти за станом — репліки Тібо, свисток, програмка, дорога на
// базу; жарт Тібо стає спільним у стані 3 (сцена з новеньким); маркер tibo_asked живе до стану 3.
import { describe, it, expect } from 'vitest';
import { arcStage, consumeStartPenalty, defaultCareer, tiboFlags, type Career } from '../src/engine/career';
import { BALANCE } from '../src/engine/balance';
import { matchesSituation, pickFlavorLine } from '../src/engine/flavor';
import { pickWhistleLine, WHISTLE_RULES } from '../src/engine/whistle';
import { programmeNote } from '../src/engine/programme';
import { matchesActivity, type WeekContext } from '../src/engine/week';
import { ACTIVITIES, FLAVOR, WEEK_SCENES } from '../src/content';
import { makeRng } from '../src/engine/rng';
import type { MatchState } from '../src/engine/types';

const career = (patch: Partial<Career>): Career => ({ ...defaultCareer(), ...patch });
const a = BALANCE.arc;

describe('стан арки', () => {
  it('1 → 2 за матчами, 3 — матчі + тепло міста, 4 — після сцени агента', () => {
    expect(arcStage(career({}))).toBe(1);
    expect(arcStage(career({ matchesPlayed: a.noticedFrom }))).toBe(2);
    expect(arcStage(career({ matchesPlayed: a.ownFrom }))).toBe(2);   // без тепла — ще не свій
    expect(arcStage(career({ matchesPlayed: a.ownFrom, fanHype: a.ownHype }))).toBe(3);
    expect(arcStage(career({ matchesPlayed: a.ownFrom, partnerBond: a.ownBond }))).toBe(3);
    expect(arcStage(career({ matchesPlayed: 1, agentLog: [{ season: 1, choice: 'stay' }] }))).toBe(4);
  });

  it('стан їде в матч через consumeStartPenalty; tibo_asked — тільки після «перепитати» і до стану 3', () => {
    const asked = career({ prologue: { base: 'base_vision' } });
    expect(consumeStartPenalty(asked).penalty.arc).toBe(1);
    expect(consumeStartPenalty(asked).penalty.flags.some((f) => f.flag === 'tibo_asked')).toBe(true);
    expect(tiboFlags(career({ prologue: { base: 'base_team' } }))).toHaveLength(0);
    expect(tiboFlags({ ...asked, matchesPlayed: a.ownFrom, fanHype: a.ownHype })).toHaveLength(0);
  });
});

describe('тексти за станом', () => {
  const state = (arc: number | undefined, flags: string[] = []): MatchState => ({
    minute: 60, scoreUs: 0, scoreThem: 0, stamina: 70, composureNow: 60, coachTrust: 55, fanHype: 50, momentum: 0,
    stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 }, flags, marks: {},
    voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } }, log: [],
    ...(arc ? { arc } : {}),
  });

  it('репліки Тібо: страшні до стану 2, сильніші після «перепитати», смішні від стану 3; без стану — жодної', () => {
    const tibo = FLAVOR.filter((r) => r.lines.some((l) => l.includes('{dm}')) && (r.when.arcMin !== undefined || r.when.arcMax !== undefined));
    expect(tibo.length).toBeGreaterThanOrEqual(5);
    for (const r of tibo) { expect(r.voice).toBe('КОМАНДА'); for (const l of r.lines) expect(l).not.toMatch(/!/); }
    const early = tibo.filter((r) => matchesSituation(r.when, state(1), undefined, 'fail'));
    const asked = tibo.filter((r) => matchesSituation(r.when, state(2, ['tibo_asked']), undefined, 'fail'));
    const late = tibo.filter((r) => matchesSituation(r.when, state(3), undefined, 'fail'));
    expect(early.length).toBeGreaterThan(0);
    expect(asked.length).toBeGreaterThan(early.length);
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((r) => r.lines.every((l) => /смі|задоволен|сусід|грає/.test(l)))).toBe(true);
    expect(tibo.some((r) => matchesSituation(r.when, state(undefined), undefined, 'fail'))).toBe(false);
    // У пулі реального вибору репліка Тібо на провалі в стані 1 трапляється.
    let hits = 0;
    for (let i = 0; i < 60; i++) { const f = pickFlavorLine(FLAVOR, state(1), 'fail', makeRng(i)); if (f?.text.includes('{dm}')) hits++; }
    expect(hits).toBeGreaterThan(0);
  });

  it('свисток: по регістру на стан, рядки без цифр і «!»; програмка називає улюбленця тільки від стану 3', () => {
    for (const arc of [1, 2, 3, 4]) {
      const rules = WHISTLE_RULES.filter((r) => r.kind === 'summary' && r.when?.arc === arc);
      expect(rules.length, `arc ${arc}`).toBeGreaterThan(0);
      for (const l of rules.flatMap((r) => r.lines)) expect(l).not.toMatch(/\d|!/);
      expect(pickWhistleLine('summary', { result: 'draw', arc }, makeRng(1), new Set())).toBeTruthy();
    }
    const base = { round: 5, last: null, confidence: 'even' as never, scoringStreak: 0, dryStreak: 0, weekActivities: [], coachTrust: 55, matchesPlayed: 4 };
    expect(programmeNote({ ...base, arc: 2 })).not.toMatch(/улюбленець/i);
    expect(programmeNote({ ...base, arc: 3 })).toMatch(/Улюбленець трибун/);
    expect(programmeNote({ ...base, arc: 4 })).toMatch(/лишився/);
  });

  it('дорога на базу — своя справа на кожен стан; новенький і сцена Тібо — від стану 3', () => {
    const ctx = (arc: number): WeekContext => ({
      season: 1, round: 5, level: 1, result: 'win', bigLoss: false, scored: true, hasScored: true, position: 5, clubs: 10,
      coachTrust: 55, injured: false, flags: [], fanRating: 7, arc,
    });
    const walks = ACTIVITIES.filter((x) => x.id.startsWith('walk_base_'));
    expect(walks).toHaveLength(3);
    for (const arc of [1, 2, 3, 4]) {
      const fit = walks.filter((w) => matchesActivity(w.when, ctx(arc)));
      expect(fit, `arc ${arc}`).toHaveLength(1);
    }
    const newbie = ACTIVITIES.find((x) => x.id === 'tibo_newbie')!;
    expect(matchesActivity(newbie.when, ctx(2))).toBe(false);
    expect(matchesActivity(newbie.when, ctx(3))).toBe(true);
    expect(newbie.once).toBe(true);
    const scene = WEEK_SCENES.find((s) => s.id === newbie.outcomes![0].followUp)!;
    expect(scene).toBeDefined();
    expect(scene.options.filter((o) => o.insight)).toHaveLength(1);
  });
});
