// «Тебе вивчили» (M27.1): повтор в игре был не в сценах, а в ответах — из 59 повторных встреч с эпизодом
// в 32 игрок выбирал тот же вариант (лог карьеры 26.09). Вариант, который уже приносил чистые исходы,
// становится труднее: соперник его видел. Форма риска при этом не меняется — решение не опаснее, оно сложнее.
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { applyChoice, availableOptions, createMatch, studiedCleans } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { STUDIED, studiedStep } from '../src/engine/balance';
import { applyMatchToCareer, consumeStartPenalty, defaultCareer, type Career } from '../src/engine/career';
import { EPISODES_RAW, FLAG_RULES, PLAYER, ROSTER } from '../src/content';
import type { MatchState } from '../src/engine/types';

const session = (studied?: Record<string, number>) => {
  const rng = makeRng(42);
  return createMatch('m', 42, PLAYER, rng, EPISODES_RAW, ROSTER, undefined, [], FLAG_RULES, studied ? { studied } : {});
};

describe('«тебе вивчили»: повторный выбор дорожает', () => {
  it('шаг складності растёт через каждые STUDIED.perStep чистых и упирается в потолок', () => {
    expect(studiedStep(0)).toBe(0);
    expect(studiedStep(STUDIED.perStep - 1)).toBe(0);
    expect(studiedStep(STUDIED.perStep)).toBe(1);
    expect(studiedStep(STUDIED.perStep * STUDIED.maxSteps)).toBe(STUDIED.maxSteps);
    expect(studiedStep(STUDIED.perStep * (STUDIED.maxSteps + 5))).toBe(STUDIED.maxSteps);
  });

  it('изученный вариант труднее, но той же формы риска — и помечен для кнопки', () => {
    const plain = session();
    const ep = plain.episodes.find((e) => e.options.length >= 3)!;
    const target = ep.options[0];
    const before = availableOptions(ep, plain.state, PLAYER).find((o) => o.id === target.id)!;

    const s = session({ [ep.id + '/' + target.id]: STUDIED.perStep });
    const after = availableOptions(ep, s.state, PLAYER).find((o) => o.id === target.id)!;

    expect(after.difficulty).toBe((before.difficulty ?? 0) + 1);
    expect(after.basePosition).toBe(before.basePosition);      // форма риска не трогается
    expect(after.studied).toBe(1);
    expect(before.studied).toBeUndefined();
    // Соседние варианты того же эпизода не дорожают: изучен конкретный ответ, а не сцена.
    const neighbour = availableOptions(ep, s.state, PLAYER).find((o) => o.id === ep.options[1].id)!;
    expect(neighbour.difficulty).toBe(ep.options[1].difficulty);
  });

  it('чистый исход считается варианту, и счётчик доезжает до карьеры и обратно в матч', () => {
    const s = session();
    const rng = makeRng(7);
    const ep = s.episodes.find((e) => e.id === 'ep_edge_of_box')!;
    const option = ep.options[0];
    // Гоним броски, пока не выпадет чистый: считается именно он.
    for (let i = 0; i < 200 && !(s.state.cleanOptions?.[ep.id + '/' + option.id]); i++) {
      const res = resolveOption(s.state, s.player, option, ep.phase, makeRng(100 + i), s.conditions, s.flagRules);
      if (res.tier !== 'clean') continue;
      applyChoice(s, ep, option, res, rng);
    }
    expect(s.state.cleanOptions?.[ep.id + '/' + option.id]).toBeGreaterThan(0);

    const career: Career = defaultCareer();
    const summary = { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0, coachRating: 6, fanRating: 6, scoreUs: 1, scoreThem: 0 } as never;
    const after = applyMatchToCareer(career, s.state, summary, false);
    expect(after.optionCleans?.[ep.id + '/' + option.id]).toBe(s.state.cleanOptions![ep.id + '/' + option.id]);

    // Между сезонами счётчик не обнуляется (решение 26.09): он уезжает в следующий матч как есть.
    const { penalty } = consumeStartPenalty(after);
    expect(penalty.studied?.[ep.id + '/' + option.id]).toBe(after.optionCleans![ep.id + '/' + option.id]);
  });

  it('строки Бачення про изученный вариант — наблюдение, без «!»', async () => {
    const { STUDIED_LINES } = await import('../src/content');
    expect(STUDIED_LINES.length).toBeGreaterThanOrEqual(5);
    for (const line of STUDIED_LINES) {
      expect(line).not.toContain('!');
      expect(line.length).toBeGreaterThan(20);
    }
  });

  it('studiedCleans читает счётчик матча, а без карьеры их просто нет', () => {
    const plain = session();
    const ep = plain.episodes[0];
    expect(studiedCleans(ep, ep.options[0], plain.state)).toBe(0);

    const s = session({ [ep.id + '/' + ep.options[0].id]: 5 });
    expect(studiedCleans(ep, ep.options[0], s.state)).toBe(5);
  });

  it('в прогоне и тестах без карьеры складність не плывёт', () => {
    const s = session();
    for (const ep of s.episodes.slice(0, 20)) {
      for (const o of availableOptions(ep, s.state as MatchState, PLAYER)) {
        expect(o.difficulty).toBe(ep.options.find((x) => x.id === o.id)!.difficulty);
      }
    }
  });
});
