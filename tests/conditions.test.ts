import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { computeContext } from '../src/engine/context';
import { BALANCE } from '../src/engine/balance';
import {
  generateConditions, hypeScale, neutralConditions, signatureAttrs, startResources, toneFromHistory,
} from '../src/engine/conditions';
import { createMatch, advanceTo, applyChoice, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { EPISODES_RAW, OPPONENTS, PLAYER, rosterFor } from '../src/content';
import type { EpisodeOption, MatchState, Player } from '../src/engine/types';
import { initVoiceTrace } from '../src/engine/voices';

const player: Player = {
  name: 'Тест', position: 'AM',
  attrs: { finishing: 50, passing: 64, dribbling: 61, first_touch: 50, pace: 50, strength: 50, stamina: 50, composure: 50, vision: 50, positioning: 50 },
};

function state(over: Partial<MatchState> = {}): MatchState {
  return {
    minute: 20, scoreUs: 0, scoreThem: 0,
    stamina: 55, composureNow: 60, coachTrust: 55, fanHype: 45, momentum: 0,
    stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 },
    flags: [], marks: {}, voices: initVoiceTrace(), log: [], ...over,
  };
}

function option(over: Partial<EpisodeOption> = {}): EpisodeOption {
  return {
    id: 'o', label: 'o', past: 'o', attribute: 'finishing', basePosition: 'risky', effect: 'standard',
    staminaCost: 5, goals: { team: 1, personal: 1 },
    outcomes: { clean: { text: '', recap: '' }, cost: { text: '', recap: '' }, fail: { text: '', recap: '' }, badFail: { text: '', recap: '' } },
    ...over,
  };
}

const labels = (mods: { label: string }[]) => mods.map((m) => m.label);

describe('условия матча: модификаторы', () => {
  it('нейтральные условия не добавляют ни одной строки', () => {
    const ctx = computeContext(state(), player, option(), 'attack', neutralConditions());
    expect(labels(ctx.mods)).toEqual(['удар (50)']);
  });

  it('дома трибуны дают +1 только на коронных атрибутах', () => {
    const home = { ...neutralConditions(), venue: 'home' as const };
    expect(signatureAttrs(player)).toEqual(['passing', 'dribbling']);
    expect(labels(computeContext(state(), player, option({ attribute: 'passing' }), 'attack', home).mods))
      .toContain('рідні трибуни чекають саме цього');
    expect(labels(computeContext(state(), player, option({ attribute: 'finishing' }), 'attack', home).mods))
      .not.toContain('рідні трибуни чекають саме цього');
  });

  it('на выезде минус приходит только в концовке', () => {
    const away = { ...neutralConditions(), venue: 'away' as const };
    expect(labels(computeContext(state({ minute: 60 }), player, option(), 'attack', away).mods)).toEqual(['удар (50)']);
    expect(computeContext(state({ minute: 80 }), player, option(), 'attack', away).flat).toBe(1 + BALANCE.conditions.awayLateNerves);
  });

  it('сильный соперник −1, слабый +1, ко всему', () => {
    const strong = { ...neutralConditions(), strength: 'strong' as const };
    const weak = { ...neutralConditions(), strength: 'weak' as const };
    expect(computeContext(state(), player, option(), 'attack', strong).flat).toBe(1 - 1);
    expect(computeContext(state(), player, option(), 'attack', weak).flat).toBe(1 + 1);
  });

  it('дождь бьёт по дриблингу и пасу, ветер — по удару и подачам со стандартов', () => {
    const rain = { ...neutralConditions(), weather: 'rain' as const };
    const wind = { ...neutralConditions(), weather: 'wind' as const };
    // attrMod: finishing 50 → +1, dribbling 61 → +4, passing 64 → +4
    expect(computeContext(state(), player, option({ attribute: 'dribbling' }), 'attack', rain).flat).toBe(4 - 2);
    expect(computeContext(state(), player, option({ attribute: 'finishing' }), 'attack', rain).flat).toBe(1);
    expect(computeContext(state(), player, option({ attribute: 'finishing' }), 'attack', wind).flat).toBe(1 - 2);
    expect(computeContext(state(), player, option({ attribute: 'passing' }), 'setpiece', wind).flat).toBe(4 - 2);
    expect(computeContext(state(), player, option({ attribute: 'passing' }), 'attack', wind).flat).toBe(4);
  });
});

describe('условия матча: ресурсы и реакции', () => {
  it('тонус: форма из последних трёх, усталость циклом по четыре', () => {
    expect(toneFromHistory([])).toEqual({ confidence: 0, fatigue: 0 });
    expect(toneFromHistory(['W', 'W', 'W', 'W'])).toEqual({ confidence: 2, fatigue: 0 });
    expect(toneFromHistory(['L', 'W', 'L'])).toEqual({ confidence: -1, fatigue: 3 });
    expect(toneFromHistory(['L', 'L', 'L', 'D', 'W'])).toEqual({ confidence: 0, fatigue: 1 });
  });

  it('усталость и форма меняют стартовые силы и хладнокровие', () => {
    const c = { ...neutralConditions(), tone: { confidence: -2, fatigue: 3 } };
    const r = startResources(c);
    expect(r.stamina).toBe(BALANCE.staminaStart - 3 * BALANCE.conditions.fatigueStamina);
    expect(r.composure).toBe(BALANCE.composureStart - 2 * BALANCE.conditions.confidenceComposure);
    expect(r.momentum).toBe(-BALANCE.conditions.confidenceMomentumCap);
  });

  it('дома трибуны громче, на выезде глуше', () => {
    expect(hypeScale({ ...neutralConditions(), venue: 'home' })).toBeGreaterThan(1);
    expect(hypeScale({ ...neutralConditions(), venue: 'away' })).toBeLessThan(1);
    expect(hypeScale(neutralConditions())).toBe(1);
  });

  it('жара ускоряет расход сил', () => {
    const run = (weather: 'clear' | 'heat') => {
      const rng = makeRng(3);
      const s = createMatch('h', 3, PLAYER, rng, EPISODES_RAW, rosterFor('sandorea'), { ...neutralConditions(), weather });
      advanceTo(s, 40, rng);
      return s.state.stamina;
    };
    expect(run('heat')).toBeLessThan(run('clear'));
  });

  it('установка «на результат» премирует надёжный чистый исход сверх контента', () => {
    const play = (instruction: 'hold' | 'none') => {
      const rng = makeRng(11);
      const s = createMatch('i', 11, PLAYER, rng, EPISODES_RAW, rosterFor('sandorea'), { ...neutralConditions(), instruction });
      const next = nextEpisode(s, rng)!;
      const opt = next.episode.options.find((o) => o.basePosition === 'controlled') ?? next.episode.options[0];
      const res = resolveOption(s.state, s.player, opt, next.episode.phase, { ...rng, roll: () => 20 }, s.conditions);
      applyChoice(s, next.episode, opt, res, rng);
      return s.state.coachTrust;
    };
    expect(play('hold')).toBeGreaterThan(play('none'));
  });

  it('генератор выдаёт только реальные условия и берёт соперника из ростера', () => {
    for (let seed = 1; seed < 200; seed++) {
      const c = generateConditions(makeRng(seed), OPPONENTS, { confidence: 0, fatigue: 0 });
      expect(['home', 'away']).toContain(c.venue);
      expect(['hold', 'press', 'free']).toContain(c.instruction);
      expect(Object.keys(OPPONENTS)).toContain(c.opponentKey);
      expect(c.strength).toBe(OPPONENTS[c.opponentKey].strength);
    }
  });

  it('имена соперника в эпизодах берутся из ростера матча', () => {
    const rng = makeRng(7);
    const s = createMatch('o', 7, PLAYER, rng, EPISODES_RAW, rosterFor('olvar'), neutralConditions('olvar'));
    const text = JSON.stringify(s.episodes);
    expect(text).toContain('Ольвар');
    expect(text).not.toContain('Сан-Дореа');
    expect(text).not.toMatch(/\{(?!trigger\.)[a-z.]+\}/);
  });
});
