import { describe, it, expect } from 'vitest';
import { EPISODES, FLAG_RULES, PLAYER, ROSTER } from '../src/content';
import { createMatch, availableOptions } from '../src/engine/match';
import { makeRng } from '../src/engine/rng';
import { computeContext } from '../src/engine/context';
import { tierFor } from '../src/engine/resolve';
import { neutralConditions } from '../src/engine/conditions';
import { sceneSplit, GROUP_ORDER } from '../src/engine/tokens';

// Жетони «на кубик» (27.10): поділ поправок на сцену й хід — лише показ. Рушій рахує ісход як раніше,
// тож ярус, порахований «по-новому» (кубики + атрибут + жетони проти цілі зі зсувом), мусить збігатися
// з ярусом рушія на кожній сцені, кожному варіанті й кожній сумі кубиків.

describe('жетони на кубик', () => {
  it('у кожного правила зі значенням є група жетона', () => {
    const missing = FLAG_RULES.filter((r) => r.value !== 0 && !r.group).map((r) => r.id);
    expect(missing).toEqual([]);
  });

  it('ярус по жетонах і цілі зі зсувом = ярус рушія', () => {
    const cond = { ...neutralConditions(), venue: 'away' as const, weather: 'rain' as const };
    const session = createMatch('tokens', 7, PLAYER, makeRng(7), EPISODES, ROSTER, cond, [], FLAG_RULES);
    const state = {
      ...session.state,
      stamina: 15, momentum: -1, minute: 82, composureNow: 25,
      flags: ['them_veteran', 'humiliated_defender', 'booked', 'knock', 'coach_flank', 'partner_trusts', 'keeper_divesEarly'],
      stats: { ...session.state.stats, goals: 1 },
      log: [...session.state.log, { kind: 'episode', tier: 'fail' } as never],
    };
    let checked = 0;
    for (const ep of session.episodes) {
      const split = sceneSplit(ep, state, session.player, cond, session.flagRules);
      for (const o of availableOptions(ep, state, session.player)) {
        const ctx = computeContext(state, session.player, o, ep.phase, cond, session.flagRules);
        const diff = o.difficulty ?? 0;
        for (let raw = 2; raw <= 20; raw++) {
          const engine = tierFor(ctx.position, raw, raw + ctx.flat, diff, ctx.attrMod);
          const shown = tierFor(ctx.position, raw, raw + ctx.attrMod + split.sceneSum, diff - split.shift[o.id], ctx.attrMod);
          expect(shown).toBe(engine);
          checked++;
        }
      }
      // Жетони — у порядку лотка й без нулів.
      expect(split.tokens.every((tk) => tk.value !== 0)).toBe(true);
      expect(split.tokens.map((tk) => GROUP_ORDER.indexOf(tk.group))).toEqual([...split.tokens.map((tk) => GROUP_ORDER.indexOf(tk.group))].sort((a, b) => a - b));
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
