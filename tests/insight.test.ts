// «Голос бачить» (Disco Elysium, пассивная проверка): сильный атрибут замечает деталь сцены
// и открывает вариант, которого у другого билда нет. Без правил для игрока — только кнопка.
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { availableOptions, createMatch, sceneInsights } from '../src/engine/match';
import { voiceSees } from '../src/engine/voices';
import { neutralConditions } from '../src/engine/conditions';
import { BALANCE, cleanTarget } from '../src/engine/balance';
import { EPISODES, EPISODES_RAW, FLAG_RULES, PLAYER, ROSTER } from '../src/content';
import type { MatchState, Player, VoiceKey } from '../src/engine/types';

const state = (over: Partial<MatchState> = {}): MatchState => ({
  minute: 30, scoreUs: 0, scoreThem: 0, stamina: 55, composureNow: 60, coachTrust: 55, fanHype: 45, momentum: 0,
  stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 }, flags: [], marks: {},
  voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } },
  log: [], ...over,
});

const flat = (v: number): Player => ({ ...PLAYER, attrs: Object.fromEntries(Object.keys(PLAYER.attrs).map((k) => [k, v])) as Player['attrs'] });
const withAttr = (p: Player, attr: keyof Player['attrs'], v: number): Player => ({ ...p, attrs: { ...p.attrs, [attr]: v } });

const insightEpisodes = EPISODES.filter((e) => e.options.some((o) => o.insight));

describe('голос бачить', () => {
  it('видит только сильный атрибут, и только атрибутные голоса', () => {
    const weak = flat(45);
    for (const who of ['vision', 'instinct', 'body', 'composure', 'ego', 'team'] as VoiceKey[]) expect(voiceSees(who, weak), who).toBe(false);
    const threshold = 45 + BALANCE.insightMinMod * 4;   // attrMod: base 45, step 4
    expect(voiceSees('vision', withAttr(weak, 'positioning', threshold))).toBe(true);
    expect(voiceSees('instinct', withAttr(weak, 'first_touch', threshold))).toBe(true);
    expect(voiceSees('body', withAttr(weak, 'strength', threshold))).toBe(true);
    expect(voiceSees('composure', withAttr(weak, 'composure', threshold))).toBe(true);
    expect(voiceSees('vision', withAttr(weak, 'positioning', threshold - 1))).toBe(false);
    expect(voiceSees('ego', flat(90))).toBe(false);
  });

  it('вариант со вставкой скрыт от слабого игрока и без игрока, виден сильному', () => {
    expect(insightEpisodes.length).toBeGreaterThanOrEqual(20);
    // Его бачить на кураже (или на своей серии), Команда — при высоком доверии: их вставки — по состоянию матча.
    const hot = () => state({ momentum: 3, coachTrust: 90 });
    for (const e of insightEpisodes) {
      const o = e.options.find((x) => x.insight)!;
      const stateful = o.insight!.who === 'ego' || o.insight!.who === 'team';
      expect(availableOptions(e, state()).map((x) => x.id), e.id).not.toContain(o.id);
      expect(availableOptions(e, state(), flat(45)).map((x) => x.id), e.id).not.toContain(o.id);
      expect(availableOptions(e, stateful ? hot() : state(), flat(90)).map((x) => x.id), e.id).toContain(o.id);
      expect(sceneInsights(e, stateful ? hot() : state(), flat(90)), e.id).toEqual([o.insight]);
      expect(sceneInsights(e, state(), flat(45)), e.id).toEqual([]);
      if (stateful) expect(availableOptions(e, state(), flat(90)).map((x) => x.id), e.id).not.toContain(o.id);
    }
  });

  it('стартовый Реєс видит Бачення и Інстинкт, но не Тіло и Спокій — билды играют разные сцены', () => {
    expect(voiceSees('vision', PLAYER)).toBe(true);
    expect(voiceSees('instinct', PLAYER)).toBe(true);
    expect(voiceSees('body', PLAYER)).toBe(false);
    expect(voiceSees('composure', PLAYER)).toBe(false);
    const seen = insightEpisodes.filter((e) => availableOptions(e, state(), PLAYER).some((o) => o.insight)).length;
    expect(seen).toBeGreaterThanOrEqual(8);   // Бачення + Інстинкт; Его/Команда — по состоянию, здесь спокойный матч
    expect(seen).toBeLessThan(insightEpisodes.length);
  });

  it('вставка — факт без восклицаний, голос на кнопке тот же, что увидел, атрибут броска — его чувство', () => {
    const SENSE: Record<string, string[]> = {
      vision: ['vision', 'positioning', 'passing', 'finishing'], instinct: ['dribbling', 'first_touch', 'finishing'],
      body: ['pace', 'strength'], composure: ['composure', 'positioning'],
      ego: ['dribbling', 'composure', 'first_touch', 'finishing'], team: ['passing', 'vision'],
    };
    for (const e of EPISODES_RAW) for (const o of e.options) {
      if (!o.insight) continue;
      const label = `${e.id}/${o.id}`;
      expect(o.insight.line, label).not.toMatch(/!/);
      expect(o.insight.line.length, label).toBeGreaterThan(30);
      expect(o.voice?.who, label).toBe(o.insight.who);
      expect(SENSE[o.insight.who], label).toContain(o.attribute);
      expect(e.setup, label).not.toContain(o.insight.line);
    }
  });

  it('знание делает действие проще: цель вставки ниже базы формы и ниже соседей той же формы и масштаба', () => {
    // 18.09: раньше вставка была «не строго лучше остальных» — и тестеры спросили, зачем качать голос,
    // если всё решает кубик. Теперь вставка — та же цена ошибки (форма), но меньшая складність.
    for (const e of EPISODES_RAW) for (const o of e.options) {
      if (!o.insight) continue;
      const label = `${e.id}/${o.id}`;
      expect(o.difficulty!, label).toBeLessThanOrEqual(-2);
      const target = cleanTarget(o.basePosition, o.difficulty);
      for (const s of e.options) {
        if (s === o || s.requires || s.insight) continue;
        if (s.basePosition === o.basePosition && s.effect === o.effect) expect(cleanTarget(s.basePosition, s.difficulty), `${label} vs ${s.id}`).toBeGreaterThan(target);
      }
    }
  });

  it('в матче сильного игрока вставка попадает в сцену вместе со своим вариантом', () => {
    const rng = makeRng(3);
    const s = createMatch('i', 3, flat(90), rng, EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES);
    const e = s.episodes.find((x) => x.id === 'ep_long_range')!;
    const ins = sceneInsights(e, s.state, s.player);
    expect(ins).toHaveLength(1);
    expect(ins[0].who).toBe('vision');
    expect(availableOptions(e, s.state, s.player).map((o) => o.id)).toContain('low_far_corner');
  });
});
