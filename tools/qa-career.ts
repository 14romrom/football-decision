// QA-прогон карьер: много сезонов случайной политикой матча и случайными делами недели,
// проверка инвариантов, которые тесты по отдельности не ловят: атрибуты в 1..99, нет NaN,
// флаги без дублей, nextMatch потреблён, уровень не падает, тренировки не уходят в минус,
// weekLog без дыр, каждая неделя ≤ picks дел и по одному на голос.
//   npx tsx tools/qa-career.ts 300
import { makeRng } from '../src/engine/rng';
import { resolveOption } from '../src/engine/resolve';
import { applyChoice, availableOptions, createMatch, finishMatch, nextEpisode, sceneInsights } from '../src/engine/match';
import { ACTIVITIES, EPISODES_RAW, FLAG_RULES, FLAVOR, OPPONENTS, PLAYER, rosterFor } from '../src/content';
import { generateConditions } from '../src/engine/conditions';
import { applyMatchToCareer, consumeStartPenalty, defaultCareer, effectivePlayer, spendPoint, type Career } from '../src/engine/career';
import { createSeason, isSeasonOver, ourFixture, ourRow, recordRound, seasonVerdict, type Season } from '../src/engine/season';
import { applyWeek, coachLocksCity, offerWeek, recordWeek, weekContext } from '../src/engine/week';
import { dominantVoice } from '../src/engine/voices';
import type { Attribute } from '../src/engine/types';

const problems = new Map<string, number>();
const note = (k: string) => problems.set(k, (problems.get(k) ?? 0) + 1);
const ATTRS = Object.keys(PLAYER.attrs) as Attribute[];

function runCareer(seed: number) {
  let career: Career = defaultCareer();
  let season: Season = createSeason(seed, Object.keys(OPPONENTS));
  const strengths = Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength]));
  let insightsSeen = 0; let insightsTaken = 0; let flavorMissing = 0; let rolls = 0;
  let locked = 0;
  while (!isSeasonOver(season)) {
    const fixture = ourFixture(season)!;
    const rng = makeRng(seed * 31 + season.round);
    const conditions = generateConditions(rng, OPPONENTS, { confidence: 0, fatigue: 0 }, fixture);
    const prevLevel = career.level;
    const { career: consumed, penalty } = consumeStartPenalty(career);
    career = consumed;
    if (career.nextMatch) note('nextMatch не потреблён');
    const player = effectivePlayer(PLAYER, career, penalty.attrBonus);
    for (const a of ATTRS) if (!(player.attrs[a] >= 1 && player.attrs[a] <= 99)) note('атрибут вне 1..99');
    const flags = penalty.flags.map((f) => f.flag);
    if (new Set(flags).size !== flags.length) note('дубли флагов на старте');
    const session = createMatch(`qa-${seed}-${season.round}`, seed, player, rng, EPISODES_RAW, rosterFor(conditions.opponentKey, rng), conditions, [], FLAG_RULES,
      { coachTrust: career.coachTrust, staminaPenalty: penalty.staminaPenalty, coachTrustPenalty: penalty.coachTrustPenalty, flags: penalty.flags, startDelta: penalty.startDelta, voiceStreak: penalty.voiceStreak, voiceMute: penalty.voiceMute, injuriesSeason: career.injuriesSeason });
    if (new Set(session.state.flags).size !== session.state.flags.length) note('дубли флагов в матче');
    for (;;) {
      const next = nextEpisode(session, rng);
      if (!next) break;
      const opts = availableOptions(next.episode, session.state, session.player);
      if (opts.length < 3) note(`меньше 3 вариантов: ${next.episode.id}`);
      const ins = sceneInsights(next.episode, session.state, session.player);
      insightsSeen += ins.length;
      const option = opts[rng.int(0, opts.length - 1)];
      if (option.insight) insightsTaken += 1;
      const res = resolveOption(session.state, session.player, option, next.episode.phase, rng, session.conditions, session.flagRules);
      if (!Number.isFinite(res.totalScore)) note('NaN в броске');
      const { events } = applyChoice(session, next.episode, option, res, rng, FLAVOR);
      const ep = events.find((e) => e.kind === 'episode');
      rolls += 1;
      if (ep && !ep.flavor) flavorMissing += 1;
      if (ep?.flavor && /\{[a-z]/.test(ep.flavor)) note('плейсхолдер в реплике');
      for (const k of ['stamina', 'composureNow', 'coachTrust', 'fanHype'] as const) {
        const v = session.state[k];
        if (!(v >= 0 && v <= 100)) note(`${k} вне 0..100`);
      }
    }
    const { summary } = finishMatch(session, rng);
    career = applyMatchToCareer(career, session.state, summary, dominantVoice(session.state.voices) !== null, conditions.opponentKey);
    if (career.level < prevLevel) note('уровень упал');
    while (career.unspentPoints > 0) career = spendPoint(career, ATTRS[rng.int(0, ATTRS.length - 1)]);
    season = recordRound(season, {
      scoreUs: summary.scoreUs, scoreThem: summary.scoreThem, goals: summary.stats.goals, assists: summary.stats.assists,
      coachRating: summary.coachRating, fanRating: summary.fanRating, scorers: summary.goals.filter((g) => g.side === 'us').map((g) => g.scorer),
    }, strengths, makeRng(seed + season.round * 7919));
    if (isSeasonOver(season)) break;
    const ctx = weekContext(season, career, ourRow(season).position);
    if (!ctx) { note('нет контекста недели после тура'); break; }
    const wrng = makeRng(seed * 7 + season.round * 104729);
    const offers = offerWeek(ACTIVITIES, ctx, career, wrng);
    if (coachLocksCity(ctx)) locked += 1;
    if (offers.length === 0) note('пустая неделя');
    if (new Set(offers.map((a) => a.voice)).size !== offers.length) note('два дела одного голоса');
    if (offers.length > 6) note('больше шести дел');
    const n = wrng.int(0, 2);
    const chosen = [...offers].sort(() => wrng.next() - 0.5).slice(0, n);
    const choices = chosen.map((a) => ({ activity: a, ...(a.effect.train === 'choice' ? { trainAttr: 'pace' as const } : {}) }));
    career = recordWeek(applyWeek(career, choices).career, ctx, offers, chosen);
    for (const [a, v] of Object.entries(career.training ?? {})) if ((v ?? 0) < 0 || (v ?? 0) >= 4) note(`тренировка ${a} = ${v}`);
    const rounds = (career.weekLog ?? []).map((e) => e.round);
    if (new Set(rounds).size !== rounds.length) note('неделя записана дважды');
  }
  const verdict = seasonVerdict(season, career.coachTrust);
  return { insightsSeen, insightsTaken, flavorMissing, rolls, locked, level: career.level, mods: Object.values(career.attrPoints).reduce((s, v) => s + (v ?? 0), 0), verdict: verdict.kind, points: ourRow(season).points, trust: career.coachTrust };
}

const n = Number(process.argv[2] ?? 200);
const runs: ReturnType<typeof runCareer>[] = [];
for (let i = 0; i < n; i++) {
  try { runs.push(runCareer(90000 + i)); } catch (e) { note('исключение: ' + String(e).slice(0, 120)); }
}
const avg = (f: (r: (typeof runs)[number]) => number) => (runs.reduce((s, r) => s + f(r), 0) / runs.length).toFixed(2);
console.log(`\nQA: ${n} карьер по 10 матчей, случайные матч и неделя\n`);
console.log(`вставок показано за сезон: ${avg((r) => r.insightsSeen)}, взято: ${avg((r) => r.insightsTaken)}`);
console.log(`бросков без реплики: ${avg((r) => r.flavorMissing)} из ${avg((r) => r.rolls)}`);
console.log(`недель «тренер закрив місто»: ${avg((r) => r.locked)} из 9`);
console.log(`уровень к концу: ${avg((r) => r.level)}, очков в атрибуты: ${avg((r) => r.mods)}, довіра: ${avg((r) => r.trust)}, очки: ${avg((r) => r.points)}`);
const verdicts = runs.reduce((m, r) => ({ ...m, [r.verdict]: (m[r.verdict] ?? 0) + 1 }), {} as Record<string, number>);
console.log('вердикты сезона:', verdicts);
console.log('\nПроблемы:', problems.size ? '' : 'нет');
for (const [k, v] of problems) console.log(`  ${v}× ${k}`);
