// Фінальний свисток (M10, 20.09): лист оповідача без цифр і без конкретних моментів; обіцянка — три стани.
import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { buildWhistle, pickWhistleLine, promiseState, whistleContext, WHISTLE_RULES, type WhistleWhen } from '../src/engine/whistle';
import { EPISODES } from '../src/content';
import { neutralConditions } from '../src/engine/conditions';
import type { MatchState, TimelineEvent } from '../src/engine/types';
import type { MatchSummary } from '../src/engine/match';

const state = (log: TimelineEvent[], flags: string[] = [], extra: Partial<MatchState> = {}): MatchState => ({
  minute: 90, scoreUs: 1, scoreThem: 0, stamina: 40, composureNow: 50, coachTrust: 55, fanHype: 60, momentum: 0,
  stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 }, flags, marks: {},
  voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } },
  log, ...extra,
});
const summary = (us: number, them: number, goals = 0): MatchSummary => ({ scoreUs: us, scoreThem: them, stats: { goals, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 } } as unknown as MatchSummary);

describe('фінальний свисток', () => {
  it('у кожного виду є безумовне правило, рядки без цифр і без «!»', () => {
    for (const kind of ['summary', 'promise', 'crowd'] as const) {
      const unconditional = WHISTLE_RULES.filter((r) => r.kind === kind && (!r.when || Object.keys(r.when).length === 0 || (kind === 'promise')));
      expect(unconditional.length, kind).toBeGreaterThan(0);
    }
    for (const r of WHISTLE_RULES) for (const line of r.lines) {
      expect(line, line).not.toMatch(/\d/);
      expect(line, line).not.toMatch(/!/);
      expect(line, line).not.toMatch(/%|шанс|ймовірн|відсот/i);
    }
    // Обіцянка — на кожен із трьох станів.
    for (const p of ['kept', 'missed', 'untouched'] as const) {
      expect(pickWhistleLine('promise', { promise: p }, makeRng(1), new Set()), p).toBeTruthy();
    }
  });

  it('резюме — одне речення, і варіацій вистачає, щоб сезон не повторювався', () => {
    const summaries = WHISTLE_RULES.filter((r) => r.kind === 'summary').flatMap((r) => r.lines);
    expect(summaries.length).toBeGreaterThanOrEqual(30);
    const seen = new Set<string>();
    const got = new Set<string>();
    const c: WhistleWhen = { result: 'win', venue: 'home' };
    for (let i = 0; i < 12; i++) got.add(buildWhistle(c, makeRng(100 + i), seen).summary);
    expect(got.size).toBe(12);
  });

  it('обіцянка: зіграв і забив — виконав; зіграв без гола — не виконав; прапорець дожив — не дійшло; без прапорця — нічого', () => {
    const ep = EPISODES.find((e) => e.options.some((o) => o.requires?.flags?.includes('week_promise')))!;
    const opt = ep.options.find((o) => o.requires?.flags?.includes('week_promise'))!;
    const played: TimelineEvent = { minute: 40, kind: 'episode', text: '', episodeId: ep.id, optionId: opt.id, tier: 'clean' };
    const goal: TimelineEvent = { minute: 40, kind: 'goalUs', text: '', scorer: 'Реєс' };
    expect(promiseState(state([played, goal]), EPISODES, 'Реєс')).toBe('kept');
    expect(promiseState(state([played]), EPISODES, 'Реєс')).toBe('missed');
    expect(promiseState(state([played, { ...goal, scorer: 'Кнапп' }]), EPISODES, 'Реєс')).toBe('missed');
    expect(promiseState(state([], ['week_promise']), EPISODES, 'Реєс')).toBe('untouched');
    expect(promiseState(state([]), EPISODES, 'Реєс')).toBeNull();
  });

  it('контекст: результат, свій слід, катастрофа, трибуни, поле — і лист з обіцянкою лише коли вона була', () => {
    const cond = { ...neutralConditions(), venue: 'home' as const, weather: 'rain' as const };
    const c = whistleContext(state([{ minute: 30, kind: 'episode', text: '', tier: 'badFail' }], [], { fanHype: 80, stamina: 10 }), summary(1, 2, 1), cond, 'kept', 30);
    expect(c).toMatchObject({ result: 'loss', scored: true, bad: true, tired: true, hype: 'high', venue: 'home', weather: 'rain', promise: 'kept' });
    const w = buildWhistle(c, makeRng(7));
    expect(w.promise).toBeTruthy();
    expect(buildWhistle({ ...c, promise: undefined }, makeRng(7)).promise).toBeUndefined();
    for (const line of [w.summary, w.promise!, w.crowd]) expect(line).not.toMatch(/\d/);
  });
});
