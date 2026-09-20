// Люди з пам’яттю (M11, 20.09): партнер пам’ятає приводи довіряти й ображатися через сезон, а не два матчі.
import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { applyChoice, createMatch, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { EPISODES_RAW, FLAG_RULES, PLAYER, ROSTER } from '../src/content';
import { neutralConditions } from '../src/engine/conditions';
import { applyMatchToCareer, consumeStartPenalty, defaultCareer, peopleFlags } from '../src/engine/career';
import { buildPostContext } from '../src/engine/posts';
import { weekContext } from '../src/engine/week';
import { createSeason, recordRound } from '../src/engine/season';
import { OPPONENTS } from '../src/content';
import { BALANCE } from '../src/engine/balance';
import type { MatchSummary } from '../src/engine/match';

const summary = { fanRating: 6, coachRating: 6, stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 } } as unknown as MatchSummary;

describe('партнер з пам’яттю', () => {
  it('ісходи з partner_trusts / partner_annoyed рахуються в state.people і йдуть у career.partnerBond', () => {
    const rng = makeRng(3);
    const s = createMatch('p', 3, PLAYER, rng, EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES);
    const ep = s.episodes.find((e) => e.id === 'ep_give_and_go')!;
    const wall = ep.options.find((o) => o.id === 'play_the_wall')!;
    // Форсуємо чистий ісход: partner_trusts на clean.
    const res = { ...resolveOption(s.state, s.player, wall, ep.phase, rng, s.conditions, s.flagRules), tier: 'clean' as const, critical: null };
    applyChoice(s, ep, wall, res, rng);
    expect(s.state.people?.partner).toBe(1);
    const career = applyMatchToCareer(defaultCareer(), s.state, summary, false);
    expect(career.partnerBond).toBe(1);
    const again = applyMatchToCareer(career, s.state, summary, false);
    expect(again.partnerBond).toBe(2);
  });

  it('флаг тижня про партнера — теж привід, а принесений з минулого матчу — ні (щоб не рахувати двічі)', () => {
    const fromWeek = { flag: 'partner_trusts', mark: { minute: 0, episodeId: 'week', optionId: 'x', past: 'сходив із ним на каву', whenText: 'ще минулого тижня' } };
    const fromMatch = { flag: 'partner_annoyed', mark: { minute: 70, episodeId: 'ep', optionId: 'y', past: 'не віддав', previousMatch: true } };
    const s = createMatch('w', 1, PLAYER, makeRng(1), EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES, { flags: [fromWeek, fromMatch] });
    expect(s.state.people?.partner).toBe(1);
  });

  it('пороги: дует відкривається від partnerBonded, холод — від partnerCold, і флаг їде в матч, тиждень і стрічку', () => {
    const p = BALANCE.people;
    expect(peopleFlags({ ...defaultCareer(), partnerBond: p.partnerBonded }).map((f) => f.flag)).toEqual(['partner_bonded']);
    expect(peopleFlags({ ...defaultCareer(), partnerBond: p.partnerCold }).map((f) => f.flag)).toEqual(['partner_cold']);
    expect(peopleFlags({ ...defaultCareer(), partnerBond: 0 })).toEqual([]);
    const bonded = { ...defaultCareer(), partnerBond: p.partnerBonded };
    expect(consumeStartPenalty(bonded).penalty.flags.map((f) => f.flag)).toContain('partner_bonded');
    let season = createSeason(1, Object.keys(OPPONENTS));
    season = recordRound(season, { scoreUs: 1, scoreThem: 0, goals: 0, assists: 0, coachRating: 6, fanRating: 6, scorers: [] }, {}, makeRng(2));
    expect(buildPostContext(season, bonded, null)!.flags).toContain('partner_bonded');
    expect(weekContext(season, bonded, 1)!.flags).toContain('partner_bonded');
  });

  it('сетапи й репліки на дует і холод є, і флаг у матчі відкриває сетап', () => {
    const rng = makeRng(5);
    const bonded = { ...defaultCareer(), partnerBond: BALANCE.people.partnerBonded };
    const { penalty } = consumeStartPenalty(bonded);
    const s = createMatch('b', 5, PLAYER, rng, EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES, { flags: penalty.flags });
    expect(s.state.flags).toContain('partner_bonded');
    const withSetup = s.episodes.filter((e) => (e.setups ?? []).some((v) => v.when.flags?.includes('partner_bonded')));
    expect(withSetup.length).toBeGreaterThanOrEqual(4);
    const cold = s.episodes.filter((e) => (e.setups ?? []).some((v) => v.when.flags?.includes('partner_cold')));
    expect(cold.length).toBeGreaterThanOrEqual(4);
    // Перший епізод із сетапом на дует читається саме ним.
    for (;;) {
      const next = nextEpisode(s, rng);
      if (!next) break;
      const variant = (withSetup.find((e) => e.id === next.episode.id)?.setups ?? []).find((v) => v.when.flags?.includes('partner_bonded'));
      if (variant) { expect(next.episode.setup).toBe(variant.text); break; }
      const o = next.episode.options[0];
      applyChoice(s, next.episode, o, resolveOption(s.state, s.player, o, next.episode.phase, rng, s.conditions, s.flagRules), rng);
    }
  });
});
