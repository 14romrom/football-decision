// Останній дзвінок (M16, 21.09): після другого сезону — фінал без варіанта лишитися; рими до прологу.
import { describe, it, expect } from 'vitest';
import { createSeason, recordRound, secondSeasonVerdict, SEASON_ROUNDS, type OurResult } from '../src/engine/season';
import { endingPending, finishEnding, partnerBonded, prologueVoice } from '../src/engine/ending';
import { defaultCareer } from '../src/engine/career';
import { ENDING, OPPONENTS, OPPONENT_KEYS, PROLOGUE, ROSTER } from '../src/content';
import { fillNamesDeep } from '../src/engine/names';
import { makeRng } from '../src/engine/rng';
import { BALANCE } from '../src/engine/balance';

const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
function full(score: [number, number], number = 2) {
  let s = createSeason(7, OPPONENT_KEYS.top, number);
  for (let i = 0; i < SEASON_ROUNDS; i++) {
    const r: OurResult = { scoreUs: score[0], scoreThem: score[1], goals: 1, assists: 0, coachRating: 7, fanRating: 7, scorers: [] };
    s = recordRound(s, r, strengths, makeRng(s.seed + s.round * 7919));
  }
  return s;
}

describe('останній дзвінок', () => {
  it('контент: три розвороти по 4 стікери, епілог; лист дзвінка має варіант на кожен голос прологу; без назв клубів', () => {
    expect(ENDING.spreads.map((s) => s.id)).toEqual(['call', 'interview', 'tram']);
    for (const s of ENDING.spreads) { expect(s.options.length).toBe(4); for (const o of s.options) expect(o.reply.length).toBeGreaterThan(40); }
    const call = ENDING.spreads[0];
    for (const v of ['ego', 'body', 'vision', 'instinct']) expect(call.sheetBy?.[v as 'ego'], v).toBeTruthy();
    expect(call.options.find((o) => o.id === 'call_team')!.replyCold).toBeTruthy();
    const text = JSON.stringify(fillNamesDeep(ENDING, ROSTER));
    for (const k of Object.keys(OPPONENTS)) expect(text).not.toContain(OPPONENTS[k].name.nom);
    expect(text).not.toMatch(/\{[a-z]|%/);
    expect(ENDING.epilogue.sign).toContain('Далі буде');
  });

  it('вердикт другого сезону — «Дзвонить скаут» завжди; фінал чекає після другого сезону', () => {
    const s = full([2, 1]);
    const v = secondSeasonVerdict(s, 70);
    expect(v.kind).toBe('transfer');
    expect(v.title).toBe('Дзвонить скаут');
    expect(v.text).toContain('Лізі чемпіонів');
    expect(secondSeasonVerdict(full([0, 3]), 20).kind).toBe('transfer');
    expect(endingPending(defaultCareer(), 2, true)).toBe(true);
    expect(endingPending(defaultCareer(), 1, true)).toBe(false);
    expect(endingPending({ ...defaultCareer(), ended: { season: 2 } }, 2, true)).toBe(false);
  });

  it('фініш: кар’єру завершено, вибори записано; голос прологу — рима; партнер холодний без дуету', () => {
    const c = { ...defaultCareer(), prologue: { scout: 'scout_ego', call: 'call_team', base: 'base_vision' } };
    expect(prologueVoice(c, PROLOGUE)).toBe('ego');
    expect(prologueVoice(defaultCareer(), PROLOGUE)).toBeUndefined();
    expect(partnerBonded(defaultCareer())).toBe(false);
    expect(partnerBonded({ ...defaultCareer(), partnerBond: BALANCE.people.partnerBonded })).toBe(true);
    const { career } = finishEnding(c, ENDING.spreads, [{ spread: 'call', option: 'call_body' }, { spread: 'interview', option: 'int_team' }, { spread: 'tram', option: 'tram_vision' }], 2);
    expect(career.ended).toEqual({ season: 2 });
    expect(career.ending).toEqual({ call: 'call_body', interview: 'int_team', tram: 'tram_vision' });
    expect(career.agentLog?.at(-1)).toEqual({ season: 2, choice: 'leave' });
    expect(career.carriedFlags?.some((f) => f.flag === 'tibo_joke_told')).toBe(true);
  });
});

describe('канва в геймплеї (звірка зі STORY.md, 21.09)', () => {
  it('слово тренера про мету — друга ліга з 7-го туру; у двійці, у стиках і нижче — різне; у вищій мовчить', async () => {
    const { coachGoalWord } = await import('../src/engine/programme');
    expect(coachGoalWord(1, 6, 5, 10)).toBeNull();
    expect(coachGoalWord(2, 8, 5, 10)).toBeNull();
    expect(coachGoalWord(1, 7, 5, 10)).toMatch(/одне місце/);
    expect(coachGoalWord(1, 10, 5, 10)).toMatch(/Один матч/);
    expect(coachGoalWord(1, 8, 2, 10)).toMatch(/Ми в двійці/);
  });
  it('свисток знає вищу лігу; фінал: рими в листі третього розвороту, холодний варіант без квитків', async () => {
    const { pickWhistleLine } = await import('../src/engine/whistle');
    const { makeRng } = await import('../src/engine/rng');
    const top = pickWhistleLine('summary', { result: 'win', top: true }, makeRng(1), new Set());
    expect(top).toBeTruthy();
    const tram = ENDING.spreads.find((s) => s.id === 'tram')!;
    expect(tram.sheet.join(' ')).toMatch(/Мафія знає, де ти житимеш/);
    expect(tram.sheet.join(' ')).toMatch(/два квитки/);
    expect(tram.sheet.join(' ')).toMatch(/Ти був хороший/);
    expect(tram.sheetCold!.join(' ')).not.toMatch(/два квитки/);
    expect(tram.sheetCold!.join(' ')).toMatch(/Ти був хороший/);
    // Реактивна сцена з Ларссоном: кожен варіант знімає флаг, є сетапи.
    const { EPISODES } = await import('../src/content');
    const rx = EPISODES.find((e) => e.id === 'rx_sub_there')!;
    expect(rx.requires?.flags).toEqual(['sub_there']);
    expect(rx.setups?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('якорі, розклад, ринок (21.09)', () => {
  it('сцена-якір: S1 після 7-го — Ларссон, S2 після 7-го — місто (стан ≥ 3), один раз', async () => {
    const { anchorScene } = await import('../src/engine/week');
    const { WEEK_SCENES } = await import('../src/content');
    const c = defaultCareer();
    expect(anchorScene(1, 7, c, WEEK_SCENES)?.id).toBe('sc_larsson_training');
    expect(anchorScene(1, 6, c, WEEK_SCENES)?.id).not.toBe('sc_larsson_training');
    expect(anchorScene(1, 7, { ...c, weekLog: [{ season: 1, round: 7, offered: [], chosen: [], scene: { id: 'sc_larsson_training', option: 'together' } }] }, WEEK_SCENES)?.id).not.toBe('sc_larsson_training');
    expect(anchorScene(2, 7, { ...c, matchesPlayed: 17, fanHype: 60 }, WEEK_SCENES)?.id).toBe('sc_city_asks');
    expect(anchorScene(2, 7, { ...c, matchesPlayed: 17, fanHype: 10 }, WEEK_SCENES)?.id).not.toBe('sc_city_asks');   // стан 2 — ще не свій
  });

  // 22.09: рядок міста й зимова чутка стали листами (пользователь: aside губиться серед стікерів).
  it('якорі за туром: Хантер після 2-го, зимовий дзвінок після 5-го в обох сезонах — і лише раз', async () => {
    const { anchorScene } = await import('../src/engine/week');
    const { WEEK_SCENES } = await import('../src/content');
    const c = defaultCareer();
    expect(anchorScene(1, 2, c, WEEK_SCENES)?.id).toBe('sc_hunter');
    expect(anchorScene(2, 2, { ...c, matchesPlayed: 12 }, WEEK_SCENES)?.id).not.toBe('sc_hunter');
    expect(anchorScene(1, 5, { ...c, matchesPlayed: 5 }, WEEK_SCENES)?.id).toBe('sc_winter_call_1');
    expect(anchorScene(2, 5, { ...c, matchesPlayed: 15 }, WEEK_SCENES)?.id).toBe('sc_winter_call_2');
    const seenHunter = { ...c, weekLog: [{ season: 1, round: 2, offered: [], chosen: [], scene: { id: 'sc_hunter', option: 'ask_tibo' } }] };
    expect(anchorScene(1, 2, seenHunter, WEEK_SCENES)?.id).not.toBe('sc_hunter');
  });
  it('якорі за станом: перший тиждень у стані 2 — водій, у стані 3 — кіоск; тур важливіший за стан; тільки перша ліга', async () => {
    const { anchorScene } = await import('../src/engine/week');
    const { WEEK_SCENES } = await import('../src/content');
    const c = defaultCareer();
    expect(anchorScene(1, 1, c, WEEK_SCENES)?.id).not.toBe('sc_city_driver');                          // стан 1 — міста ще нема
    expect(anchorScene(1, 3, { ...c, matchesPlayed: 3 }, WEEK_SCENES)?.id).toBe('sc_city_driver');     // стан 2
    const driverSeen = { ...c, matchesPlayed: 4, weekLog: [{ season: 1, round: 3, offered: [], chosen: [], scene: { id: 'sc_city_driver', option: 'nod' } }] };
    expect(anchorScene(1, 4, driverSeen, WEEK_SCENES)?.id).not.toBe('sc_city_driver');                   // стан 2 і далі — раз
    expect(anchorScene(1, 5, { ...driverSeen, matchesPlayed: 6, fanHype: 60 }, WEEK_SCENES)?.id).toBe('sc_winter_call_1');   // зима важливіша за перехід
    expect(anchorScene(1, 6, { ...driverSeen, matchesPlayed: 6, fanHype: 60 }, WEEK_SCENES)?.id).toBe('sc_city_kiosk');      // стан 3 — тижнем пізніше
    expect(anchorScene(1, 3, { ...c, matchesPlayed: 6, fanHype: 60 }, WEEK_SCENES)?.id).toBe('sc_city_driver');              // стан 3 одразу — спершу водій
    expect(anchorScene(2, 8, { ...c, matchesPlayed: 18, fanHype: 60 }, WEEK_SCENES)?.id).not.toBe('sc_city_driver');  // вища ліга — без міста
  });

  it('pinFixture: матч із клубом — на заданий тур, коло ціле, відповідний матч теж переїхав', async () => {
    const { createSeason, pinFixture, US } = await import('../src/engine/season');
    const s = createSeason(5, OPPONENT_KEYS.top.concat(['olvar']), 2, ['olvar'], { club: 'olvar', round: 2 });
    const ours = s.fixtures.filter((f) => (f.home === US && f.away === 'olvar') || (f.away === US && f.home === 'olvar')).map((f) => f.round);
    expect(ours).toEqual([2, 7]);
    for (let r = 0; r < 10; r++) expect(s.fixtures.filter((f) => f.round === r).length).toBe(3);
    const each = new Set(s.fixtures.filter((f) => f.round === 2).flatMap((f) => [f.home, f.away]));
    expect(each.size).toBe(6);
    expect(pinFixture(s.fixtures, 'nobody', 2)).toEqual(s.fixtures);
  });

  it('ринок: ціна без відсотків і хвостів, чутка за станом, токени підставляються', async () => {
    const { marketValue, formatMarket, rumourLine, fillMarket } = await import('../src/engine/market');
    const { ACTIVITIES } = await import('../src/content');
    const s1 = full([1, 0], 1);
    const c = defaultCareer();
    expect(marketValue(s1, c) % 25000).toBe(0);
    expect(formatMarket(450000)).toBe('€ 450 тис.');
    expect(formatMarket(1200000)).toBe('€ 1,2 млн');
    expect(rumourLine(s1, c, 'Вальмари')).toMatch(/вищої ліги/);
    const s2 = { ...full([1, 0], 2), round: 2 };
    expect(rumourLine(s2, { ...c, agentLog: [{ season: 1, choice: 'leave', reason: 'medical' }] }, 'Вальмари')).toMatch(/медогляд/);
    expect(marketValue(s2, { ...c, agentLog: [{ season: 1, choice: 'leave', reason: 'medical' }] })).toBeLessThan(marketValue(s2, c));
    const g = ACTIVITIES.find((a) => a.id === 'google_self')!;
    const filled = fillMarket(g, s1, c, 'Вальмари');
    expect(JSON.stringify(filled)).not.toMatch(/⟨|%/);
    expect(JSON.stringify(filled)).toMatch(/€ \d+ тис\./);
  });
});
