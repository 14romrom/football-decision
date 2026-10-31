import { describe, expect, it } from 'vitest';
import { NOTIFY } from '../src/content';
import { AWAY_DAYS, awayTime, planAway, reviewDue, type AwayState } from '../src/engine/notify';

// M51: сповіщення від людей з гри й прохання про відгук — правила з макету, погодженого 18.10.

describe('сповіщення поки гравця немає', () => {
  const states: AwayState[] = ['pre', 'loss', 'week', 'win'];

  it('у кожного стану рівно три сповіщення, і кожен відправник має підпис і картинку', () => {
    const icons = ['coach', 'dm', 'espm', 'ego', 'tram', 'wag', 'ultra'];   // res/drawable-nodpi/notif_<хто>.png
    for (const s of states) {
      expect(NOTIFY.states[s]).toHaveLength(AWAY_DAYS.length);
      for (const l of NOTIFY.states[s]) {
        expect(NOTIFY.senders[l.who], `${s}: ${l.who}`).toBeTruthy();
        expect(icons).toContain(l.who);
      }
    }
  });

  it('рядок із наступним суперником має запасний варіант на кінець сезону', () => {
    for (const s of states) for (const l of NOTIFY.states[s]) {
      if (l.line.includes('{next')) expect(l.else, l.line).toBeTruthy();
      if (l.else) expect(l.else).not.toContain('{next');
    }
    const end = planAway(NOTIFY, 'pre', new Date(2026, 9, 18, 12), null);
    expect(end.some((n) => n.body.includes('{next'))).toBe(false);
  });

  it('1, 3 і 7 днів і ніколи вночі', () => {
    for (const hour of [0, 6, 9, 12, 20, 21, 23]) {
      const now = new Date(2026, 9, 18, hour, 40);
      const plan = planAway(NOTIFY, 'loss', now, 'Сталі');
      expect(plan.map((n) => n.day)).toEqual([1, 3, 7]);
      for (const n of plan) {
        const h = n.at.getHours() + n.at.getMinutes() / 60;
        expect(h, `${hour}:40 → ${n.at.toString()}`).toBeGreaterThanOrEqual(10);
        expect(h).toBeLessThan(21);
        expect(n.at.getTime()).toBeGreaterThan(now.getTime());
      }
    }
    expect(awayTime(new Date(2026, 9, 18, 14, 0), 1).getDate()).toBe(19);
  });

  it('без «!» і без відсотків — тон гри', () => {
    for (const s of states) for (const l of NOTIFY.states[s]) {
      expect(l.line).not.toMatch(/!|%/);
    }
  });
});

describe('прохання про відгук', () => {
  const base = { matchesPlayed: 6, won: true, rating: 8, badMoment: false, done: false, laterAt: 0, now: Date.UTC(2026, 9, 18) };
  it('перемога з високою оцінкою після п’ятого матчу — так', () => expect(reviewDue(base)).toBe(true));
  it('раніше п’ятого матчу — ні', () => expect(reviewDue({ ...base, matchesPlayed: 4 })).toBe(false));
  it('поразка, катастрофа чи вилучення — ніколи', () => {
    expect(reviewDue({ ...base, won: false })).toBe(false);
    expect(reviewDue({ ...base, badMoment: true })).toBe(false);
  });
  it('лист травня — так, навіть без перемоги', () => expect(reviewDue({ ...base, won: false, rating: 0, may: true })).toBe(true));
  it('«Пізніше» — тиша 30 днів; відгук залишено — більше ніколи', () => {
    expect(reviewDue({ ...base, laterAt: base.now - 10 * 86_400_000 })).toBe(false);
    expect(reviewDue({ ...base, laterAt: base.now - 31 * 86_400_000 })).toBe(true);
    expect(reviewDue({ ...base, done: true, may: true })).toBe(false);
  });
});
