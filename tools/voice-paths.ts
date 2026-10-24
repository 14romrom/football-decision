// Шляхи голосів (23.10, відгук тестера після трьох кар'єр): «бачення — імба, решта не качається».
// Бот повторює його експеримент: дві сезони, у сцені бере варіант обраного голосу (якщо такого
// нема — випадковий), у тижні — справу того ж голосу (тренування «на вибір» — у його атрибут).
// Показує, як росте картка на кожному шляху, скільки голів і передач і як часто кидок провалюється.
//   npx tsx tools/voice-paths.ts 80
import { EPISODES_RAW, FLAG_RULES, OPPONENTS, PLAYER, ROSTER, FLAVOR, ACTIVITIES, OPPONENT_KEYS } from '../src/content';
import { applyChoice, availableOptions, createMatch, finishMatch, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { applyMatchToCareer, consumeStartPenalty, defaultCareer, effectivePlayer, coachGrip, type Career } from '../src/engine/career';
import { createSeason, isSeasonOver, ourFixture, ourRow, recordRound, seasonVerdict, type OurResult, type Season } from '../src/engine/season';
import { generateConditions } from '../src/engine/conditions';
import { planWeek, applyWeek, weekContext, withOutcome, VOICE_ATTRS } from '../src/engine/week';
import { makeRng } from '../src/engine/rng';
import { attrMod } from '../src/engine/attr';
import type { Attribute, VoiceKey } from '../src/engine/types';

const N = Number(process.argv[2] ?? 80);
type Path = VoiceKey | 'mixed';
const PATHS: Path[] = ['vision', 'team', 'ego', 'instinct', 'body', 'composure', 'mixed'];
/** Атрибут, у який іде тренування «на вибір» на шляху голосу — той, що на картці під голосом. */
const MAIN: Record<VoiceKey, Attribute> = {
  vision: 'vision', team: 'passing', ego: 'finishing', instinct: 'dribbling', body: 'pace', composure: 'composure',
};
const ATTRS = Object.keys(PLAYER.attrs) as Attribute[];
const GOOD = new Set(['transfer', 'extend']);

type Row = { goals: number; assists: number; matches: number; position: number; verdict: string; mods: Record<Attribute, number>; rolls: number; clean: number; fail: number; cat: number; picked: number; weeks: number; own: number; trains: number; byForm: [number, number, number]; uses: Record<Attribute, number> };

function run(seed: number, path: Path): Row[] {
  let career: Career = defaultCareer();
  const rows: Row[] = [];
  for (let num = 1; num <= 2; num++) {
    const keys = num === 1 ? OPPONENT_KEYS.second : [...OPPONENT_KEYS.top, ...OPPONENT_KEYS.second.slice(0, 1)];
    let season: Season = createSeason(seed + num, keys, num, []);
    let rolls = 0, clean = 0, fail = 0, cat = 0, picked = 0, weeks = 0, own = 0, trains = 0;
    const byForm: [number, number, number] = [0, 0, 0];
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
      const session = createMatch(`v-${seed}-${num}-${season.round}`, seed, player, rng, EPISODES_RAW, ROSTER, conditions, [], FLAG_RULES, {
        coachTrust: career.coachTrust, fanHype: career.fanHype, fromBench: penalty.fromBench,
        staminaPenalty: penalty.staminaPenalty, coachTrustPenalty: penalty.coachTrustPenalty, markedRep: penalty.markedRep,
        flags: penalty.flags, arc: penalty.arc,
      });
      for (;;) {
        const next = nextEpisode(session, rng);
        if (!next) break;
        const opts = availableOptions(next.episode, session.state, session.player);
        if (!opts.length) break;
        const mine = path === 'mixed' ? [] : opts.filter((o) => o.voice?.who === path);
        const pool = mine.length ? mine : opts;
        if (mine.length) picked++;
        const o = pool[rng.int(0, pool.length - 1)];
        const res = resolveOption(session.state, session.player, o, next.episode.phase, rng, session.conditions, session.flagRules);
        rolls++;
        if (res.tier === 'clean') { clean++; byForm[res.basePosition === 'controlled' ? 0 : res.basePosition === 'risky' ? 1 : 2]++; }
        if (res.tier === 'fail' || res.tier === 'badFail') fail++;
        if (res.tier === 'badFail') cat++;
        applyChoice(session, next.episode, o, res, rng, FLAVOR);
        if (session.finished) break;
      }
      const { summary } = finishMatch(session, rng);
      career = applyMatchToCareer(career, session.state, summary, false, conditions.opponentKey);
      const ours: OurResult = { scoreUs: summary.scoreUs, scoreThem: summary.scoreThem, goals: summary.stats.goals, assists: summary.stats.assists, coachRating: summary.coachRating, fanRating: summary.fanRating, scorers: [] };
      season = recordRound(season, ours, Object.fromEntries(Object.entries(OPPONENTS).map(([k, o]) => [k, o.strength])), makeRng(seed + season.round * 7919));

      if (!isSeasonOver(season)) {
        const ctx = weekContext(season, career, ourRow(season).position);
        if (ctx) {
          const wrng = makeRng(seed * 7 + num * 131 + season.round);
          const days = planWeek(ACTIVITIES, player, ctx, career, wrng);
          const chosen = days.map((d) => (path === 'mixed' ? d[0] : d.find((x) => x.activity.voice === path) ?? d[0])).filter(Boolean);
          weeks++;
          for (const x of chosen) {
            if (x.activity.voice === path) own++;
            const tr = withOutcome(x.activity, x.outcome).effect.train;
            if (tr && (tr === 'choice' || path === 'mixed' || tr === MAIN[path as VoiceKey])) trains++;
          }
          // «На вибір» — лише з атрибутів голосу справи, як на екрані; свій головний, якщо він там є.
          const trainFor = (v: VoiceKey) => (path !== 'mixed' && VOICE_ATTRS[v].includes(MAIN[path]) ? MAIN[path] : VOICE_ATTRS[v][0]);
          career = applyWeek(career, chosen.map((x) => ({ activity: withOutcome(x.activity, x.outcome), trainAttr: trainFor(x.activity.voice) }))).career;
        }
      }
    }
    const grown = effectivePlayer(PLAYER, career);
    const p = season.player;
    rows.push({
      goals: p.goals, assists: p.assists, matches: p.matches, position: ourRow(season).position,
      verdict: seasonVerdict(season, career.coachTrust).kind,
      mods: Object.fromEntries(ATTRS.map((a) => [a, attrMod(grown.attrs[a])])) as Record<Attribute, number>,
      rolls, clean, fail, cat, picked, weeks, own, trains, byForm,
      uses: Object.fromEntries(ATTRS.map((a) => [a, career.useCounts?.[a] ?? 0])) as Record<Attribute, number>,
    });
  }
  return rows;
}

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const f = (n: number, d = 1) => n.toFixed(d);
const startMods = Object.fromEntries(ATTRS.map((a) => [a, attrMod(PLAYER.attrs[a])])) as Record<Attribute, number>;
const SHOW: Attribute[] = ['vision', 'passing', 'positioning', 'finishing', 'dribbling', 'first_touch', 'pace', 'strength', 'stamina', 'composure'];

console.log(`Шляхи голосів: ${N} кар'єр на шлях. Модифікатори — приріст до старту (${SHOW.map((a) => `${a.slice(0, 4)} ${startMods[a]}`).join(', ')})\n`);
console.log('шлях       сезон  справ/т свого трен.  свій%  Г/м   А/м   Г+А/м  місце  добре  чисто  провал  катастр  ' + SHOW.map((a) => a.slice(0, 4).padStart(5)).join(''));
for (const path of PATHS) {
  const s: Row[][] = [[], []];
  for (let i = 0; i < N; i++) { const r = run(9000 + i, path); s[0].push(r[0]); s[1].push(r[1]); }
  s.forEach((rows, k) => {
    const m = avg(rows.map((r) => r.matches));
    const g = avg(rows.map((r) => r.goals)) / m, a = avg(rows.map((r) => r.assists)) / m;
    const rolls = avg(rows.map((r) => r.rolls));
    const pct = (x: number) => `${Math.round((100 * x) / rolls)}%`;
    const good = Math.round((100 * rows.filter((r) => GOOD.has(r.verdict)).length) / rows.length);
    console.log(
      `${(k === 0 ? path : '').padEnd(10)} ${String(k + 1).padEnd(5)} ${f(avg(rows.map((r) => r.weeks)), 0).padStart(6)} ${f(avg(rows.map((r) => r.own)), 1).padStart(6)} ${f(avg(rows.map((r) => r.trains)), 1).padStart(5)} ${pct(avg(rows.map((r) => r.picked))).padStart(5)} ${f(g, 2).padStart(5)} ${f(a, 2).padStart(5)} ${f(g + a, 2).padStart(6)} ${f(avg(rows.map((r) => r.position))).padStart(6)} ${`${good}%`.padStart(6)} ${pct(avg(rows.map((r) => r.clean))).padStart(6)} ${pct(avg(rows.map((r) => r.fail))).padStart(7)} ${pct(avg(rows.map((r) => r.cat))).padStart(8)}  ` +
      SHOW.map((at) => `+${f(avg(rows.map((r) => r.mods[at])) - startMods[at])}`.padStart(5)).join(''),
    );
  });
}

// Пропозиція Б (23.10): чистий на ризику вчить швидше — «упевнено» 1, «ризиковано» 2, «відчайдушно» 3.
// Скільки це додало б росту від гри на кожному шляху (множник до нинішнього лічильника чистих).
console.log('\nчисті за формою (упевнено / ризиковано / відчайдушно) і множник росту від гри за правилом Б:');
for (const path of PATHS) {
  const rows: Row[] = [];
  for (let i = 0; i < N; i++) rows.push(...run(9000 + i, path));
  const sum = [0, 1, 2].map((k) => rows.reduce((x, r) => x + r.byForm[k], 0));
  const all = sum[0] + sum[1] + sum[2];
  const share = sum.map((x) => `${Math.round((100 * x) / all)}%`).join(' / ');
  console.log(`${path.padEnd(10)} ${share.padEnd(16)} ×${f((sum[0] + 2 * sum[1] + 3 * sum[2]) / all, 2)}`);
}

// Чисті за кар'єру на атрибутах (career.useCounts, наростаючим підсумком) — звідки береться ріст від гри.
console.log("\nчистих за кар'єру (useCounts) на кінець другого сезону:");
console.log('шлях       ' + SHOW.map((a) => a.slice(0, 4).padStart(6)).join(''));
for (const path of PATHS) {
  const rows: Row[] = [];
  for (let i = 0; i < N; i++) rows.push(run(9000 + i, path)[1]);
  console.log(`${path.padEnd(10)} ` + SHOW.map((a) => f(avg(rows.map((r) => r.uses[a])), 0).padStart(6)).join(''));
}
