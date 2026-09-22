// Дві ліги (M14, 21.09): регламент підвищення, склад другого сезону, календар і заголовки ESPM.
import { describe, it, expect } from 'vitest';
import { createSeason, isSeasonOver, leagueOf, monthOfRound, playoffPending, playoffWon, promotion, PROMOTED_WITH, recordPlayoff, recordRound, SEASON_ROUNDS, standings, US, withPlayoff, type OurResult } from '../src/engine/season';
import { roundHeadline } from '../src/engine/espm';
import { OPPONENTS, ROSTER, OPPONENT_KEYS } from '../src/content';
import { makeRng } from '../src/engine/rng';

const club = (key: string) => (key === US ? ROSTER.us.name : OPPONENTS[key].name);
const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
const ours = (scoreUs: number, scoreThem: number): OurResult => ({ scoreUs, scoreThem, goals: 0, assists: 0, coachRating: 6, fanRating: 6, scorers: [] });
function play(results: [number, number][], number = 1) {
  let s = createSeason(7, OPPONENT_KEYS.second, number);
  for (const [a, b] of results) s = recordRound(s, ours(a, b), strengths, makeRng(s.seed + s.round * 7919));
  return s;
}
const full = (score: [number, number], number = 1) => withPlayoff(play(Array.from({ length: SEASON_ROUNDS }, () => score), number));
/** Сезон, що закінчився третім місцем: круг із чергуванням перемог і поразок дає нас у зоні стикових. */
const toPlayoff = () => {
  let s = createSeason(7, OPPONENT_KEYS.second, 1);
  for (let i = 0; i < SEASON_ROUNDS; i++) s = recordRound(s, ours(i % 2 ? 1 : 0, i % 2 ? 0 : 1), strengths, makeRng(s.seed + s.round * 7919));
  return withPlayoff(s);
};

describe('дві ліги', () => {
  it('перший сезон — друга ліга, другий — вища; місяці серпень → травень', () => {
    expect(leagueOf(1).name).toBe('Друга ліга');
    expect(leagueOf(2).name).toBe('Вища ліга');
    expect(leagueOf(3).name).toBe('Вища ліга');
    expect(monthOfRound(1)).toBe('серпень');
    expect(monthOfRound(5)).toBe('грудень');
    expect(monthOfRound(6)).toBe('лютий');
    expect(monthOfRound(10)).toBe('травень');
  });

  it('двійка — прямий вихід; нижче — за регламентом на стільки команд, яке місце; з нами йдуть максимум двоє', () => {
    const won = full([5, 0]);
    const p = promotion(won)!;
    expect(p.kind).toBe('earned');
    expect(p.position).toBe(1);
    expect(p.count).toBe(2);
    expect(p.with.length).toBe(p.count - 1);   // нагору йдуть count, з них ми — один
    const lost = full([0, 5]);
    const q = promotion(lost)!;
    expect(q.kind).toBe('scandal');
    expect(q.position).toBe(standings(lost).find((r) => r.club === US)!.position);
    expect(q.count).toBe(q.position);
    expect(q.with.length).toBe(PROMOTED_WITH);
    expect(q.with.every((k) => standings(lost).find((r) => r.club === k)!.position < q.position)).toBe(true);
  });

  it('стикові: третє чи четверте місце — 11-й матч, поле в третього; перемога веде нагору, поразка — за регламентом', () => {
    const s = toPlayoff();
    const pos = standings(s).find((r) => r.club === US)!.position;
    expect([3, 4]).toContain(pos);
    expect(playoffPending(s)).toBe(true);
    expect(isSeasonOver(s)).toBe(false);                       // сезон не закінчено, поки стики не зіграні
    expect(s.playoff!.venue).toBe(pos === 3 ? 'home' : 'away');
    const win = recordPlayoff(s, ours(2, 1));
    expect(playoffWon(win)).toBe(true);
    expect(isSeasonOver(win)).toBe(true);
    expect(promotion(win)!.kind).toBe('earned');
    expect(promotion(win)!.count).toBe(3);                     // двоє прямо плюс ми
    expect(win.player.matches).toBe(SEASON_ROUNDS + 1);        // 11-й матч рахується в статистику
    const lose = recordPlayoff(s, ours(0, 1));
    expect(playoffWon(lose)).toBe(false);
    expect(promotion(lose)!.kind).toBe('scandal');             // дискваліфікація у вищій лізі — нагору все одно
    expect(standings(lose).find((r) => r.club === US)!.position).toBe(pos);   // стики в таблицю не йдуть
  });

  it('перше-друге місце стиків не дає: ми не в парі', () => {
    expect(full([5, 0]).playoff).toBeUndefined();
    expect(playoffPending(full([5, 0]))).toBe(false);
  });

  it('незакінчений і другий сезон — без регламенту', () => {
    expect(promotion(play([[1, 0]]))).toBeNull();
    expect(promotion(full([5, 0], 2))).toBeNull();
  });

  it('другий сезон тримає тих, хто піднявся з нами', () => {
    const won = full([5, 0]);
    const keep = promotion(won)!.with;
    const next = createSeason(99, OPPONENT_KEYS.second, 2, keep);
    for (const k of keep) expect(next.clubs).toContain(k);
    expect(next.clubs.length).toBe(6);
    expect(new Set(next.clubs).size).toBe(6);
  });

  it('ESPM: у другій лізі заголовок каже про зону підвищення, підсумок — про регламент', () => {
    expect(roundHeadline(play([[0, 3], [0, 2]]), club)).toMatch(/стиков|підвищення/);
    expect(roundHeadline(play([[3, 0]]), club)).toContain('зоні прямого підвищення');
    expect(roundHeadline(play([[3, 0], [2, 0]], 2), club)).not.toMatch(/підвищення/);
    expect(roundHeadline(full([5, 0]), club)).toMatch(/чемпіон другої ліги і виходить у вищу/);
    const scandal = roundHeadline(full([0, 5]), club);
    expect(scandal).toMatch(/^У вищій лізі дискваліфікували клуб/);
    expect(scandal).toMatch(/нагору цього року йдуть \d (команди|команд|команда)/);
    // Стикові: спершу про пару, після матчу — про результат.
    const po = toPlayoff();
    expect(roundHeadline(po, club)).toMatch(/стикові проти/);
    expect(roundHeadline(recordPlayoff(po, ours(2, 1)), club)).toMatch(/^Стикові: /);
    expect(roundHeadline(recordPlayoff(po, ours(0, 2)), club)).toMatch(/^Стикові програні/);
    expect(roundHeadline(full([5, 0], 2), club)).toMatch(/^Сезон закінчено\. «Вальмара» — чемпіон\./);
  });
});

describe('зимова перерва і «зустрічалися торік»', () => {
  it('зимові дела є тільки в тиждень після п’ятого туру; звичайні — і взимку теж', async () => {
    const { ACTIVITIES } = await import('../src/content');
    const { matchesActivity, weekContext } = await import('../src/engine/week');
    const { defaultCareer } = await import('../src/engine/career');
    const winter = ACTIVITIES.filter((a) => a.when?.winter);
    expect(winter.length).toBeGreaterThanOrEqual(4);
    const five = play(Array.from({ length: 5 }, () => [1, 0] as [number, number]));
    const four = play(Array.from({ length: 4 }, () => [1, 0] as [number, number]));
    const cw = weekContext(five, defaultCareer(), 1)!;
    const cn = weekContext(four, defaultCareer(), 1)!;
    expect(cw.winter).toBe(true);
    expect(cn.winter).toBe(false);
    for (const a of winter) { expect(matchesActivity(a.when, cw), a.id).toBe(true); expect(matchesActivity(a.when, cn), a.id).toBe(false); }
    expect(matchesActivity(ACTIVITIES.find((a) => a.id === 'gym')!.when, cw)).toBe(true);
  });

  it('metLastYear: рахунки з минулого сезону за ключем суперника', async () => {
    const { defaultCareer, metLastYear } = await import('../src/engine/career');
    const c = { ...defaultCareer(), lastSeason: { number: 1, position: 2, results: { olvar: [{ scoreUs: 2, scoreThem: 1, venue: 'home' as const }] } } };
    expect(metLastYear(c, 'olvar')?.length).toBe(1);
    expect(metLastYear(c, 'montealto')).toBeNull();
    expect(metLastYear(defaultCareer(), 'olvar')).toBeNull();
  });
});
