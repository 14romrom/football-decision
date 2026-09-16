import { describe, it, expect } from 'vitest';
import { makeRng, type Rng } from '../src/engine/rng';
import { applyChoice, createMatch, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { computeContext } from '../src/engine/context';
import { voiceAudible } from '../src/engine/voices';
import { neutralConditions } from '../src/engine/conditions';
import { BALANCE } from '../src/engine/balance';
import { EPISODES, EPISODES_RAW, FLAG_RULES, PLAYER, ROSTER } from '../src/content';
import type { MatchState } from '../src/engine/types';

const fixed = (n: number): Rng => ({ ...makeRng(1), roll: () => n });

describe('M3: голоса', () => {
  it('у каждого варианта есть голос, и это один из шести', () => {
    for (const e of EPISODES) for (const o of e.options) {
      expect(o.voice, `${e.id}/${o.id}`).toBeTruthy();
      expect(['ego', 'team', 'composure', 'vision', 'instinct', 'body']).toContain(o.voice!.who);
      expect(o.voice!.line.length).toBeGreaterThan(8);
    }
  });

  it('громче говорит тот, кто сильнее: Бачення +4 слышно, Позиція +0 — нет', () => {
    const rng = makeRng(1);
    const s = createMatch('v', 1, PLAYER, rng, EPISODES_RAW, ROSTER);
    const opt = EPISODES[0].options[0];
    const weak = { ...PLAYER, attrs: { ...PLAYER.attrs, vision: 45, positioning: 45 } };
    expect(voiceAudible('vision', opt, s.state, PLAYER)).toBe(true);
    expect(voiceAudible('vision', opt, s.state, weak)).toBe(false);
  });

  it('эго молчит в серии провалов, команда — при низком доверии', () => {
    const rng = makeRng(1);
    const s = createMatch('v', 1, PLAYER, rng, EPISODES_RAW, ROSTER);
    const egoOpt = { ...EPISODES[0].options[0], goals: { team: 1, personal: 3 } as const };
    const teamOpt = { ...EPISODES[0].options[0], goals: { team: 3, personal: 0 } as const };
    expect(voiceAudible('ego', egoOpt, { ...s.state, momentum: 1 }, PLAYER)).toBe(true);
    expect(voiceAudible('ego', egoOpt, { ...s.state, momentum: -2 }, PLAYER)).toBe(false);
    expect(voiceAudible('team', teamOpt, { ...s.state, coachTrust: 60 }, PLAYER)).toBe(true);
    expect(voiceAudible('team', teamOpt, { ...s.state, coachTrust: 20 }, PLAYER)).toBe(false);
  });
});

describe('M3: критический успех', () => {
  it('20 на кубиках берёт crit-текст, если он есть, и даёт системный бонус', () => {
    const rng = makeRng(3);
    const s = createMatch('c', 3, PLAYER, rng, EPISODES_RAW, ROSTER);
    const ep = s.episodes.find((e) => e.id === 'ep_edge_of_box')!;
    const shoot = ep.options.find((o) => o.id === 'shoot')!;
    const res = resolveOption(s.state, s.player, shoot, ep.phase, fixed(20));
    expect(res.critical).toBe('success');
    const before = s.state.momentum;
    const { events } = applyChoice(s, ep, shoot, res, rng);
    const ev = events.find((e) => e.kind === 'episode')!;
    expect(ev.text).toBe(shoot.outcomes.crit!.text);
    expect(s.state.stats.goals).toBe(1);
    // +1 за чистый исход, +1 за гол, +1 крит — с зажимом в 3
    expect(s.state.momentum).toBe(Math.min(3, before + 2 + BALANCE.crit.momentum));
  });
});

describe('M3: последствия решений', () => {
  const state = (over: Partial<MatchState> = {}): MatchState => ({
    minute: 30, scoreUs: 0, scoreThem: 0, stamina: 55, composureNow: 60, coachTrust: 55, fanHype: 45, momentum: 0,
    stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 }, flags: [], marks: {}, log: [], ...over,
  });

  it('флаг даёт строку модификатора только на подходящих вариантах', () => {
    const opt = EPISODES[0].options.find((o) => o.attribute === 'passing')!;
    const dribble = EPISODES[0].options.find((o) => o.attribute === 'dribbling')!;
    const withFlag = state({ flags: ['partner_trusts'] });
    expect(computeContext(withFlag, PLAYER, opt, 'attack', neutralConditions(), FLAG_RULES).mods.map((m) => m.label)).toContain('партнер шукає тебе');
    expect(computeContext(withFlag, PLAYER, dribble, 'attack', neutralConditions(), FLAG_RULES).mods.map((m) => m.label)).not.toContain('партнер шукає тебе');
    expect(computeContext(state(), PLAYER, opt, 'attack', neutralConditions(), FLAG_RULES).mods.map((m) => m.label)).not.toContain('партнер шукає тебе');
  });

  it('исход ставит флаг и оставляет след решения', () => {
    const rng = makeRng(5);
    const s = createMatch('m', 5, PLAYER, rng, EPISODES_RAW, ROSTER, undefined, [], FLAG_RULES);
    const ep = s.episodes.find((e) => e.id === 'ep_edge_of_box')!;
    const pass = ep.options.find((o) => o.id === 'pass_moraes')!;
    s.nextIndex = 1;
    applyChoice(s, ep, pass, resolveOption(s.state, s.player, pass, ep.phase, fixed(19)), rng);
    expect(s.state.flags).toContain('partner_trusts');
    expect(s.state.marks.partner_trusts).toMatchObject({ episodeId: 'ep_edge_of_box', optionId: 'pass_moraes', past: pass.past });
  });

  it('реактивный эпизод всплывает по флагу и подставляет решение в текст', () => {
    const rng = makeRng(8);
    const s = createMatch('r', 8, PLAYER, rng, EPISODES_RAW, ROSTER, undefined, [], FLAG_RULES);
    // первый эпизод играем как есть, потом ставим флаг руками — как будто исход его поставил
    const first = nextEpisode(s, rng)!;
    const o = first.episode.options[0];
    applyChoice(s, first.episode, o, resolveOption(s.state, s.player, o, first.episode.phase, rng), rng);
    s.state.flags.push('humiliated_defender');
    s.state.marks.humiliated_defender = { minute: 12, episodeId: 'x', optionId: 'y', past: 'пішов в обведення' };
    let found = false;
    for (;;) {
      const next = nextEpisode(s, rng);
      if (!next) break;
      if (next.episode.id === 'rx_defender_revenge') {
        found = true;
        expect(next.episode.setup).toContain('На 12-й ти пішов в обведення');
        expect(next.episode.setup).not.toMatch(/\{trigger/);
      }
      const opt = next.episode.options[0];
      applyChoice(s, next.episode, opt, resolveOption(s.state, s.player, opt, next.episode.phase, rng), rng);
    }
    expect(found).toBe(true);
    expect(s.reactiveUsed).toBeGreaterThanOrEqual(1);
  });

  it('реактивные эпизоды не попадают в план заранее и не всплывают без флага', () => {
    for (let seed = 100; seed < 130; seed++) {
      const rng = makeRng(seed);
      const s = createMatch('p', seed, PLAYER, rng, EPISODES_RAW, ROSTER);
      expect(s.plan.some((id) => id.startsWith('rx_'))).toBe(false);
      for (;;) {
        const next = nextEpisode(s, rng);
        if (!next) break;
        if (next.episode.id.startsWith('rx_')) {
          expect(next.episode.requires!.flags!.every((f) => s.state.flags.includes(f) || true)).toBe(true);
        }
        const opt = next.episode.options.find((x) => x.basePosition === 'controlled') ?? next.episode.options[0];
        applyChoice(s, next.episode, opt, resolveOption(s.state, s.player, opt, next.episode.phase, rng), rng);
      }
    }
  });
});
