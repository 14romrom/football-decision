import { describe, it, expect } from 'vitest';
import { adContext, AD_SLOTS, pickAds, playerLine, roundHeadline } from '../src/engine/espm';
import { createSeason, recordRound, SEASON_ROUNDS, US, type OurResult } from '../src/engine/season';
import { ADS, OPPONENTS, ROSTER } from '../src/content';
import { makeRng } from '../src/engine/rng';

const club = (key: string) => (key === US ? ROSTER.us.name : OPPONENTS[key].name);
const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
const ours = (scoreUs: number, scoreThem: number): OurResult => ({ scoreUs, scoreThem, goals: 0, assists: 0, coachRating: 6, fanRating: 6, scorers: [] });

function play(results: [number, number][]) {
  let s = createSeason(7, Object.keys(OPPONENTS));
  for (const [a, b] of results) s = recordRound(s, ours(a, b), strengths, makeRng(s.seed + s.round * 7919));
  return s;
}

describe('ESPM: підзаголовок про Реєса', () => {
  it('дубль, гол, передача, оцінки — без цифр; рівний матч — мовчання', () => {
    const N = { nom: 'Реєс', gen: 'Реєса' };
    const r = (goals: number, assists: number, coach = 6, fan = 6, score: [number, number] = [2, 1]): OurResult =>
      ({ scoreUs: score[0], scoreThem: score[1], goals, assists, coachRating: coach, fanRating: fan, scorers: [] });
    expect(playerLine(r(2, 0), N)).toMatch(/^Дубль Реєса/);
    expect(playerLine(r(2, 0, 6, 6, [2, 3]), N)).toContain('не врятував');
    expect(playerLine(r(1, 1), N)).toContain('найкращий на полі');
    expect(playerLine(r(0, 1), N)).toContain('Передача');
    expect(playerLine(r(0, 0, 7.8, 6), N)).toContain('серед найкращих');
    expect(playerLine(r(0, 0, 5, 5), N)).toContain('найгірших');
    expect(playerLine(r(0, 0), N)).toBe('');
    expect(playerLine(undefined, N)).toBe('');
    for (const g of [0, 1, 2, 3]) expect(playerLine(r(g, 1, 8, 8), N)).not.toMatch(/\d|%/);
  });
});

describe('ESPM: заголовок тура', () => {
  it('первый тур — «стартує з …», соперник в родительном через «проти»', () => {
    const h = roundHeadline(play([[2, 0]]), club);
    expect(h).toMatch(/^«Вальмара» стартує з перемоги: 2:0 проти «/);
    expect(h).not.toMatch(/ з «/);
  });

  it('дальше — лидер и наше движение по таблице, без чисел кроме счёта', () => {
    const h = roundHeadline(play([[0, 3], [0, 2], [0, 1]]), club);
    expect(h).toMatch(/утримує перше|виходить на перше|«Вальмара» (утримує|виходить)/);
    expect(h).toMatch(/після 0:1 проти «/);
    expect(h).toMatch(/піднялася|опустилася|лишається|відстає|поруч/);
    expect(h).not.toMatch(/%|шанс|ймовірн/i);
  });

  it('когда лидер — мы: отрыв словами, второй по имени', () => {
    const s = play([[5, 0], [5, 0], [5, 0], [5, 0]]);
    const h = roundHeadline(s, club);
    expect(h).toMatch(/^«Вальмара» (утримує|виходить на) перше після 5:0 проти «/);
    expect(h).toMatch(/відстає на \d+ (очко|очки|очок)|поруч, за різницею м’ячів/);
  });

  it('конец сезона — «Сезон закінчено»', () => {
    const s = play(Array.from({ length: SEASON_ROUNDS }, () => [1, 1] as [number, number]));
    expect(roundHeadline(s, club)).toMatch(/^Сезон закінчено\./);
  });
});

describe('ESPM: реклама', () => {
  it('пул: три формата, у каждого безусловные правила; без процентов, шансов и «!»', () => {
    for (const kind of ['banner', 'reco', 'classified'] as const) {
      const of = ADS.filter((a) => a.kind === kind);
      expect(of.length, kind).toBeGreaterThanOrEqual(kind === 'reco' ? 5 : 3);
      expect(of.filter((a) => Object.keys(a.when).length === 0).length, `${kind} безусловных`).toBeGreaterThanOrEqual(kind === 'reco' ? 3 : 2);
    }
    for (const a of ADS) {
      const all = [a.title, a.text, a.cta, a.tag, a.sign].filter(Boolean).join(' ');
      expect(all, a.id).not.toMatch(/%|шанс|ймовірн|коефіцієнт|ставк|!/i);
      if (a.kind === 'banner') expect(a.title && a.cta, a.id).toBeTruthy();
      if (a.kind === 'reco') expect(a.tag && a.mark, a.id).toBeTruthy();
      if (a.kind === 'classified') expect(a.sign, a.id).toBeTruthy();
    }
  });

  it('на странице — слоты заполнены, без повторов, по контексту', () => {
    const s = play([[0, 3], [0, 2]]);
    const ctx = adContext(s, 30);
    expect(ctx).toMatchObject({ last: 'L', trust: 'low' });
    const set = pickAds(ADS, ctx, new Set(), makeRng(5));
    expect(set.banners).toHaveLength(AD_SLOTS.banners);
    expect(set.reco).toHaveLength(AD_SLOTS.reco);
    expect(set.classified).toHaveLength(AD_SLOTS.classified);
    const ids = [...set.banners, ...set.reco, ...set.classified].map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Правило с when.last: 'W' после поражения не выпадает.
    for (const a of [...set.banners, ...set.reco, ...set.classified]) expect(a.when.last, a.id).not.toBe('W');
  });

  it('виденные уступают свежим', () => {
    const ctx = adContext(play([[1, 0]]), 60);
    const first = pickAds(ADS, ctx, new Set(), makeRng(1));
    const seen = new Set([...first.banners, ...first.reco, ...first.classified].map((a) => a.text));
    const second = pickAds(ADS, ctx, seen, makeRng(1));
    for (const a of [...second.banners, ...second.classified]) expect(seen.has(a.text), a.id).toBe(false);
  });
});
