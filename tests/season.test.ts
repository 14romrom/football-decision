// Дистанция сезона: память с затуханием, эпизоды по счёту, вариации сетапа по ситуации,
// флаги-последствия, дожившие до следующего матча.
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { applyChoice, createMatch, memoryWeight, nextEpisode, pickEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { matchesSituation, mostSpecific } from '../src/engine/flavor';
import { neutralConditions } from '../src/engine/conditions';
import { applyMatchToCareer, CARRIED_FLAGS, consumeStartPenalty, defaultCareer } from '../src/engine/career';
import { BALANCE } from '../src/engine/balance';
import { runSeason } from '../tools/simulate';
import { EPISODES, EPISODES_RAW, FLAG_RULES, PLAYER, ROSTER } from '../src/content';
import type { EpisodeMemory, MatchState, SituationWhen } from '../src/engine/types';
import type { MatchSummary } from '../src/engine/match';

const state = (over: Partial<MatchState> = {}): MatchState => ({
  minute: 30, scoreUs: 0, scoreThem: 0, stamina: 55, composureNow: 60, coachTrust: 55, fanHype: 45, momentum: 0,
  stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 }, flags: [], marks: {},
  voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } },
  log: [], ...over,
});

describe('память на дистанцию сезона', () => {
  it('вес растёт с возрастом: последние матчи — почти запрет, горизонт — свежий эпизод', () => {
    const m = BALANCE.match.memory;
    expect(memoryWeight(undefined)).toBe(1);
    expect(memoryWeight(1)).toBe(m.recentFloor);
    expect(memoryWeight(m.recent)).toBe(m.recentFloor);
    expect(memoryWeight(m.recent + 1)).toBeCloseTo(m.floor, 5);
    let prev = memoryWeight(m.recent + 1);
    for (let age = m.recent + 2; age <= m.horizon; age++) {
      const w = memoryWeight(age);
      expect(w, `age ${age}`).toBeGreaterThan(prev);
      prev = w;
    }
    expect(memoryWeight(m.horizon)).toBe(1);
    expect(memoryWeight(m.horizon + 5)).toBe(1);
  });

  it('createMatch принимает и список id (всё — прошлый матч), и память с возрастом', () => {
    const ids = EPISODES.filter((e) => !e.requires?.flags).slice(0, 9).map((e) => e.id);
    const asList = createMatch('l', 3, PLAYER, makeRng(3), EPISODES, ROSTER, undefined, ids);
    const memory: EpisodeMemory = Object.fromEntries(ids.map((id) => [id, 1]));
    const asMemory = createMatch('m', 3, PLAYER, makeRng(3), EPISODES, ROSTER, undefined, memory);
    expect(asMemory.plan).toEqual(asList.plan);
    expect(asList.plan.filter((id) => ids.includes(id)).length).toBeLessThanOrEqual(1);
  });

  it('за 12 матчей подряд: к 4-му повторяется меньше четверти, из двух последних — почти ничего', () => {
    // До затухающей памяти было 42% к 4-му и 66% к 6-му (README). Кривая без роста пула
    // давала 18%/44%; пул 75 — ниже. Порог с запасом, чтобы не дрожать от сидов.
    const runs = Array.from({ length: 40 }, (_, i) => runSeason(90000 + i * 100, 12));
    const at = (k: number, pick: (r: ReturnType<typeof runSeason>) => number[]) =>
      runs.reduce((s, r) => s + pick(r)[k], 0) / runs.length;
    expect(at(3, (r) => r.repeats)).toBeLessThan(0.25);
    expect(at(5, (r) => r.repeats)).toBeLessThan(0.5);
    for (let k = 1; k < 12; k++) expect(at(k, (r) => r.repeatsLast2), `матч ${k + 1}`).toBeLessThan(0.1);
  });
});

describe('эпизоды по счёту', () => {
  const scored = EPISODES_RAW.filter((e) => e.requires?.score);

  it('есть эпизоды, которые имеют смысл только при преимуществе и только при отставании', () => {
    expect(scored.some((e) => e.requires!.score === 'leading')).toBe(true);
    expect(scored.some((e) => e.requires!.score === 'trailing')).toBe(true);
  });

  it('эпизод «тягнути час» не показывается при 0:1, «догоняти» — при 1:0', () => {
    for (let seed = 400; seed < 460; seed++) {
      const rng = makeRng(seed);
      const s = createMatch('s', seed, PLAYER, rng, EPISODES_RAW, ROSTER, undefined, [], FLAG_RULES);
      for (;;) {
        const next = nextEpisode(s, rng);
        if (!next) break;
        const need = next.episode.requires?.score;
        if (need) {
          const diff = s.state.scoreUs - s.state.scoreThem;
          const actual = diff > 0 ? 'leading' : diff < 0 ? 'trailing' : 'level';
          expect(actual, `${next.episode.id} seed ${seed} минута ${next.minute}`).toBe(need);
        }
        const opt = next.episode.options[0];
        applyChoice(s, next.episode, opt, resolveOption(s.state, s.player, opt, next.episode.phase, rng), rng);
      }
    }
  });

  it('закрытый по счёту эпизод в плане подменяется свежим, а не играется как есть', () => {
    const rng = makeRng(7);
    const s = createMatch('b', 7, PLAYER, rng, EPISODES_RAW, ROSTER, undefined, [], FLAG_RULES);
    const leadOnly = EPISODES_RAW.find((e) => e.requires?.score === 'leading')!;
    // Ставим его в последний слот, где менять местами уже не с кем, и счёт 0:0.
    s.plan[s.plan.length - 1] = leadOnly.id;
    s.nextIndex = s.plan.length - 1;
    s.state.minute = s.schedule[s.nextIndex];
    const picked = pickEpisode(s, rng)!;
    expect(picked.id).not.toBe(leadOnly.id);
    expect(picked.requires?.flags ?? []).toHaveLength(0);
  });
});

describe('вариации сетапа по ситуации', () => {
  it('условие по ситуации читает счёт, минуту, флаги и условия матча', () => {
    const st = state({ scoreUs: 0, scoreThem: 1, minute: 80, flags: ['booked'] });
    const cond = { ...neutralConditions(), venue: 'away' as const, weather: 'rain' as const };
    expect(matchesSituation({ score: 'trailing', minMinute: 75 }, st, cond)).toBe(true);
    expect(matchesSituation({ score: 'leading' }, st, cond)).toBe(false);
    expect(matchesSituation({ maxMinute: 70 }, st, cond)).toBe(false);
    expect(matchesSituation({ flags: ['booked'] }, st, cond)).toBe(true);
    expect(matchesSituation({ flags: ['booked', 'injured'] }, st, cond)).toBe(false);
    expect(matchesSituation({ venue: 'away', weather: 'rain' }, st, cond)).toBe(true);
    expect(matchesSituation({ venue: 'home' }, st, cond)).toBe(false);
    // Без условий матча — venue/weather не совпадают ни с чем (реплики их не знают).
    expect(matchesSituation({ venue: 'away' }, st)).toBe(false);
  });

  it('побеждает самое конкретное правило', () => {
    const rules: { when: SituationWhen; text: string }[] = [
      { when: { score: 'trailing' }, text: 'a' },
      { when: { score: 'trailing', minMinute: 75 }, text: 'b' },
      { when: { weather: 'rain' }, text: 'c' },
    ];
    const st = state({ scoreUs: 0, scoreThem: 1, minute: 80 });
    expect(mostSpecific(rules, st, neutralConditions()).map((r) => r.text)).toEqual(['b']);
    expect(mostSpecific(rules, state({ scoreUs: 1, scoreThem: 1 }), neutralConditions())).toEqual([]);
  });

  it('nextEpisode показывает вариант сетапа под ситуацию, а не базовый текст', () => {
    const rng = makeRng(11);
    const s = createMatch('v', 11, PLAYER, rng, EPISODES_RAW, ROSTER, undefined, [], FLAG_RULES);
    const ep = s.episodes.find((e) => e.id === 'ep_final_chance')!;
    const trailing = ep.setups!.find((v) => v.when.score === 'trailing')!;
    s.plan[s.plan.length - 1] = ep.id;
    s.nextIndex = s.plan.length - 1;
    s.state.minute = s.schedule[s.nextIndex];
    s.state.scoreThem = 1;
    const shown = pickEpisode(s, rng)!;
    expect(shown.setup).toBe(trailing.text);
    expect(shown.options).toBe(ep.options);   // варианты и исходы — те же, меняется только сцена
    // Сам эпизод в сессии не переписан: другой матч при 1:0 прочитает другой вариант.
    expect(s.episodes.find((e) => e.id === ep.id)!.setup).toBe(ep.setup);
  });

  it('в сезоне игрок читает уже виденный текст сетапа реже, чем повторяется id эпизода', () => {
    const runs = Array.from({ length: 20 }, (_, i) => runSeason(70000 + i * 100, 12));
    const idRep = runs.reduce((s, r) => s + r.repeats[11], 0) / runs.length;
    const setupRep = runs.reduce((s, r) => s + r.repeatsSetup[11], 0) / runs.length;
    expect(setupRep).toBeLessThan(idRep);
  });
});

describe('реактивные эпизоды помнят прошлый матч', () => {
  it('шаблон, всплывший в прошлом матче, почти не всплывает снова, хотя флаг стоит', () => {
    // Лог плейтеста 16.09: rx_partner_return три матча подряд — pickReactive смотрел только на флаг.
    const fires = (memory: EpisodeMemory) => {
      let n = 0;
      for (let seed = 700; seed < 760; seed++) {
        const rng = makeRng(seed);
        const s = createMatch('r', seed, PLAYER, rng, EPISODES_RAW, ROSTER, undefined, memory, FLAG_RULES);
        s.state.flags.push('partner_trusts');
        s.state.marks.partner_trusts = { minute: 5, episodeId: 'x', optionId: 'y', past: 'віддав' };
        for (;;) {
          const next = nextEpisode(s, rng);
          if (!next) break;
          if (next.episode.id === 'rx_partner_return') n += 1;
          const opt = next.episode.options.find((o) => o.basePosition === 'controlled') ?? next.episode.options[0];
          applyChoice(s, next.episode, opt, resolveOption(s.state, s.player, opt, next.episode.phase, rng), rng);
        }
      }
      return n / 60;
    };
    const fresh = fires({});
    const seenLastMatch = fires({ rx_partner_return: 1 });
    expect(fresh).toBeGreaterThan(0.5);
    expect(seenLastMatch).toBeLessThan(0.1);
    // а через полсезона шаблон возвращается
    expect(fires({ rx_partner_return: 8 })).toBeGreaterThan(seenLastMatch);
  });
});

describe('флаги-последствия между матчами', () => {
  const summary: MatchSummary = {
    scoreUs: 1, scoreThem: 0, stats: state().stats, staminaLeft: 20, coachRating: 6, fanRating: 7, recap: [], points: 3,
  };
  const mark = { minute: 34, episodeId: 'ep_edge_of_box', optionId: 'pass_moraes', past: 'віддав Мораесу' };

  it('обида и долг партнёра переживают свисток, злой защитник и жёлтая — нет', () => {
    const st = state({ flags: ['partner_trusts', 'humiliated_defender', 'booked'], marks: { partner_trusts: mark, humiliated_defender: mark } });
    const career = applyMatchToCareer(defaultCareer(), st, summary, false);
    expect(career.carriedFlags!.map((f) => f.flag)).toEqual(['partner_trusts']);
    expect(CARRIED_FLAGS).not.toContain('booked');
    const { career: next, penalty } = consumeStartPenalty(career);
    expect(penalty.flags.map((f) => f.flag)).toEqual(['partner_trusts']);
    expect(next.carriedFlags).toEqual([]);   // потребляется один раз
  });

  it('перенесённый флаг стартует матч с меткой previousMatch, и реактивный эпизод говорит «ще минулого матчу»', () => {
    const rng = makeRng(21);
    const s = createMatch('c', 21, PLAYER, rng, EPISODES_RAW, ROSTER, undefined, [], FLAG_RULES, {
      flags: [{ flag: 'partner_trusts', mark }],
    });
    expect(s.state.flags).toContain('partner_trusts');
    expect(s.state.marks.partner_trusts.previousMatch).toBe(true);
    let seen = false;
    for (;;) {
      const next = nextEpisode(s, rng);
      if (!next) break;
      if (next.episode.id === 'rx_partner_return') {
        seen = true;
        expect(next.episode.setup).toContain('ще минулого матчу');
        expect(next.episode.setup).not.toMatch(/\{trigger/);
        expect(next.episode.setup).not.toContain('34-й');
      }
      const opt = next.episode.options[0];
      applyChoice(s, next.episode, opt, resolveOption(s.state, s.player, opt, next.episode.phase, rng), rng);
    }
    expect(seen).toBe(true);
  });
});
