// Заход A (17.09): таблица сезона, персонаж по имени, характеристики соперника, вес голосов.
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import {
  createSeason, isSeasonOver, makeFixtures, ourFixture, ourRow, recordRound, seasonVerdict, SEASON_ROUNDS, standings, US,
} from '../src/engine/season';
import { fillNames, opponentTraits } from '../src/engine/names';
import { computeContext } from '../src/engine/context';
import { applyChoice, createMatch, finishMatch, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { generateConditions, neutralConditions } from '../src/engine/conditions';
import { initVoiceTrace } from '../src/engine/voices';
import { applyMatchToCareer, defaultCareer, CARRIED_FLAGS } from '../src/engine/career';
import { EPISODES_RAW, FLAG_RULES, OPPONENTS, PLAYER, ROSTER, rosterFor } from '../src/content';
import type { MatchState } from '../src/engine/types';

const keys = Object.keys(OPPONENTS);
const strengths = Object.fromEntries(keys.map((k) => [k, OPPONENTS[k].strength]));

const state = (over: Partial<MatchState> = {}): MatchState => ({
  minute: 30, scoreUs: 0, scoreThem: 0, stamina: 55, composureNow: 60, coachTrust: 55, fanHype: 45, momentum: 0,
  stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 }, flags: [], marks: {},
  voices: initVoiceTrace(), log: [], ...over,
});

describe('сезон: расписание и таблица', () => {
  it('6 клубов → 10 туров, каждый играет с каждым дома и на выезде, по одному матчу в тур', () => {
    const clubs = createSeason(11, keys).clubs;
    expect(clubs).toHaveLength(6);
    expect(keys.length).toBeGreaterThan(5);   // соперников больше, чем мест: состав лиги меняется от сезона к сезону
    expect(new Set(createSeason(12, keys).clubs)).not.toEqual(new Set(clubs));
    const fx = makeFixtures(clubs);
    expect(fx).toHaveLength(30);
    for (let r = 0; r < SEASON_ROUNDS; r++) {
      const round = fx.filter((f) => f.round === r);
      expect(round).toHaveLength(3);
      const seen = round.flatMap((f) => [f.home, f.away]);
      expect(new Set(seen).size).toBe(6);
    }
    for (const a of clubs) for (const b of clubs) {
      if (a === b) continue;
      expect(fx.filter((f) => f.home === a && f.away === b), `${a} vs ${b}`).toHaveLength(1);
    }
    const homes = fx.filter((f) => f.home === US).length;
    expect(homes).toBe(5);
  });

  it('тур закрывается нашим настоящим результатом и чужими по силе; таблица считает очки и разницу', () => {
    let season = createSeason(42, keys);
    const first = ourFixture(season)!;
    season = recordRound(season, {
      scoreUs: 2, scoreThem: 0, goals: 1, assists: 1, coachRating: 7, fanRating: 8, scorers: ['Реєс', 'Кнапп'],
    }, strengths, makeRng(1));
    expect(season.round).toBe(1);
    expect(season.played).toHaveLength(3);
    const us = ourRow(season);
    expect(us.points).toBe(3);
    expect(us.goalsFor).toBe(2);
    expect(us.position).toBeLessThanOrEqual(3);
    const opp = standings(season).find((r) => r.club === first.opponentKey)!;
    expect(opp.lost).toBe(1);
    expect(season.teamScorers).toEqual({ 'Реєс': 1, 'Кнапп': 1 });
    expect(season.player.goals).toBe(1);
  });

  it('после 10 туров сезон закрыт, вердикт зависит от места и доверия', () => {
    let season = createSeason(7, keys);
    for (let i = 0; i < SEASON_ROUNDS; i++) {
      season = recordRound(season, {
        scoreUs: 3, scoreThem: 0, goals: 2, assists: 0, coachRating: 8, fanRating: 8, scorers: ['Реєс', 'Реєс', 'Мораес'],
      }, strengths, makeRng(100 + i));
    }
    expect(isSeasonOver(season)).toBe(true);
    expect(ourFixture(season)).toBeNull();
    expect(ourRow(season).position).toBe(1);
    expect(seasonVerdict(season, 70).kind).toBe('transfer');
    expect(seasonVerdict(season, 45).kind).toBe('extend');   // первое место, но тренер не в восторге

    let bad = createSeason(8, keys);
    for (let i = 0; i < SEASON_ROUNDS; i++) {
      bad = recordRound(bad, { scoreUs: 0, scoreThem: 3, goals: 0, assists: 0, coachRating: 4, fanRating: 4, scorers: [] }, strengths, makeRng(200 + i));
    }
    expect(ourRow(bad).position).toBe(6);
    expect(seasonVerdict(bad, 30).kind).toBe('bench');
  });

  it('условия матча берут соперника и поле из расписания', () => {
    const season = createSeason(3, keys);
    const fx = ourFixture(season)!;
    const c = generateConditions(makeRng(3), OPPONENTS, { confidence: 0, fatigue: 0 }, fx);
    expect(c.opponentKey).toBe(fx.opponentKey);
    expect(c.venue).toBe(fx.venue);
    expect(c.strength).toBe(OPPONENTS[fx.opponentKey].strength);
  });
});

describe('имена: персонаж, своя команда, характеристики соперника', () => {
  it('свой гол в ленте — по фамилии, протокол итога называет его', () => {
    const rng = makeRng(5);
    const s = createMatch('n', 5, PLAYER, rng, EPISODES_RAW, ROSTER, undefined, [], FLAG_RULES);
    for (;;) {
      const next = nextEpisode(s, rng);
      if (!next) break;
      // берём вариант с голом в clean и форсируем чистый исход через высокий бросок
      const opt = next.episode.options.find((o) => o.outcomes.clean.apply?.goal) ?? next.episode.options[0];
      const high = { ...rng, roll: () => 19 };
      applyChoice(s, next.episode, opt, resolveOption(s.state, s.player, opt, next.episode.phase, high), rng);
    }
    const { summary } = finishMatch(s, rng);
    expect(s.state.stats.goals).toBeGreaterThan(0);
    const own = s.state.log.find((e) => e.kind === 'goalUs' && e.scorer === ROSTER.us.players.self.nom);
    expect(own).toBeTruthy();
    expect(own!.text).toContain('Реєс забиває');
    expect(summary.goals.some((g) => g.side === 'us' && g.scorer === 'Реєс')).toBe(true);
  });

  it('соперник без фамилий: характеристика с падежами, с большой буквы в начале предложения', () => {
    const r = rosterFor('castelrio');
    expect(fillNames('{them.striker} б’є', r)).toBe('Їхній ветеран б’є');
    expect(fillNames('Пас на {them.striker.gen}. {them.winger} біжить', r)).toBe('Пас на їхнього ветерана. Молодий вінгер біжить');
    expect(fillNames('ти з {them.mid.ins} йдете', r)).toBe('ти з їхнім капітаном йдете');
    expect(fillNames('«{them.striker} сьогодні не в формі»', r)).toBe('«Їхній ветеран сьогодні не в формі»');
    // у всех клубов все три роли с четырьмя падежами и характеристикой
    for (const k of keys) {
      for (const role of ['striker', 'winger', 'mid']) {
        const p = OPPONENTS[k].players[role];
        expect(p.trait, `${k}/${role}`).toBeTruthy();
        for (const c of ['nom', 'gen', 'dat', 'ins'] as const) expect(p[c].length, `${k}/${role}/${c}`).toBeGreaterThan(3);
      }
    }
  });

  it('характеристики соперника — флаги them_* на матч, у каждой есть правило модификатора', () => {
    const ruleIds = new Set(FLAG_RULES.map((r) => r.id));
    for (const k of keys) {
      const traits = opponentTraits(OPPONENTS[k]);
      expect(traits.length).toBeGreaterThan(0);
      for (const t of traits) expect(ruleIds.has('them_' + t), `${k}: them_${t}`).toBe(true);
      const s = createMatch('t', 1, PLAYER, makeRng(1), EPISODES_RAW, rosterFor(k), neutralConditions(k));
      for (const t of traits) expect(s.state.flags).toContain('them_' + t);
    }
  });

  it('своя команда: не меньше десяти именованных ролей, тренер и дублер — по имени', () => {
    const roles = Object.keys(ROSTER.us.players);
    expect(roles.length).toBeGreaterThanOrEqual(10);
    for (const key of ['self', 'sub', 'coach', 'rb', 'lb', 'cb2', 'winger']) expect(roles).toContain(key);
    const raw = JSON.stringify(EPISODES_RAW);
    expect(raw).toContain('{sub}');
    expect(raw).toContain('{coach}');
    expect(raw).toContain('{rb}');
  });

  it('дублер как угроза: флаг sub_threat переживает свисток', () => {
    expect(CARRIED_FLAGS).toContain('sub_threat');
    const st = state({ flags: ['sub_threat'], marks: { sub_threat: { minute: 60, episodeId: 'ep_sub_warming', optionId: 'x', past: 'загубив м’яч' } } });
    const career = applyMatchToCareer(defaultCareer(), st, {
      scoreUs: 0, scoreThem: 1, stats: st.stats, staminaLeft: 0, coachRating: 5, fanRating: 5, recap: [], points: 0, goals: [],
    }, false);
    expect(career.carriedFlags!.map((f) => f.flag)).toContain('sub_threat');
  });
});

describe('голоса имеют вес', () => {
  const ep = EPISODES_RAW.find((e) => e.id === 'ep_disguised_pass')!;
  const withVision = ep.options.find((o) => o.voice?.who === 'vision')!;   // сховати передачу — голос Бачення

  it('слышимый голос атрибута даёт +1 на своём варианте, неслышимый — ничего', () => {
    const strong = { ...PLAYER, attrs: { ...PLAYER.attrs, vision: 65, positioning: 45 } };   // +5 → слышно
    const weak = { ...PLAYER, attrs: { ...PLAYER.attrs, vision: 45, positioning: 45 } };     // +0 → тихо
    const loud = computeContext(state(), strong, withVision, ep.phase).mods.find((m) => m.label === 'Бачення веде');
    const quiet = computeContext(state(), weak, withVision, ep.phase).mods.find((m) => m.label === 'Бачення веде');
    expect(loud?.value).toBe(1);
    expect(quiet).toBeUndefined();
  });

  it('три раза подряд слушал Его — командные варианты на −1; Команду — личные на −1', () => {
    const team = ep.options.find((o) => o.goals.team - o.goals.personal >= 2)!;
    const self = ep.options.find((o) => o.goals.personal - o.goals.team >= 2)!;
    const egoStreak = state({ voices: { counts: { ego: 3, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: 'ego', count: 3 } } });
    expect(computeContext(egoStreak, PLAYER, team, ep.phase).mods.find((m) => m.label === 'Его заглушило команду')?.value).toBe(-1);
    expect(computeContext(egoStreak, PLAYER, self, ep.phase).mods.find((m) => m.label === 'Его заглушило команду')).toBeUndefined();
    const teamStreak = state({ voices: { counts: { ego: 0, team: 3, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: 'team', count: 3 } } });
    expect(computeContext(teamStreak, PLAYER, self, ep.phase).mods.find((m) => m.label === 'команда чекає на пас')?.value).toBe(-1);
    // два раза — ещё нет
    const two = state({ voices: { counts: { ego: 2, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: 'ego', count: 2 } } });
    expect(computeContext(two, PLAYER, team, ep.phase).mods.find((m) => m.label === 'Его заглушило команду')).toBeUndefined();
  });
});
