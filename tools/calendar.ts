// Какой месяц даёт какие дела и какую погоду (M37, 04.10). Замер под правило «тиждень знає, який
// зараз місяць»: до него «Пляжний футбол» мог лечь в декабрь, а спека — выпасть в лютому.
//   npx tsx tools/calendar.ts 300
//
// Две таблицы. Первая — предложения недели по туру: сколько раз за прогон каждое сезонное дело
// попало в разворот и в каком месяце. Сезонным считается дело с `when.period` или `when.winter`;
// остальные всесезонны по замыслу, и их здесь нет. Вторая — погода матча по туру: `heat` вне тепла
// должен быть нулём, это и есть критерий. Внизу — размер пула в каждом туре: гейт по поре года
// сужает выбор ровно в те недели, где пул и так тоньше всего, и за этим надо следить.

import { ACTIVITIES, OPPONENTS, PLAYER, OPPONENT_KEYS } from '../src/content';
import { defaultCareer, effectivePlayer, type Career } from '../src/engine/career';
import { createSeason, isSeasonOver, monthOfRound, ourFixture, ourRow, periodOfRound, recordRound, SEASON_ROUNDS, type OurResult } from '../src/engine/season';
import { planWeek, finishWeek, weekContext, matchesActivity, type WeekPick } from '../src/engine/week';
import { generateConditions, type Weather } from '../src/engine/conditions';
import { makeRng } from '../src/engine/rng';

const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
const N = Number(process.argv[2] ?? 300);

const SEASONAL = ACTIVITIES.filter((a) => a.when?.period || a.when?.winter !== undefined).map((a) => a.id);
const WEATHERS: Weather[] = ['clear', 'rain', 'heat', 'wind'];

/** Предложения недели: [тур][id дела] = сколько раз попало в разворот. */
const offers: Record<number, Record<string, number>> = {};
/** Размер пула подходящих дел в этом туре — сумма по прогонам, потом в среднее. */
const poolSize: Record<number, number[]> = {};
/** Погода матча: [тур][weather] = сколько раз сгенерилась. */
const weather: Record<number, Record<string, number>> = {};

for (let r = 1; r <= SEASON_ROUNDS; r++) {
  offers[r] = {}; weather[r] = {}; poolSize[r] = [];
  for (const id of SEASONAL) offers[r][id] = 0;
  for (const w of WEATHERS) weather[r][w] = 0;
}

for (let n = 0; n < N; n++) {
  const seed = 1000 + n * 31;
  let season = createSeason(seed, OPPONENT_KEYS.second);
  let career: Career = defaultCareer();
  const rng = makeRng(seed);

  while (!isSeasonOver(season)) {
    // Погода предстоящего тура — тем же путём, что в App: пора года от тура, который сейчас играется.
    const fixture = ourFixture(season) ?? undefined;
    // Стикові — 11-й матч поза кругом, у таблиці він лягає в травень разом із 10-м туром.
    const round = Math.min((fixture?.round ?? season.round) + 1, SEASON_ROUNDS);
    const c = generateConditions(makeRng(seed + round * 7919), OPPONENTS, { confidence: 0, fatigue: 0 }, fixture, periodOfRound(round));
    weather[round][c.weather] += 1;

    const ours: OurResult = { scoreUs: rng.int(0, 3), scoreThem: rng.int(0, 3), goals: 0, assists: 0, coachRating: 4 + rng.next() * 4, fanRating: 4 + rng.next() * 4, scorers: [] };
    season = recordRound(season, ours, strengths, makeRng(seed + season.round * 7919));
    if (isSeasonOver(season)) break;

    const ctx = weekContext(season, career, ourRow(season).position)!;
    poolSize[season.round].push(ACTIVITIES.filter((a) => matchesActivity(a.when, ctx)).length);
    const wrng = makeRng(seed * 7 + season.round * 104729);
    const days = planWeek(ACTIVITIES, effectivePlayer(PLAYER, career), ctx, career, wrng);
    const picks: WeekPick[] = [];
    days.forEach((day, d) => {
      for (const offer of day) if (offer.activity.id in offers[season.round]) offers[season.round][offer.activity.id] += 1;
      const offer = day[wrng.int(0, day.length - 1)];
      if (offer) picks.push({ day: d, activityId: offer.activity.id });
    });
    career = finishWeek(career, ctx, days, picks, []).career;
  }
}

const pad = (s: string, n: number) => s.padEnd(n);
const pct = (k: number, total: number) => (total ? `${Math.round((k / total) * 100)}%` : '—');

console.log(`Прогонов: ${N}. Сезонных дел: ${SEASONAL.length} из ${ACTIVITIES.length}.\n`);

console.log('ДЕЛА НЕДЕЛИ — в каком месяце предлагаются (недели идут после сыгранного тура)');
const head = ['тур', 'місяць', 'пора'].map((h, i) => pad(h, [5, 11, 8][i])).join('') + SEASONAL.map((id) => pad(id.slice(0, 13), 15)).join('');
console.log(head);
for (let r = 1; r < SEASON_ROUNDS; r++) {
  const row = [pad(String(r), 5), pad(monthOfRound(r), 11), pad(periodOfRound(r), 8)].join('')
    + SEASONAL.map((id) => pad(offers[r][id] ? String(offers[r][id]) : '·', 15)).join('');
  console.log(row);
}

console.log('\nПОГОДА МАТЧА — доля по туру (heat вне тепла обязан быть нулём)');
console.log(['тур', 'місяць', 'пора'].map((h, i) => pad(h, [5, 11, 8][i])).join('') + WEATHERS.map((w) => pad(w, 8)).join(''));
for (let r = 1; r <= SEASON_ROUNDS; r++) {
  const total = WEATHERS.reduce((s, w) => s + weather[r][w], 0);
  console.log([pad(String(r), 5), pad(monthOfRound(r), 11), pad(periodOfRound(r), 8)].join('') + WEATHERS.map((w) => pad(pct(weather[r][w], total), 8)).join(''));
}
const all = WEATHERS.map((w) => [w, Object.values(weather).reduce((s, x) => s + x[w], 0)] as const);
const allTotal = all.reduce((s, [, k]) => s + k, 0);
console.log('\nза сезон: ' + all.map(([w, k]) => `${w} ${pct(k, allTotal)}`).join(', '));

console.log('\nПУЛ ДЕЛ — сколько дел вообще подходит в этой неделе (среднее)');
for (let r = 1; r < SEASON_ROUNDS; r++) {
  const xs = poolSize[r];
  const avg = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  console.log(`  тур ${pad(String(r), 3)} ${pad(monthOfRound(r), 11)} ${pad(periodOfRound(r), 8)} ${avg.toFixed(1)}`);
}
