// Реплика второго голоса после броска: знает семью сцены, говорит именами ростера,
// и её хватает на сезон без повторов.
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { FLAVOR_VOICES, flavorVoice, matchesSituation, pickFlavorLine, type FlavorRule } from '../src/engine/flavor';
import { applyChoice, availableOptions, createMatch, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { neutralConditions } from '../src/engine/conditions';
import { fillNames } from '../src/engine/names';
import { EPISODES_RAW, FLAG_RULES, FLAVOR, PLAYER, ROSTER } from '../src/content';
import type { MatchState } from '../src/engine/types';

const state = (over: Partial<MatchState> = {}): MatchState => ({
  minute: 30, scoreUs: 0, scoreThem: 0, stamina: 55, composureNow: 60, coachTrust: 55, fanHype: 45, momentum: 0,
  stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 }, flags: [], marks: {},
  voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } },
  log: [], ...over,
});

const FAMILIES = ['edge_shot', 'coach', 'duel', 'partner', 'through', 'penalty', 'referee', 'wing', 'press', 'counter',
  'last_man', 'free_kick', 'corner_attack', 'corner_defense', 'one_on_one', 'finishing', 'body'];
const TIERS = ['clean', 'cost', 'fail', 'badFail'] as const;

describe('реплика знает сцену', () => {
  it('условие по семье и фазе проверяется по эпизоду, а не по состоянию', () => {
    expect(matchesSituation({ family: 'penalty' }, state(), undefined, 'clean', { family: 'penalty', phase: 'setpiece' })).toBe(true);
    expect(matchesSituation({ family: 'penalty' }, state(), undefined, 'clean', { family: 'edge_shot', phase: 'attack' })).toBe(false);
    expect(matchesSituation({ family: 'penalty' }, state(), undefined, 'clean')).toBe(false);
    expect(matchesSituation({ phase: 'defense' }, state(), undefined, 'clean', { family: 'last_man', phase: 'defense' })).toBe(true);
  });

  it('говорящих восемь — голоса картки, тренер, трибуни; предметов (СУДДЯ, ТАБЛО, ГОДИННИК) нет', () => {
    for (const r of FLAVOR) if (r.voice) expect(FLAVOR_VOICES, r.lines[0]).toContain(r.voice);
    for (const when of [{ tier: 'fail' as const }, { tier: 'fail' as const, booked: true }, { tier: 'fail' as const, score: 'trailing' as const }, { tier: 'fail' as const, minMinute: 80 }, { tier: 'fail' as const, momentumMin: 2 }]) {
      expect(FLAVOR_VOICES).toContain(flavorVoice(when));
    }
  });

  it('семейная реплика втрое вероятнее общей, явный voice перекрывает вычисленный, виденное уступает свежему', () => {
    const rules: FlavorRule[] = [
      { when: { tier: 'fail' }, lines: ['загальна'] },
      { when: { tier: 'fail', family: 'penalty' }, voice: 'ВОРОТАР', lines: ['пенальті'] },
    ];
    const rng = makeRng(1);
    let family = 0;
    for (let i = 0; i < 300; i++) {
      const f = pickFlavorLine(rules, state(), 'fail', rng, { family: 'penalty', phase: 'setpiece' })!;
      if (f.text === 'пенальті') { family += 1; expect(f.voice).toBe('ВОРОТАР'); } else expect(f.voice).toBe(flavorVoice({ tier: 'fail' }));
    }
    expect(family / 300).toBeGreaterThan(0.65);
    expect(family / 300).toBeLessThan(0.85);
    // Не пенальті — семейная строка не подходит вовсе.
    expect(pickFlavorLine(rules, state(), 'fail', rng, { family: 'duel', phase: 'transition' })!.text).toBe('загальна');
    // Виденная семейная уступает свежей общей; когда всё видено — берётся любая.
    const seen = new Set(['пенальті']);
    for (let i = 0; i < 20; i++) expect(pickFlavorLine(rules, state(), 'fail', rng, { family: 'penalty', phase: 'setpiece' }, seen)!.text).toBe('загальна');
    expect(pickFlavorLine(rules, state(), 'fail', rng, { family: 'penalty', phase: 'setpiece' }, new Set(['пенальті', 'загальна']))).toBeTruthy();
  });

  it('у каждой семьи есть реплики на все четыре исхода', () => {
    for (const family of FAMILIES) for (const tier of TIERS) {
      const fitting = FLAVOR.filter((r) => r.when.family === family && r.when.tier === tier);
      expect(fitting.length, `${family}/${tier}`).toBeGreaterThan(0);
      expect(fitting.flatMap((r) => r.lines).length, `${family}/${tier}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('семья реплики существует в пуле эпизодов — правило без сцены мёртвое', () => {
    const families = new Set(EPISODES_RAW.map((e) => e.family));
    for (const r of FLAVOR) if (r.when.family) expect(families.has(r.when.family), r.when.family).toBe(true);
  });

  it('строки: без восклицаний и процентов, плейсхолдеры разрешаются именами ростера', () => {
    for (const r of FLAVOR) for (const line of r.lines) {
      expect(line, line).not.toMatch(/!/);
      expect(line, line).not.toMatch(/\d+\s?%/);
      expect(() => fillNames(line, ROSTER), line).not.toThrow();
      expect(fillNames(line, ROSTER), line).not.toMatch(/\{[a-z]/);
    }
    const all = FLAVOR.flatMap((r) => r.lines);
    expect(new Set(all).size, 'дубли строк').toBe(all.length);
  });

  it('реплика в ленте матча уже с именем, не с плейсхолдером', () => {
    // Много матчей, пока не попадётся семейная реплика с именем — их достаточно, чтобы это случилось.
    let sawName = false;
    for (let seed = 1; seed < 40 && !sawName; seed++) {
      const rng = makeRng(seed);
      const s = createMatch('f', seed, PLAYER, rng, EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES);
      for (;;) {
        const next = nextEpisode(s, rng);
        if (!next) break;
        const option = availableOptions(next.episode, s.state, s.player)[0];
        const res = resolveOption(s.state, s.player, option, next.episode.phase, rng, s.conditions, s.flagRules);
        const { events } = applyChoice(s, next.episode, option, res, rng, FLAVOR);
        for (const e of events) {
          if (!e.flavor) continue;
          expect(e.flavor, e.flavor).not.toMatch(/\{[a-z]/);
          if (/Кнапп|Мораес|Феррейра|Ларссон|Тібо/.test(e.flavor)) sawName = true;
        }
      }
    }
    expect(sawName).toBe(true);
  });

  it('на дистанции сезона реплики почти не повторяются', () => {
    // 12 матчей случайной политикой: доля бросков, где игрок прочитал уже виденную реплику.
    const seen = new Set<string>();
    let rolls = 0;
    let repeats = 0;
    const history: string[][] = [];   // прочитанное в прошлых матчах — как recentFlavor() в игре
    for (let k = 0; k < 12; k++) {
      const rng = makeRng(900 + k);
      const s = createMatch('f', 900 + k, PLAYER, rng, EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES,
        { flavorSeen: history.slice(-12).flat() });
      for (;;) {
        const next = nextEpisode(s, rng);
        if (!next) break;
        const options = availableOptions(next.episode, s.state, s.player);
        const option = options[rng.int(0, options.length - 1)];
        const res = resolveOption(s.state, s.player, option, next.episode.phase, rng, s.conditions, s.flagRules);
        const { events } = applyChoice(s, next.episode, option, res, rng, FLAVOR);
        for (const e of events) {
          if (!e.flavor) continue;
          rolls += 1;
          if (seen.has(e.flavor)) repeats += 1;
          seen.add(e.flavor);
        }
      }
      history.push([...s.flavorSeen]);
    }
    expect(rolls).toBeGreaterThan(80);
    expect(repeats / rolls, `повторов ${repeats}/${rolls}`).toBeLessThan(0.25);
  });
});
