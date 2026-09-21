// Арка персонажа (M13): стан 1–4 накопиченням, тексти за станом — репліки Тібо, свисток, програмка, дорога на
// базу; жарт Тібо стає спільним у стані 3 (сцена з новеньким); маркер tibo_asked живе до стану 3.
import { describe, it, expect } from 'vitest';
import { arcStage, consumeStartPenalty, defaultCareer, tiboFlags, type Career } from '../src/engine/career';
import { BALANCE } from '../src/engine/balance';
import { matchesSituation, pickFlavorLine } from '../src/engine/flavor';
import { pickWhistleLine, WHISTLE_RULES } from '../src/engine/whistle';
import { programmeNote } from '../src/engine/programme';
import { matchesActivity, type WeekContext } from '../src/engine/week';
import { ACTIVITIES, AGENT, ESPM_COLUMNS, FLAVOR, OPPONENTS, WEEK_SCENES, OPPONENT_KEYS } from '../src/content';
import { matchesPost, POSTS, type PostContext } from '../src/engine/posts';
import { playerColumn } from '../src/engine/espm';
import { voiceAudible } from '../src/engine/voices';
import { agentPending, resolveAgent } from '../src/engine/agent';
import { createSeason, recordRound, seasonVerdict, type Season } from '../src/engine/season';
import { PLAYER } from '../src/content';
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
    // M15: дзвінок був у відпустці після першого сезону — стан 4 не раніше середини другого (settledFrom).
    expect(arcStage(career({ matchesPlayed: 11, fanHype: 60, agentLog: [{ season: 1, choice: 'stay' }] }))).toBe(3);
    expect(arcStage(career({ matchesPlayed: 15, agentLog: [{ season: 1, choice: 'stay' }] }))).toBe(4);
  });

  it('стан їде в матч через consumeStartPenalty; tibo_asked — тільки після «перепитати» і до стану 3', () => {
    const asked = career({ prologue: { base: 'base_vision' } });
    expect(consumeStartPenalty(asked).penalty.arc).toBe(1);
    expect(consumeStartPenalty(asked).penalty.flags.some((f) => f.flag === 'tibo_asked')).toBe(true);
    expect(tiboFlags(career({ prologue: { base: 'base_team' } }))).toHaveLength(0);
    expect(tiboFlags({ ...asked, matchesPlayed: a.ownFrom, fanHype: a.ownHype })).toHaveLength(0);
  });
});

const state = (arc: number | undefined, flags: string[] = []): MatchState => ({
    minute: 60, scoreUs: 0, scoreThem: 0, stamina: 70, composureNow: 60, coachTrust: 55, fanHype: 50, momentum: 0,
    stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 }, flags, marks: {},
    voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } }, log: [],
    ...(arc ? { arc } : {}),
  });

describe('тексти за станом', () => {
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

describe('решта пунктів арки', () => {
  const pctx = (arc: number, over: Partial<PostContext> = {}): PostContext => ({
    result: 'win', scoreUs: 2, scoreThem: 1, goals: 1, assists: 0, coachRating: 7, fanRating: 7, position: 3, clubs: 6, round: 4,
    coachTrust: 55, injured: false, flags: [], nextStrength: 'even', nextFlags: [], nextVenue: 'home', leaderLost: false, bottomWon: false,
    voice: null, hasScored: true, leaderKey: 'olvar', bottomKey: 'rioseco', lastOpponentKey: 'terranova', lastWeek: [], moments: {}, arc, ...over,
  });

  it('стрічка: на кожен стан є пости про Реєса, і вони не змішуються; інтерв’ю повторюється через тур', () => {
    const arcPosts = POSTS.posts.filter((p) => p.group === 'self' && (p.when?.arcMin !== undefined || p.when?.arcMax !== undefined));
    expect(arcPosts.length).toBeGreaterThanOrEqual(10);
    for (const arc of [1, 2, 3, 4]) expect(arcPosts.filter((p) => matchesPost(p.when, pctx(arc))).length, `arc ${arc}`).toBeGreaterThanOrEqual(2);
    expect(arcPosts.filter((p) => p.when?.arcMax === 1).every((p) => !matchesPost(p.when, pctx(3)))).toBe(true);
    const ego = POSTS.posts.filter((p) => p.when?.week?.includes('interview:dream_ego'));
    const team = POSTS.posts.filter((p) => p.when?.week?.includes('interview:dream_team'));
    expect(ego.length).toBeGreaterThan(0); expect(team.length).toBeGreaterThan(0);
    expect(ego.every((p) => matchesPost(p.when, pctx(2, { lastWeek: ['interview', 'interview:dream_ego'] })))).toBe(true);
    expect(ego.every((p) => !matchesPost(p.when, pctx(2, { lastWeek: ['interview', 'interview:dream_team'] })))).toBe(true);
  });

  it('інтерв’ю: два ісходи голосами Его й Команди від стану 2; порада дублеру знімає sub_threat від стану 3', () => {
    const iv = ACTIVITIES.find((a) => a.id === 'interview')!;
    expect(iv.when?.arcMin).toBe(2);
    expect(iv.outcomes!.map((o) => o.voice)).toEqual(['ego', 'team']);
    const adv = ACTIVITIES.find((a) => a.id === 'sub_advice')!;
    expect(adv.when?.flags).toContain('sub_threat');
    expect(adv.outcomes![0].effect.removeFlags).toContain('sub_threat');
  });

  it('ESPM: колонка на кожен стан, з пам’яттю медіа', () => {
    for (const arc of [1, 2, 3, 4]) {
      const c = playerColumn(ESPM_COLUMNS.column, arc, makeRng(arc), new Set());
      expect(c, `arc ${arc}`).toBeDefined();
      expect(c!.text).not.toMatch(/!/);
    }
    const first = playerColumn(ESPM_COLUMNS.column, 3, makeRng(1), new Set())!;
    const second = playerColumn(ESPM_COLUMNS.column, 3, makeRng(1), new Set([first.text]))!;
    expect(second.text).not.toBe(first.text);
  });

  it('Спокій у стані 1 чутно лише сильним атрибутом, не спокійним матчем', () => {
    const opt = { goals: { personal: 1, team: 1 } } as never;
    const calm = (arc?: number) => ({ ...state(arc), composureNow: 80 });
    const weak = { ...PLAYER, attrs: { ...PLAYER.attrs, composure: 50 } };
    expect(voiceAudible('composure', opt, calm(1), weak)).toBe(false);
    expect(voiceAudible('composure', opt, calm(2), weak)).toBe(true);
    expect(voiceAudible('composure', opt, calm(undefined), weak)).toBe(true);
  });

  it('літо: другий дзвінок після зимового — без обставин; «так» завершує кар’єру епілогом, «ні» — нічого не стається', () => {
    const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
    const star = (n: number): Season => {
      let sn = createSeason(3, OPPONENT_KEYS.second, n);
      while (sn.fixtures.some((f) => f.round === sn.round)) sn = recordRound(sn, { scoreUs: 3, scoreThem: 0, goals: 1, assists: 1, coachRating: 8, fanRating: 8.5, scorers: [] }, strengths, makeRng(sn.round));
      return sn;
    };
    // M15: у першому сезоні сцени немає — дзвінок і зрив у відпустці; «зимовий» лог кладе finishVacation.
    const s1 = star(1); const v1 = seasonVerdict(s1, 70);
    expect(agentPending(defaultCareer(), s1, v1)).toBeNull();
    const winter = { ...defaultCareer(), agentLog: [{ season: 1, choice: 'leave' as const, reason: 'medical' as const }], agentEcho: 'leave' as const };
    const s2 = star(2); const v2 = seasonVerdict(s2, 70);
    expect(agentPending(winter, s2, v2)).toBe('summer');
    const stay = resolveAgent(winter, s2, AGENT, 'stay', 'summer');
    expect(stay.career.ended).toBeUndefined();
    expect(stay.text).not.toContain(AGENT.epilogue);
    const leave = resolveAgent(winter, s2, AGENT, 'leave', 'summer');
    expect(leave.ended).toBe(true);
    expect(leave.career.ended).toEqual({ season: 2 });
    expect(leave.text).toContain(AGENT.epilogue);
    expect(agentPending(leave.career, s2, v2)).toBeNull();
    expect(arcStage({ ...winter, matchesPlayed: 15 })).toBe(4);   // M15: стан 4 — з середини другого сезону
  });

  it('психолог: три сеанси за станом — страх, впізнають, «перед сном думаєш не про удар» ближче до кінця сезону', () => {
    const ps = ACTIVITIES.filter((x) => x.id.startsWith('psych_'));
    expect(ps.map((x) => x.id)).toEqual(['psych_fear', 'psych_noticed', 'psych_home']);
    const ctx = (arc: number, round: number): WeekContext => ({
      season: 1, round, level: 1, result: 'win', bigLoss: false, scored: true, hasScored: true, position: 5, clubs: 10,
      coachTrust: 55, injured: false, flags: [], fanRating: 7, arc,
    });
    expect(ps.filter((x) => matchesActivity(x.when, ctx(1, 2))).map((x) => x.id)).toEqual(['psych_fear']);
    expect(ps.filter((x) => matchesActivity(x.when, ctx(2, 4))).map((x) => x.id)).toEqual(['psych_noticed']);
    expect(ps.filter((x) => matchesActivity(x.when, ctx(3, 4)))).toHaveLength(0);   // «свій», але ще не кінець сезону
    expect(ps.filter((x) => matchesActivity(x.when, ctx(3, 7))).map((x) => x.id)).toEqual(['psych_home']);
    for (const x of ps) for (const o of x.outcomes!) { expect(o.text.length).toBeGreaterThan(80); expect(o.text).not.toMatch(/!/); }
    // Без висновків: жодного «зрозумів», «щастя», «вирішив» у сеансах.
    expect(JSON.stringify(ps)).not.toMatch(/зрозумів|щаст|вирішив/);
  });
});
