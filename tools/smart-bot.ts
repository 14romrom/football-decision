// Умний бот (24.10, аналітика закритого тесту): троє живих гравців на 1.0.5 вигравали 12 матчів із 14 з
// оцінками 9+ і чистим ісходом у 59% рішень — помітно частіше, ніж боти, за якими міряється баланс. Гіпотеза:
// живий гравець обирає краще за випадкового бота. Тут три політики грають повні кар'єри (два сезони, ріст,
// тиждень — як tools/voice-paths.ts) і порівнюються за відрізками кар'єри:
//   smart  — варіант із найкращою очікуваною цінністю в реальному контексті: поточна картка, модифікатори
//            ситуації (computeContext), сили; цінність ісходу — та сама, що в аудиті (audit-options.ts:value);
//   random — випадковий доступний варіант;
//   safe   — завжди «упевнено», якщо є.
//   npx tsx tools/smart-bot.ts 40
import { EPISODES_RAW, FLAG_RULES, OPPONENTS, PLAYER, ROSTER, FLAVOR, ACTIVITIES, OPPONENT_KEYS } from '../src/content';
import { applyChoice, availableOptions, createMatch, finishMatch, nextEpisode, optionCost, type MatchSession } from '../src/engine/match';
import { resolveOption, tierFor, catastropheBand } from '../src/engine/resolve';
import { computeContext } from '../src/engine/context';
import { PARTNER_FINISH_RAW } from '../src/engine/balance';
import { applyMatchToCareer, consumeStartPenalty, defaultCareer, effectivePlayer, coachGrip, type Career } from '../src/engine/career';
import { createSeason, isSeasonOver, ourFixture, ourRow, recordRound, type OurResult, type Season } from '../src/engine/season';
import { generateConditions } from '../src/engine/conditions';
import { planWeek, applyWeek, weekContext, withOutcome, VOICE_ATTRS } from '../src/engine/week';
import { makeRng } from '../src/engine/rng';
import { value, STAMINA_WEIGHT } from './audit-options';
import type { Episode, EpisodeOption, Tier } from '../src/engine/types';

const N = Number(process.argv[2] ?? 40);
type Policy = 'smart' | 'random' | 'safe';
const POLICIES: Policy[] = ['smart', 'random', 'safe'];

const P2D10: number[] = Array(21).fill(0);
for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) P2D10[a + b] += 0.01;

/** Очікувана цінність варіанта зараз: розподіл ярусів за 2d10 з усіма модифікаторами ситуації. */
function smartEV(s: MatchSession, ep: Episode, o: EpisodeOption): number {
  const ctx = computeContext(s.state, s.player, o, ep.phase, s.conditions, s.flagRules);
  const d = o.difficulty ?? 0;
  let ev = 0;
  for (let raw = 2; raw <= 20; raw++) {
    const tier: Tier = tierFor(ctx.position, raw, raw + ctx.flat, d, ctx.attrMod);
    const crit = o.outcomes.crit && tier === 'clean' && raw > catastropheBand(ctx.position, ctx.attrMod) && (raw >= 20 || (o.partnerFinish && raw >= PARTNER_FINISH_RAW));
    const v = value((crit ? o.outcomes.crit : o.outcomes[tier])?.apply);
    ev += P2D10[raw] * (v.team * 5 + v.self);
  }
  return ev - optionCost(o) * STAMINA_WEIGHT;
}

function pick(policy: Policy, s: MatchSession, ep: Episode, opts: EpisodeOption[], r: () => number): EpisodeOption {
  if (policy === 'smart') return opts.reduce((a, b) => (smartEV(s, ep, b) > smartEV(s, ep, a) ? b : a));
  if (policy === 'safe') return opts.find((o) => o.basePosition === 'controlled') ?? opts[0];
  return opts[Math.floor(r() * opts.length)];
}

type Seg = { m: number; w: number; d: number; l: number; rolls: number; clean: number; bad: number; goals: number; assists: number; coach: number; fans: number; risky: number };
const SEGS = ['1–5', '6–10', '11–15', '16–20'];
const empty = (): Seg => ({ m: 0, w: 0, d: 0, l: 0, rolls: 0, clean: 0, bad: 0, goals: 0, assists: 0, coach: 0, fans: 0, risky: 0 });

function run(seed: number, policy: Policy, segs: Seg[]) {
  let career: Career = defaultCareer();
  let matchNo = 0;
  for (let num = 1; num <= 2; num++) {
    const keys = num === 1 ? OPPONENT_KEYS.second : [...OPPONENT_KEYS.top, ...OPPONENT_KEYS.second.slice(0, 1)];
    let season: Season = createSeason(seed + num, keys, num, []);
    while (!isSeasonOver(season)) {
      const rng = makeRng(seed * 31 + num * 977 + season.round);
      const fixture = ourFixture(season) ?? undefined;
      const { career: consumed, penalty } = consumeStartPenalty(career);
      career = consumed;
      const grip = coachGrip(career.coachTrust);
      const conditions = {
        ...generateConditions(rng, OPPONENTS, { confidence: 0, fatigue: 0 }, fixture),
        league: num >= 2 ? ('top' as const) : ('second' as const),
        ...(grip.hold ? { instruction: 'hold' as const } : {}),
        ...(grip.noSetPieces ? { noSetPieces: true } : {}),
      };
      const player = effectivePlayer(PLAYER, career, penalty.attrBonus);
      const session = createMatch(`s-${seed}-${num}-${season.round}`, seed, player, rng, EPISODES_RAW, ROSTER, conditions, [], FLAG_RULES, {
        coachTrust: career.coachTrust, fanHype: career.fanHype, fromBench: penalty.fromBench,
        staminaPenalty: penalty.staminaPenalty, coachTrustPenalty: penalty.coachTrustPenalty,
        flags: penalty.flags, arc: penalty.arc,
      });
      const seg = segs[Math.min(3, Math.floor(matchNo / 5))];
      for (;;) {
        const next = nextEpisode(session, rng);
        if (!next) break;
        const opts = availableOptions(next.episode, session.state, session.player);
        if (!opts.length) break;
        const o = pick(policy, session, next.episode, opts, () => rng.next());
        const res = resolveOption(session.state, session.player, o, next.episode.phase, rng, session.conditions, session.flagRules);
        seg.rolls++;
        if (res.tier === 'clean') seg.clean++;
        if (res.tier === 'badFail') seg.bad++;
        if (o.basePosition !== 'controlled') seg.risky++;
        applyChoice(session, next.episode, o, res, rng, FLAVOR);
        if (session.finished) break;
      }
      const { summary } = finishMatch(session, rng);
      seg.m++;
      if (summary.scoreUs > summary.scoreThem) seg.w++; else if (summary.scoreUs < summary.scoreThem) seg.l++; else seg.d++;
      seg.goals += summary.stats.goals; seg.assists += summary.stats.assists;
      seg.coach += summary.coachRating; seg.fans += summary.fanRating;
      matchNo++;
      career = applyMatchToCareer(career, session.state, summary, false, conditions.opponentKey);
      const ours: OurResult = { scoreUs: summary.scoreUs, scoreThem: summary.scoreThem, goals: summary.stats.goals, assists: summary.stats.assists, coachRating: summary.coachRating, fanRating: summary.fanRating, scorers: [] };
      season = recordRound(season, ours, Object.fromEntries(Object.entries(OPPONENTS).map(([k, x]) => [k, x.strength])), makeRng(seed + season.round * 7919));
      if (!isSeasonOver(season)) {
        const ctx = weekContext(season, career, ourRow(season).position);
        if (ctx) {
          // Тиждень однаковий для всіх політик: перша пропозиція дня, тренування «на вибір» — перший атрибут голосу.
          const days = planWeek(ACTIVITIES, player, ctx, career, makeRng(seed * 7 + num * 131 + season.round));
          career = applyWeek(career, days.map((dd) => dd[0]).filter(Boolean).map((x) => ({ activity: withOutcome(x.activity, x.outcome), trainAttr: VOICE_ATTRS[x.activity.voice][0] }))).career;
        }
      }
    }
  }
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—').padStart(5);
const f = (a: number, b: number, d = 2) => (b ? (a / b).toFixed(d) : '—').padStart(5);
console.log(`Умний бот: ${N} кар'єр на політику, два сезони (другий — вища ліга), ріст і тиждень як у voice-paths.\n`);
console.log('політика  матчі   перемог нічиїх поразок  чисто  катастр ризик  голи/м асист/м  тренер трибуни');
for (const policy of POLICIES) {
  const segs = SEGS.map(empty);
  for (let i = 0; i < N; i++) run(9100 + i, policy, segs);
  segs.forEach((s, k) => console.log(
    `${(k === 0 ? policy : '').padEnd(9)} ${SEGS[k].padEnd(6)} ${pct(s.w, s.m)}  ${pct(s.d, s.m)}  ${pct(s.l, s.m)}  ${pct(s.clean, s.rolls)}  ${pct(s.bad, s.rolls)}  ${pct(s.risky, s.rolls)}  ${f(s.goals, s.m)}  ${f(s.assists, s.m)}   ${f(s.coach, s.m, 1)}  ${f(s.fans, s.m, 1)}`,
  ));
}
console.log('\nЖиві гравці (GA4, 23–24.10, версія 1.0.5, 14 матчів у середньому на 13-му матчі кар\'єри):');
console.log('  перемог 86%, нічиїх 0%, поразок 14%, чисто 59%, катастроф 6%, ризик 48%, голи 0,5/м, асисти 1,7/м, тренер 9,2, трибуни 9,3');
