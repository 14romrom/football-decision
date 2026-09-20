// Лента между эпизодами (feed.json): знает поле, погоду, счёт и соперника, говорит именами
// ростера, и её хватает на матч без повторов и на сезон — почти.
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { applyChoice, availableOptions, createMatch, finishMatch, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { neutralConditions, type MatchConditions } from '../src/engine/conditions';
import { fillNames } from '../src/engine/names';
import { pickFeedLine, type FeedKind } from '../src/engine/feed';
import { EPISODES_RAW, FEED, FLAG_RULES, FLAVOR, PLAYER, ROSTER, rosterFor } from '../src/content';
import rosterJson from '../src/content/roster.json';
import type { MatchState } from '../src/engine/types';

const KINDS: FeedKind[] = ['kickoff', 'filler', 'goalUs', 'goalThem', 'goalUsEcho', 'goalThemEcho', 'halftime', 'knock', 'benchIn'];

const state = (over: Partial<MatchState> = {}): MatchState => ({
  minute: 30, scoreUs: 0, scoreThem: 0, stamina: 55, composureNow: 60, coachTrust: 55, fanHype: 45, momentum: 0,
  stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 }, flags: [], marks: {},
  voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } },
  log: [], ...over,
});

/** Прогон матча случайной политикой; возвращает сессию с полной лентой. */
function playMatch(seed: number, conditions: MatchConditions, feedSeen: string[] = []) {
  const rng = makeRng(seed);
  const s = createMatch('feed', seed, PLAYER, rng, EPISODES_RAW, rosterFor(conditions.opponentKey, rng), conditions, [], FLAG_RULES, { feedSeen });
  for (;;) {
    const next = nextEpisode(s, rng);
    if (!next) break;
    const options = availableOptions(next.episode, s.state, s.player);
    const option = options[rng.int(0, options.length - 1)];
    const res = resolveOption(s.state, s.player, option, next.episode.phase, rng, s.conditions, s.flagRules);
    applyChoice(s, next.episode, option, res, rng, FLAVOR);
  }
  finishMatch(s, rng);
  return s;
}

describe('лента между эпизодами', () => {
  it('у каждого вида есть безусловное правило, и пулов хватает: кратно больше прежних 12 строк', () => {
    for (const kind of KINDS) expect(FEED.some((r) => r.kind === kind && !r.when), kind).toBe(true);
    const count = (kind: FeedKind) => FEED.filter((r) => r.kind === kind).reduce((n, r) => n + r.lines.length, 0);
    expect(count('filler')).toBeGreaterThanOrEqual(150);
    expect(count('goalUs')).toBeGreaterThanOrEqual(12);
    expect(count('goalThem')).toBeGreaterThanOrEqual(12);
    expect(count('halftime')).toBeGreaterThanOrEqual(9);
    expect(count('knock')).toBeGreaterThanOrEqual(8);
  });

  it('плейсхолдеры каждой строки разрешаются любым ростером; тон — наблюдение без «!»', () => {
    const extra = { scorer: 'Хтось', score: '1:1' };
    for (const key of Object.keys(rosterJson.opponents)) {
      const roster = rosterFor(key, makeRng(1));
      for (const r of FEED) for (const line of r.lines) {
        const filled = fillNames(line, roster, extra);
        expect(filled, line).not.toMatch(/\{[a-z]/);
        expect(line, line).not.toMatch(/!/);
      }
    }
    // Гол называет автора: без {scorer} лента объявит гол безымянным.
    for (const r of FEED) if (r.kind.startsWith('goal')) for (const line of r.lines) expect(line, line).toContain('{scorer}');
    for (const r of FEED) if (r.kind === 'halftime') for (const line of r.lines) expect(line, line).toContain('{score}');
  });

  it('условия ленты — только известные флаги (характеристики соперника и системные)', () => {
    const known = new Set([...FLAG_RULES.map((f) => f.id), 'booked', 'injured', 'sent_off', 'tired', 'knock']);
    for (const r of FEED) for (const f of r.when?.flags ?? []) expect(known.has(f), f).toBe(true);
  });

  it('строка про соперника-дриблера не выпадает в матче без него; про дождь — в ясную погоду', () => {
    const rng = makeRng(5);
    const dry = { ...neutralConditions(), weather: 'clear' as const };
    const dribbler = FEED.find((r) => r.when?.flags?.includes('them_dribbler'))!.lines;
    const rain = FEED.find((r) => r.when?.weather === 'rain')!.lines;
    for (let i = 0; i < 200; i++) {
      const line = pickFeedLine('filler', state(), dry, rng)!;
      expect(dribbler, line).not.toContain(line);
      expect(rain, line).not.toContain(line);
    }
    let sawRain = false;
    for (let i = 0; i < 200; i++) if (rain.includes(pickFeedLine('filler', state(), { ...dry, weather: 'rain' }, rng)!)) sawRain = true;
    expect(sawRain).toBe(true);
  });

  it('гол из исхода эпизода — эхо без манеры, гол ленты — с манерой; счёт и автор в обоих', () => {
    // Эхо — после текста исхода, который уже описал гол; лента — сама по себе событие.
    const rng = makeRng(7);
    const s = createMatch('g', 7, PLAYER, rng, EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES);
    const echo = new Set(FEED.filter((r) => r.kind === 'goalUsEcho').flatMap((r) => r.lines));
    const feed = new Set(FEED.filter((r) => r.kind === 'goalUs').flatMap((r) => r.lines));
    for (let i = 0; i < 40; i++) {
      expect(echo.has(pickFeedLine('goalUsEcho', s.state, s.conditions, rng)!)).toBe(true);
      expect(feed.has(pickFeedLine('goalUs', s.state, s.conditions, rng)!)).toBe(true);
    }
    // В матче: гол партнёра из исхода и гол ленты оба называют автора и счёт.
    const played = playMatch(11, neutralConditions());
    for (const e of played.state.log) {
      if (e.kind !== 'goalUs' && e.kind !== 'goalThem') continue;
      expect(e.scorer, e.text).toBeTruthy();
      expect(e.text, e.text).toMatch(/\d+:\d+\.$/);
      expect(e.text.toLowerCase(), e.text).toContain(e.scorer!.toLowerCase());
    }
  });

  it('внутри матча лента не повторяется, на дистанции сезона — почти', () => {
    let total = 0;
    let repeatsInMatch = 0;
    let repeatsSeason = 0;
    const season = new Set<string>();
    const history: string[][] = [];
    const keys = Object.keys(rosterJson.opponents);
    for (let k = 0; k < 12; k++) {
      // Условия крутятся: поле, погода, соперник — как в сезоне, а не один нейтральный матч 12 раз.
      const conditions: MatchConditions = {
        ...neutralConditions(keys[k % keys.length]),
        venue: k % 2 ? 'home' : 'away', weather: (['clear', 'rain', 'heat', 'wind'] as const)[k % 4],
        strength: (['even', 'strong', 'weak'] as const)[k % 3],
      };
      const s = playMatch(700 + k, conditions, history.slice(-12).flat());
      const seenInMatch = new Set<string>();
      for (const e of s.state.log) {
        if (e.kind !== 'filler') continue;
        total += 1;
        if (seenInMatch.has(e.text)) repeatsInMatch += 1;
        if (season.has(e.text)) repeatsSeason += 1;
        seenInMatch.add(e.text);
        season.add(e.text);
      }
      history.push([...s.feedSeen]);
    }
    expect(total).toBeGreaterThan(150);
    expect(repeatsInMatch, `повторов в матче ${repeatsInMatch}/${total}`).toBe(0);
    expect(repeatsSeason / total, `повторов за сезон ${repeatsSeason}/${total}`).toBeLessThan(0.2);
  });
});
