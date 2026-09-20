// Как часто за сезон всплывает сцена-продолжение недели и как часто одна и та же повторяется.
// Прогон карьер случайной политикой недели (как тестер, который тыкает наугад) и политикой
// «одно любимое дело» (худший случай: игрок всё время выбирает одно и то же).
//   npx tsx tools/scene-rate.ts 300

import { ACTIVITIES, OPPONENTS, PLAYER, WEEK_SCENES } from '../src/content';
import { defaultCareer, effectivePlayer, type Career } from '../src/engine/career';
import { createSeason, isSeasonOver, ourRow, recordRound, type OurResult } from '../src/engine/season';
import { finishWeek, planWeek, sceneFor, sceneOptionsFor, seenScenes, weekContext, weekVoiceSees, type WeekPick } from '../src/engine/week';
import { makeRng } from '../src/engine/rng';

const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
const N = Number(process.argv[2] ?? 300);

function run(seed: number, favourite?: string) {
  let season = createSeason(seed, Object.keys(OPPONENTS));
  let career: Career = defaultCareer();
  const rng = makeRng(seed);
  const seen: string[] = [];
  while (!isSeasonOver(season)) {
    const ours: OurResult = { scoreUs: rng.int(0, 3), scoreThem: rng.int(0, 3), goals: 0, assists: 0, coachRating: 4 + rng.next() * 4, fanRating: 4 + rng.next() * 4, scorers: [] };
    season = recordRound(season, ours, strengths, makeRng(seed + season.round * 7919));
    if (isSeasonOver(season)) break;
    const ctx = weekContext(season, career, ourRow(season).position)!;
    const wrng = makeRng(seed * 7 + season.round * 104729);
    const days = planWeek(ACTIVITIES, effectivePlayer(PLAYER, career), ctx, career, wrng);
    const picks: WeekPick[] = [];
    let used = false;
    days.forEach((day, d) => {
      const offer = (favourite && day.find((o) => o.activity.id === favourite)) || day[wrng.int(0, day.length - 1)];
      if (!offer) return;
      const pick: WeekPick = { day: d, activityId: offer.activity.id };
      const scene = sceneFor(offer.outcome, WEEK_SCENES, seenScenes(career), used);
      if (scene) {
        const visible = sceneOptionsFor(scene, (who) => weekVoiceSees(who, effectivePlayer(PLAYER, career), ctx, career));
        pick.scene = { id: scene.id, option: visible[wrng.int(0, visible.length - 1)].id };
        used = true; seen.push(scene.id);
      }
      picks.push(pick);
    });
    career = finishWeek(career, ctx, days, picks, WEEK_SCENES).career;
  }
  return seen;
}

for (const [label, fav] of [['наугад', undefined], ['завжди побачення (insta_date)', 'insta_date'], ['завжди вечеря з командою (team_dinner)', 'team_dinner']] as const) {
  const runs = Array.from({ length: N }, (_, i) => run(90000 + i, fav));
  const perSeason = runs.reduce((s, r) => s + r.length, 0) / N;
  const withRepeat = runs.filter((r) => new Set(r).size < r.length).length / N;
  const none = runs.filter((r) => r.length === 0).length / N;
  const dist: Record<string, number> = {};
  for (const r of runs) for (const id of r) dist[id] = (dist[id] ?? 0) + 1;
  console.log(`\n${label}: сцен за сезон (9 тижнів) у середньому ${perSeason.toFixed(2)}; сезонів без жодної сцени ${(none * 100).toFixed(0)}%; сезонів, де якась сцена повторилась ${(withRepeat * 100).toFixed(0)}%`);
  console.log('  розподіл: ' + Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / N).toFixed(2)}`).join(' · '));
}
