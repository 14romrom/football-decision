// Стрічка Y: доля «нашого» по турам карьеры и хватает ли пула, чтобы за две сезони ни один пост
// не прочитался дважды (решение пользователя 04.10).
//   npx tsx tools/feed-share.ts 200
//
// Почему считать надо за карьеру, а не за сезон: память стрічки — `POSTS_KEEP` = 400 строк
// (telemetry/history.ts), а карьера это 20 туров по 10 постов = 200. То есть пост, прочитанный
// в августе первого сезона, не вернётся и в мае второго, и узкий пул упрётся именно на дистанции
// двух сезонов. Повтор здесь — не «неприятно», а прямой признак, что группе не хватает строк.
//
// Контексты туров разные (результат, гол, место, следующий соперник, стан арки, флаги), иначе
// замер покажет не пул, а одно и то же условие двадцать раз.

import { buildFeed, postQuota, localShare, LOCAL_GROUPS, careerRound, type PostContext, type PostGroup } from '../src/engine/posts';
import postsJson from '../src/content/posts.json';
import { makeRng } from '../src/engine/rng';

const POSTS = postsJson as unknown as Parameters<typeof buildFeed>[3];
const GROUPS: PostGroup[] = ['self', 'league', 'world', 'cross', 'meta'];
const N = Number(process.argv[2] ?? 200);

/** Сколько строк всего есть у группы — потолок, выше которого повтор неизбежен. */
const poolLines: Record<string, number> = {};
for (const g of GROUPS) poolLines[g] = (POSTS?.posts ?? []).filter((r) => r.group === g).reduce((n, r) => n + r.lines.length, 0);

const RESULTS = ['win', 'loss', 'draw'] as const;
const THEM = ['star', 'veteran', 'hard', 'rookie', 'local', 'playmaker', 'target', 'youngster'];

function ctx(season: number, round: number, rng: ReturnType<typeof makeRng>): PostContext {
  const result = RESULTS[rng.int(0, 2)];
  const goals = rng.chance(0.3) ? 1 : 0;
  return {
    result, scoreUs: result === 'win' ? 2 : result === 'loss' ? 0 : 1, scoreThem: result === 'win' ? 0 : result === 'loss' ? 2 : 1,
    goals, assists: rng.chance(0.2) ? 1 : 0,
    coachRating: 4 + rng.next() * 4, fanRating: 4 + rng.next() * 4,
    position: rng.int(1, 6), clubs: 6, round,
    coachTrust: rng.int(25, 80), injured: rng.chance(0.1), flags: [],
    nextStrength: (['strong', 'even', 'weak'] as const)[rng.int(0, 2)],
    nextFlags: ['them_' + THEM[rng.int(0, THEM.length - 1)]],
    nextVenue: rng.chance(0.5) ? 'home' : 'away',
    leaderLost: rng.chance(0.3), bottomWon: rng.chance(0.3),
    voice: null, hasScored: goals > 0,
    leaderKey: 'olvar', bottomKey: 'rioseco', lastOpponentKey: 'terranova',
    lastWeek: [], moments: {},
    arc: Math.min(4, 1 + Math.floor(careerRound(season, round) / 6)),
  };
}

let repeats = 0; let total = 0;
const repeatsByGroup: Record<string, number> = Object.fromEntries(GROUPS.map((g) => [g, 0]));
/** Сколько разных строк группа успевает показать за карьеру — против её пула. */
const usedByGroup: Record<string, number[]> = Object.fromEntries(GROUPS.map((g) => [g, []]));
/** Доля «нашего» по туру карьеры — проверка, что кривая та, что задумана. */
const shareByRound: Record<number, number[]> = {};
/** Сколько постов группы пришло в туре — ловит «пул высох, группа недодала». */
const shortfall: Record<number, Record<string, number>> = {};

for (let n = 0; n < N; n++) {
  const rng = makeRng(7000 + n * 13);
  const seen = new Set<string>();
  const shown = new Set<string>();
  const used: Record<string, Set<string>> = Object.fromEntries(GROUPS.map((g) => [g, new Set<string>()]));

  for (let season = 1; season <= 2; season++) {
    for (let round = 1; round <= 10; round++) {
      const cr = careerRound(season, round);
      const quota = postQuota(season, round);
      const feed = buildFeed(ctx(season, round, rng), makeRng(7000 + n * 13 + cr * 977), seen, POSTS, quota);

      const local = feed.filter((p) => LOCAL_GROUPS.includes(p.group)).length;
      (shareByRound[cr] ??= []).push(feed.length ? local / feed.length : 0);
      shortfall[cr] ??= Object.fromEntries(GROUPS.map((g) => [g, 0]));

      for (const p of feed) {
        total += 1;
        // Считать по своему множеству: `buildFeed` дописывает в `seen` сам, и проверка по нему
        // после вызова всегда истинна — первый замер из-за этого показал 99.7% «повторов».
        if (shown.has(p.text)) { repeats += 1; repeatsByGroup[p.group] += 1; }
        shown.add(p.text);
        used[p.group].add(p.text);
      }
      for (const g of GROUPS) {
        const got = feed.filter((p) => p.group === g).length;
        if (got < (quota[g] ?? 0)) shortfall[cr][g] += (quota[g] ?? 0) - got;
      }
    }
  }
  for (const g of GROUPS) usedByGroup[g].push(used[g].size);
}

const pad = (s: string, n: number) => s.padEnd(n);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

console.log(`Карьер: ${N}, по 20 туров. Постов всего: ${total}.\n`);

console.log('ДОЛЯ «НАШОГО» ПО ТУРУ КАРЬЕРЫ (self + league + cross; потолок 65%)');
console.log(pad('тур', 6) + pad('сезон', 7) + pad('квота', 34) + pad('факт', 8) + 'недодано');
for (let cr = 1; cr <= 20; cr++) {
  const season = cr <= 10 ? 1 : 2; const round = cr <= 10 ? cr : cr - 10;
  const q = postQuota(season, round);
  const qs = GROUPS.map((g) => `${g[0]}${q[g] ?? 0}`).join(' ');
  const miss = GROUPS.map((g) => (shortfall[cr]?.[g] ? `${g}:${shortfall[cr][g]}` : '')).filter(Boolean).join(' ');
  console.log(pad(String(cr), 6) + pad(String(season), 7) + pad(`${qs}  = ${Math.round(localShare(q) * 100)}%`, 34)
    + pad(`${Math.round(avg(shareByRound[cr] ?? []) * 100)}%`, 8) + (miss || '—'));
}

console.log('\nПУЛ: сколько разных строк группа тратит за карьеру из того, что у неё есть');
console.log(pad('группа', 9) + pad('строк в пуле', 14) + pad('тратит (сред.)', 16) + pad('тратит (макс.)', 16) + 'запас');
for (const g of GROUPS) {
  const a = avg(usedByGroup[g]); const mx = Math.max(...usedByGroup[g]);
  console.log(pad(g, 9) + pad(String(poolLines[g]), 14) + pad(a.toFixed(1), 16) + pad(String(mx), 16)
    + `${Math.round((1 - mx / poolLines[g]) * 100)}%`);
}

console.log(`\nПОВТОРОВ за карьеру: ${repeats} из ${total} (${((repeats / total) * 100).toFixed(2)}%)`);
if (repeats) console.log('  по группам: ' + GROUPS.map((g) => `${g} ${repeatsByGroup[g]}`).filter((s) => !s.endsWith(' 0')).join(', '));
