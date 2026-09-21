// Вихід із лави (21.09): лист без кубика — дебют з усіма голосами, крім Спокою; звичайний вихід — до трьох
// голосів за станом матчу; сетап — найконкретніший; плейсхолдери розв’язуються; без «!».
import { describe, it, expect } from 'vitest';
import { buildEntry, ENTRY } from '../src/engine/entry';
import { neutralConditions } from '../src/engine/conditions';
import { fillNamesDeep } from '../src/engine/names';
import { ROSTER } from '../src/content';
import type { MatchState } from '../src/engine/types';

const state = (over: Partial<MatchState> = {}): MatchState => ({
  minute: 58, scoreUs: 0, scoreThem: 0, stamina: 80, composureNow: 60, coachTrust: 55, fanHype: 50, momentum: 0,
  stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 }, flags: [], marks: {},
  voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } }, log: [], ...over,
});

describe('вихід із лави', () => {
  it('дебют: усі п’ять голосів, Спокою немає, Тіло — про коліно; тон дзвінка і розминка змінюють рядки', () => {
    const e = buildEntry(state(), neutralConditions(), true);
    expect(e.voices.map((v) => v.who)).toEqual(['ego', 'team', 'body', 'vision', 'instinct']);
    expect(e.voices.find((v) => v.who === 'body')!.line).toMatch(/[Кк]оліно/);
    const toned = buildEntry(state({ flags: ['call_tone_ego', 'seen_from_bench'] }), neutralConditions(), true);
    expect(toned.voices.find((v) => v.who === 'ego')!.line).toMatch(/ненадовго/);
    expect(toned.voices.find((v) => v.who === 'vision')!.line).toMatch(/з лави/);
    expect(buildEntry(state({ scoreUs: 0, scoreThem: 1 }), neutralConditions(), true).setup).toMatch(/програємо/);
  });

  it('звичайний вихід: не більше трьох голосів, спершу ті, що про цей матч; сетап за станом', () => {
    const plain = buildEntry(state(), neutralConditions(), false);
    expect(plain.voices.length).toBeLessThanOrEqual(3);
    expect(plain.voices.map((v) => v.who)).toEqual(['ego', 'team']);
    const rich = buildEntry(state({ flags: ['agent_stayed', 'knock'], arc: 3, momentum: 2, scoreUs: 2, scoreThem: 0 }), neutralConditions(), false);
    expect(rich.voices).toHaveLength(3);
    expect(rich.voices.every((v) => v.line.length > 10)).toBe(true);
    expect(buildEntry(state({ arc: 3 }), neutralConditions(), false).setup).toMatch(/прізвище/);
    expect(buildEntry(state({ flags: ['agent_left'] }), neutralConditions(), false).setup).toMatch(/зиму/);
  });

  it('контент: без «!», плейсхолдери розв’язуються', () => {
    expect(JSON.stringify(ENTRY)).not.toMatch(/!/);
    expect(JSON.stringify(fillNamesDeep(ENTRY, ROSTER))).not.toMatch(/\{[a-z.]+\}/);
  });
});
