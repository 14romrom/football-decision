// Стрічка між матчами — пародія на твіттер: новини великого футболу з реальними клубами
// (без реальних людей — см. CLAUDE.md), наша ліга, болільники про персонажа, перетини двох
// світів («Барселона» не знайшла «Терра-Нову» на карті) і мета-жарти (FM, Disco Elysium, EA).
// Правила — данные (posts.json), условия — по итогу тура, таблице, следующему сопернику и
// карьере; выбор тот же, что у реплик и ленты матча (flavor.ts:pickFresh), с памятью через
// историю, чтобы за сезон один твит не читался дважды.

import postsJsonRaw from '../content/posts.json';
import { tr, LANG } from '../content/i18n';
// Контент цього модуля йде повз content/index.ts, тому переклад (M47) вмикається тут же.
const postsJson = tr(postsJsonRaw);
import { pickFresh } from './flavor';
import type { Rng } from './rng';
import { peopleFlags, type Career, arcStage, metLastYear, nightKnowledge } from './career';
import type { Season } from './season';
import { standings, US, type MomentRef } from './season';
import type { VoiceKey } from './types';
import type { ActivityEffect } from './week';

export type PostGroup = 'self' | 'league' | 'world' | 'cross' | 'meta';

export type PostAccount = {
  name: string; handle: string;
  /** Оформление и порядок величин лайков: издание, фанат, клуб, пародийный аккаунт. */
  kind: 'news' | 'fan' | 'club' | 'parody';
};

export type PostWhen = {
  result?: 'win' | 'draw' | 'loss'; bigLoss?: boolean; bigWin?: boolean;
  /** Персонаж забив / віддав у последнем матче; scoreless — команда не забила. */
  scored?: boolean; assisted?: boolean; scoreless?: boolean; cleanSheet?: boolean;
  position?: 'top' | 'mid' | 'bottom';
  lowTrust?: boolean; highTrust?: boolean; injured?: boolean;
  fanRatingMin?: number; fanRatingMax?: number; coachRatingMin?: number; coachRatingMax?: number;
  /** Флаги, принесённые из матча (sub_threat, partner_annoyed, knock…). */
  flags?: string[];
  /** Следующий соперник: сила и характеристики (them_*). */
  nextStrength?: 'strong' | 'even' | 'weak'; nextFlags?: string[]; nextVenue?: 'home' | 'away';
  minRound?: number; maxRound?: number;
  /** Чужие результаты тура: лидер проиграл, дно выиграло. */
  leaderLost?: boolean; bottomWon?: boolean;
  /** Доминирующий голос карьеры (voiceCounts). */
  voice?: VoiceKey;
  /** Персонаж забивал хоть раз за сезон. */
  hasScored?: boolean;
  /** Хотя бы одно из дел выбрано на неделе перед этим матчем (activities.json id) — стрічка
   *  реагирует на побачення, подкаст, Дубай. */
  week?: string[];
  /** Пост про конкретный момент матча: в строках доступны {moment.minute}, {moment.past},
   *  {moment.recap}; правило подходит, только если такой момент в матче был. */
  moment?: 'best' | 'worst';
  /** Стан арки (career.ts:arcStage): ставлення міста дрейфує — «хто це» → «той з коліном» → «наш». */
  arcMin?: number;
  arcMax?: number;
  /** Що Реєс сказав у стрічці раніше (`career.replyLog`, пари `<пост>:<варіант>`): правило підходить,
   *  якщо хоч одна з перелічених відповідей уже прозвучала. Для відлуння, і тільки для нього:
   *  рішення користувача 04.10 — відповідям у стрічці великої ваги не давати, лише подекуди підсвітити,
   *  щоб світ здавався живим. Тому в такого поста наслідків або немає, або вони дрібні. */
  said?: string[];
};

/** Вид поста (19.09, «форма»): poll — опрос с абсурдными вариантами, проценты раздаёт rng;
 *  deleted — «Цей твіт видалено», а в ответе фанат цитирует скрин ({quote}); promo — реклама с
 *  пометкой; live — лайв-твит с минутой матча вместо «N год», уходит в низ ленты. */
export type PostKind = 'post' | 'poll' | 'deleted' | 'promo' | 'live';

/** Ответ игрока на пост — решение без кубика: три реплики, у каждой последствие как у дела
 *  недели (ActivityEffect: трибуны, тренер, кураж, флаг на матч) и реакция автора поста. */
export type ReplyOption = {
  text: string; reaction: string; effect: ActivityEffect;
  /** Только у тех ответов, которые город потом вспомнит: пара `<id правила>:<id варианта>`
   *  уходит в `career.replyLog`, и её читает `PostWhen.said`. Без `id` ответ живёт один вечер. */
  id?: string;
};

export type PostRule = {
  group: PostGroup; account: string; when?: PostWhen; lines: string[];
  /** Имя правила — нужно только тем постам, чей ответ город запомнит (`replyOptions[].id`). */
  id?: string;
  /** Ответ под постом — от другого аккаунта, одна из строк. */
  reply?: { account: string; lines: string[] };
  kind?: PostKind;
  /** Варианты опроса (kind: poll). */
  poll?: string[];
  /** Минута матча для лайв-твита (kind: live): [от, до]. */
  live?: [number, number];
  /** Пост, на который игрок может ответить. В одной стрічці — не больше одного такого. */
  replyOptions?: ReplyOption[];
};

export type PostsContent = { accounts: Record<string, PostAccount>; posts: PostRule[] };
export const POSTS = postsJson as PostsContent;

/** Что стрічка знает о моменте: последний тур, таблица, следующий соперник, карьера. */
export type PostContext = {
  result: 'win' | 'draw' | 'loss'; scoreUs: number; scoreThem: number;
  goals: number; assists: number; coachRating: number; fanRating: number;
  position: number; clubs: number; round: number;
  coachTrust: number; injured: boolean; flags: string[];
  nextStrength: 'strong' | 'even' | 'weak' | null; nextFlags: string[]; nextVenue: 'home' | 'away' | null;
  leaderLost: boolean; bottomWon: boolean;
  voice: VoiceKey | null; hasScored: boolean;
  /** Ключи клубов для плейсхолдеров: лидер, дно, последний соперник. */
  leaderKey: string; bottomKey: string; lastOpponentKey: string | null;
  /** Дела недели перед этим матчем (career.weekLog). */
  lastWeek: string[];
  /** Что Реєс уже отвечал в стрічці за карьеру (career.replyLog) — для отлуння, см. `PostWhen.said`. */
  said: string[];
  /** Лучший и худший момент последнего матча (season.rounds[].moments). */
  moments: { best?: MomentRef; worst?: MomentRef };
  arc: number;
};

const LOW_TRUST = 40;
const HIGH_TRUST = 65;

export function buildPostContext(
  season: Season, career: Career,
  next: { opponentKey: string; venue: 'home' | 'away'; strength: 'strong' | 'even' | 'weak'; traits: string[] } | null,
): PostContext | null {
  const rounds = season.rounds ?? [];
  const last = rounds[rounds.length - 1];
  if (!last) return null;
  const rows = standings(season);
  const us = rows.find((r) => r.club === US)!;
  const others = rows.filter((r) => r.club !== US);
  // Лидер и дно — среди чужих: «„Вальмара“ виграла» про себя пишут другие правила.
  const leader = others[0];
  const bottom = others[others.length - 1];
  const lastRound = season.played.filter((m) => m.round === season.round - 1);
  const wonBy = (club: string) => lastRound.some((m) => (m.home === club && m.homeGoals > m.awayGoals) || (m.away === club && m.awayGoals > m.homeGoals));
  const lostBy = (club: string) => lastRound.some((m) => (m.home === club && m.homeGoals < m.awayGoals) || (m.away === club && m.awayGoals < m.homeGoals));
  const ours = lastRound.find((m) => m.home === US || m.away === US);
  const counts = Object.entries(career.voiceCounts) as [VoiceKey, number][];
  const top = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  const voice = top[1] >= 3 && counts.filter(([, n]) => n === top[1]).length === 1 ? top[0] : null;
  return {
    result: last.scoreUs > last.scoreThem ? 'win' : last.scoreUs < last.scoreThem ? 'loss' : 'draw',
    scoreUs: last.scoreUs, scoreThem: last.scoreThem,
    goals: last.goals, assists: last.assists, coachRating: last.coachRating, fanRating: last.fanRating,
    position: us.position, clubs: rows.length, round: season.round,
    coachTrust: career.coachTrust,
    injured: career.injuredMatches > 0 || (career.carriedFlags ?? []).some((f) => f.flag === 'knock'),
    // Підвищення (M14): `promoted_earned` / `promoted_scandal` на весь другий сезон; `met_last_year` — суперник із минулого сезону.
    // M28: про липневу ніч база говорить тільки тоді, коли її бачив хтось із клубу (фізіо, лікар) —
    // `night_rumor`; «дійшов сам» дає тишу (`night_secret`), і це весь приз за мовчання.
    flags: [...(career.carriedFlags ?? []).filter((f) => !(f.after && f.after > 0)).map((f) => f.flag), ...peopleFlags(career).map((f) => f.flag), ...(career.promotion ? ['promoted_' + career.promotion] : []), ...(career.subLeft ? ['sub_left'] : []),
      ...(() => { const n = nightKnowledge(career); return [...(n.rumor ? ['night_rumor'] : []), ...(n.secret ? ['night_secret'] : []), ...(n.denied ? ['knee_denied'] : [])]; })()],
    nextStrength: next?.strength ?? null, nextFlags: [...(next?.traits.map((t) => 'them_' + t) ?? []), ...(next && metLastYear(career, next.opponentKey) ? ['met_last_year'] : []), ...(next && career.subLeft && career.subClub === next.opponentKey ? ['sub_there'] : [])], nextVenue: next?.venue ?? null,
    leaderLost: lostBy(leader.club), bottomWon: wonBy(bottom.club),
    voice, hasScored: season.player.goals + season.player.assists > 0,
    leaderKey: leader.club, bottomKey: bottom.club,
    lastOpponentKey: ours ? (ours.home === US ? ours.away : ours.home) : null,
    // Неделя перед сыгранным туром записана с round = этот тур до инкремента (week.ts:recordWeek).
    // Справи минулого тижня і їхні ісходи («interview:dream_ego») — стрічка повторює те, що Реєс сказав.
    lastWeek: (() => { const w = (career.weekLog ?? []).find((x) => x.season === season.number && x.round === season.round - 1); return [...(w?.chosen ?? []), ...(w?.outcomes ?? [])]; })(),
    // Відповіді, які місто запам'ятало (M-стрічка, 04.10): тільки ті, у кого є `id`, — решта
    // живе один вечір. Віку в умови не додаємо: пости не повторюються, тож відлуння спрацює
    // один раз у найближчій стрічці, де все інше в правилі теж зійшлося.
    said: (career.replyLog ?? []).map((r) => r.said),
    arc: arcStage(career),
    moments: last.moments ?? {},
  };
}

export function matchesPost(w: PostWhen | undefined, c: PostContext): boolean {
  if (!w) return true;
  if (w.result && w.result !== c.result) return false;
  if (w.bigLoss !== undefined && w.bigLoss !== c.scoreThem - c.scoreUs >= 3) return false;
  if (w.bigWin !== undefined && w.bigWin !== c.scoreUs - c.scoreThem >= 3) return false;
  if (w.scored !== undefined && w.scored !== c.goals > 0) return false;
  if (w.assisted !== undefined && w.assisted !== c.assists > 0) return false;
  if (w.scoreless !== undefined && w.scoreless !== (c.scoreUs === 0)) return false;
  if (w.cleanSheet !== undefined && w.cleanSheet !== (c.scoreThem === 0)) return false;
  if (w.position) {
    const third = c.position <= 2 ? 'top' : c.position > c.clubs - 2 ? 'bottom' : 'mid';
    if (third !== w.position) return false;
  }
  if (w.lowTrust !== undefined && w.lowTrust !== c.coachTrust < LOW_TRUST) return false;
  if (w.highTrust !== undefined && w.highTrust !== c.coachTrust >= HIGH_TRUST) return false;
  if (w.injured !== undefined && w.injured !== c.injured) return false;
  if (w.fanRatingMin !== undefined && c.fanRating < w.fanRatingMin) return false;
  if (w.fanRatingMax !== undefined && c.fanRating > w.fanRatingMax) return false;
  if (w.coachRatingMin !== undefined && c.coachRating < w.coachRatingMin) return false;
  if (w.coachRatingMax !== undefined && c.coachRating > w.coachRatingMax) return false;
  if (w.flags && !w.flags.every((f) => c.flags.includes(f))) return false;
  if (w.nextStrength && w.nextStrength !== c.nextStrength) return false;
  if (w.nextFlags && !w.nextFlags.every((f) => c.nextFlags.includes(f))) return false;
  if (w.nextVenue && w.nextVenue !== c.nextVenue) return false;
  if (w.minRound !== undefined && c.round < w.minRound) return false;
  if (w.maxRound !== undefined && c.round > w.maxRound) return false;
  if (w.leaderLost !== undefined && w.leaderLost !== c.leaderLost) return false;
  if (w.bottomWon !== undefined && w.bottomWon !== c.bottomWon) return false;
  if (w.voice && w.voice !== c.voice) return false;
  if (w.hasScored !== undefined && w.hasScored !== c.hasScored) return false;
  if (w.week && !w.week.some((id) => c.lastWeek.includes(id))) return false;
  if (w.moment && !c.moments[w.moment]) return false;
  if (w.arcMin !== undefined && c.arc < w.arcMin) return false;
  if (w.arcMax !== undefined && c.arc > w.arcMax) return false;
  if (w.said && !w.said.some((id) => c.said.includes(id))) return false;
  return true;
}

export type Post = {
  account: PostAccount; text: string; group: PostGroup;
  reply?: { account: PostAccount; text: string };
  /** Часы назад и «лайки» — декорация, детерминированная по rng. */
  hoursAgo: number; likes: number; reposts: number;
  kind: PostKind;
  /** Результаты опроса (kind: poll), проценты в сумме 100. */
  poll?: { text: string; pct: number }[];
  /** Минута лайв-твита (kind: live). */
  liveMinute?: number;
  replyOptions?: ReplyOption[];
};

/** Порядковое «хвилина» в називному («62-га», «6-та», «41-ша», «40-ва») и знахідному («62-гу», «6-ту»). */
export function minuteOrdinal(n: number, kase: 'nom' | 'acc' = 'nom'): string {
  const d = n % 10, dd = n % 100;
  // Англійська (M47): відмінка немає, суфікс один — st / nd / rd / th. Це той випадок, коли
  // перекласти рядок не можна: форму слова будує код, і для другої мови потрібна своя гілка.
  if (LANG === 'en') {
    if (dd >= 11 && dd <= 13) return `${n}th`;
    return `${n}${d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}`;
  }
  let end: string;
  if (dd >= 11 && dd <= 19) end = kase === 'nom' ? 'та' : 'ту';
  else if (n === 40) end = kase === 'nom' ? 'ва' : 'ву';
  else if (d === 1) end = kase === 'nom' ? 'ша' : 'шу';
  else if (d === 2) end = kase === 'nom' ? 'га' : 'гу';
  else if (d === 3) end = kase === 'nom' ? 'тя' : 'тю';
  else if (d === 7 || d === 8) end = kase === 'nom' ? 'ма' : 'му';
  else end = kase === 'nom' ? 'та' : 'ту';
  return `${n}-${end}`;
}

/** {moment.minute} / {moment.ord} («62-га») / {moment.acc} («62-гу») / {moment.past} /
 *  {moment.recap} — момент матча, на который ссылается правило. Родовий и місцевий — «-ї» и «-й»
 *  одинаковы для всех чисел, их пишут прямо в тексте: «{moment.minute}-ї хвилини», «на {moment.minute}-й». */
function fillMoment(text: string, rule: PostRule, ctx: PostContext): string {
  const m = rule.when?.moment ? ctx.moments[rule.when.moment] : undefined;
  if (!m) return text;
  return text
    .replace(/\{moment\.ord\}/g, minuteOrdinal(m.minute, 'nom'))
    .replace(/\{moment\.acc\}/g, minuteOrdinal(m.minute, 'acc'))
    .replace(/\{moment\.minute\}/g, String(m.minute))
    .replace(/\{moment\.past\}/g, m.past).replace(/\{moment\.recap\}/g, m.recap);
}

/** Проценты опроса: один вариант всегда «побеждает» неприлично, сумма — 100. */
function pollResults(options: string[], rng: Rng): { text: string; pct: number }[] {
  const raw = options.map(() => rng.int(5, 30));
  raw[rng.int(0, raw.length - 1)] += 60;
  const total = raw.reduce((a, b) => a + b, 0);
  const pct = raw.map((r) => Math.round((r / total) * 100));
  pct[pct.length - 1] += 100 - pct.reduce((a, b) => a + b, 0);
  return options.map((text, i) => ({ text, pct: pct[i] }));
}

/** Сколько постов каждой группы в одной стрічці. Доля игрового мира растёт с сезоном (решение
 *  пользователя 19.09): в первом сезоне игрок ещё не знает ни Кнаппа, ни «Терра-Нови», и шутка
 *  про них не читается — основа ленты общепонятная (великий футбол, мета), про нас — 2–3 поста;
 *  со второго сезона привязанность есть, и «наша ліга» занимает половину. */
export const POST_QUOTA: Record<PostGroup, number> = { self: 3, league: 2, world: 3, cross: 1, meta: 1 };
/** С какой вероятностью в стрічку подмешивается пост, на который можно ответить (если есть подходящий). */
export const REPLY_CHANCE = 0.5;

/** «Наш» мир — про Реєса, нашу лігу и наш город; «общее» — великий футбол и мета.
 *  Тот же раздел, что в `tests/posts.test.ts`: `cross` — это большой мир, который заметил нашу
 *  дыру на карте, то есть разговор всё равно про нас. */
export const LOCAL_GROUPS: PostGroup[] = ['self', 'league', 'cross'];
export const localShare = (q: Record<PostGroup, number>): number => {
  const all = (Object.values(q) as number[]).reduce((a, b) => a + b, 0);
  return all ? LOCAL_GROUPS.reduce((n, g) => n + (q[g] ?? 0), 0) / all : 0;
};

/** Доля «нашего» растёт через всю кар'єру, а не ступенькой на границе сезонов (решение
 *  пользователя 04.10): початок — стрічка живе без нас, місто про Реєса ще не говорить, і перший
 *  пост про нього чогось вартий; далі частка росте до стелі **65%** — світ ніколи не стає цілком
 *  про тебе. Ключ — тур кар'єри (1..20), бо літо місто не стирає: у другому сезоні Реєс
 *  повертається місцевим, і скидати частку назад означало б, що за три місяці його забули.
 *
 *  **Чому саме так, а не інакше.** Нуль «наших» на старті відкинуто: усі реакції стрічки на матч —
 *  це `self` (гол, оцінка, флаг, пост про конкретний момент), і стрічка, яка два тури поспіль не
 *  помічає матч, читається як зламана, а не як мовчазне місто. Тому мінімум — один.
 *  Стеля 6 із 10: 7 було б 70%, а 65% — межа.
 *
 *  **Пул тримає саме meta, не self** (замір `npx tsx tools/feed-share.ts`): пам'ять стрічки —
 *  `POSTS_KEEP` = 400 рядків, тобто вся кар'єра (200 постів), тож рахувати треба за дві сезони,
 *  а не за одну. У meta всього 29 рядків: по 2 за тур це 27 із 29 — повтор на першій же невдачі.
 *  Тому meta скрізь 1, а слабину забирає `world` (190 рядків, найбільший запас). */
export const POST_QUOTA_BY_CAREER_ROUND: { upTo: number; quota: Record<PostGroup, number> }[] = [
  { upTo: 2, quota: { self: 1, league: 0, world: 8, cross: 0, meta: 1 } },   // 10%
  { upTo: 4, quota: { self: 2, league: 0, world: 7, cross: 0, meta: 1 } },   // 20%
  { upTo: 7, quota: { self: 2, league: 1, world: 6, cross: 0, meta: 1 } },   // 30%
  { upTo: 10, quota: { self: 3, league: 1, world: 5, cross: 0, meta: 1 } },  // 40%
  { upTo: 14, quota: { self: 3, league: 1, world: 4, cross: 1, meta: 1 } },  // 50%
  { upTo: Infinity, quota: { self: 4, league: 1, world: 3, cross: 1, meta: 1 } }, // 60% — стеля
];

/** Тур кар'єри: сезон 1 — 1..10, сезон 2 — 11..20. Стикові йдуть 11-м матчем сезону, тому
 *  обрізаємо до довжини кола: частку вони не зсувають. */
export const careerRound = (season: number, round: number): number =>
  (Math.max(1, season) - 1) * 10 + Math.max(1, Math.min(round, 10));

export function postQuota(season: number, round = 10): Record<PostGroup, number> {
  const cr = careerRound(season, round);
  return (POST_QUOTA_BY_CAREER_ROUND.find((s) => cr <= s.upTo) ?? POST_QUOTA_BY_CAREER_ROUND[POST_QUOTA_BY_CAREER_ROUND.length - 1]).quota;
}

/** Стрічка: по квоте на группу, вес 3^ключей условия, виденные строки уступают свежим;
 *  порядок постов — перемешан, время «назад» растёт вниз по ленте. */
export function buildFeed(
  ctx: PostContext, rng: Rng, seen: Set<string> = new Set(), content: PostsContent = POSTS, quota = POST_QUOTA,
): Post[] {
  const out: Post[] = [];
  for (const group of Object.keys(quota) as PostGroup[]) {
    const pool: { text: string; weight: number; rule: PostRule }[] = [];
    for (const rule of content.posts) {
      if (rule.group !== group || !matchesPost(rule.when, ctx)) continue;
      const weight = 3 ** Object.keys(rule.when ?? {}).length;
      for (const text of rule.lines) pool.push({ text, weight, rule });
    }
    const taken = new Set<string>();
    for (let i = 0; i < (quota[group] ?? 0); i++) {
      const fresh = pool.filter((p) => !taken.has(p.text));
      const pick = pickFresh(fresh, seen, rng);
      if (!pick) break;
      taken.add(pick.text);
      seen.add(pick.text);
      const account = content.accounts[pick.rule.account];
      const kind: PostKind = pick.rule.kind ?? 'post';
      // Момент матча подставляется здесь: какой именно (best/worst) знает только правило.
      const withMoment = (t: string) => fillMoment(t, pick.rule, ctx);
      pick.text = withMoment(pick.text);
      // Удалённый твит: на экране «Цей твіт видалено», а оригинал живёт в ответе-скрине.
      const replyText = pick.rule.reply ? withMoment(rng.pick(pick.rule.reply.lines)).replace('{quote}', pick.text) : undefined;
      const reply = pick.rule.reply && replyText !== undefined
        ? { account: content.accounts[pick.rule.reply.account], text: replyText }
        : undefined;
      out.push({
        account, text: kind === 'deleted' ? 'Цей твіт видалено' : pick.text, group, reply, hoursAgo: 0, likes: 0, reposts: 0, kind,
        ...(kind === 'poll' && pick.rule.poll ? { poll: pollResults(pick.rule.poll, rng) } : {}),
        ...(kind === 'live' && pick.rule.live ? { liveMinute: rng.int(pick.rule.live[0], pick.rule.live[1]) } : {}),
        ...(pick.rule.replyOptions ? { replyOptions: pick.rule.replyOptions.map((o) => ({ ...o, text: withMoment(o.text), reaction: withMoment(o.reaction) })) } : {}),
      });
    }
  }
  // Момент матча — самое личное, что есть в ленте: если он был, один пост о нём гарантирован
  // (поражение — о худшем, победа — о лучшем, иначе как выпадет). Подменяет пост своей группы.
  const wanted: ('best' | 'worst')[] = ctx.result === 'loss' ? ['worst', 'best'] : ctx.result === 'win' ? ['best', 'worst'] : rng.next() < 0.5 ? ['worst', 'best'] : ['best', 'worst'];
  const which = wanted.find((k) => ctx.moments[k]);
  if (which && !out.some((p) => p.text.includes(String(ctx.moments[which]!.minute)) && p.text.includes(ctx.moments[which]!.past))) {
    const rules = content.posts.filter((r) => r.when?.moment === which && matchesPost(r.when, ctx) && r.lines.some((t) => !seen.has(t)));
    const rule = rules.length ? rng.pick(rules) : null;
    const slot = rule ? out.findIndex((p) => p.group === rule.group && p.kind === 'post' && !p.replyOptions) : -1;
    if (rule && slot >= 0) {
      const text = rng.pick(rule.lines.filter((t) => !seen.has(t)));
      seen.add(text);
      const fill = (t: string) => fillMoment(t, rule, ctx);
      const reply = rule.reply ? { account: content.accounts[rule.reply.account], text: fill(rng.pick(rule.reply.lines)) } : undefined;
      out[slot] = {
        ...out[slot], account: content.accounts[rule.account], text: fill(text), reply, kind: rule.kind ?? 'post',
        ...(rule.kind === 'poll' && rule.poll ? { poll: pollResults(rule.poll.map(fill), rng) } : {}),
        ...(rule.kind === 'live' && rule.live ? { liveMinute: ctx.moments[which]!.minute } : {}),
        ...(rule.replyOptions ? { replyOptions: rule.replyOptions.map((o) => ({ ...o, text: fill(o.text), reaction: fill(o.reaction) })) } : {}),
      };
    }
  }

  // Ответить можно на один пост за стрічку: первый по ленте, остальные — просто читаются.
  let replyable = false;
  for (const p of out) {
    if (!p.replyOptions) continue;
    if (replyable) delete p.replyOptions;
    replyable = true;
  }
  // Пост с ответом сам по себе выпадает редко (квота self — 2–3 из большого пула), а решение в
  // стрічці — фишка: если он есть в пуле, с вероятностью REPLY_CHANCE подменяем им один пост
  // своей группы. Не всегда — иначе каждая стрічка превращается в допрос.
  if (!replyable && rng.next() < REPLY_CHANCE) {
    const candidates = content.posts.filter((r) => r.replyOptions && matchesPost(r.when, ctx) && r.lines.some((t) => !seen.has(t)));
    const rule = candidates.length ? rng.pick(candidates) : null;
    const slot = rule ? out.findIndex((p) => p.group === rule.group && !p.poll && p.kind === 'post') : -1;
    if (rule && slot >= 0) {
      const text = rng.pick(rule.lines.filter((t) => !seen.has(t)));
      seen.add(text);
      const fill = (t: string) => fillMoment(t, rule, ctx);
      out[slot] = {
        ...out[slot], account: content.accounts[rule.account], text: fill(text), reply: undefined, kind: 'post',
        replyOptions: rule.replyOptions!.map((o) => ({ ...o, text: fill(o.text), reaction: fill(o.reaction) })),
      };
    }
  }
  // Перемешать и раздать время/лайки: издания собирают тысячи, фанаты — десятки.
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  // Лайв-твиты — в конец: они были раньше всех, ещё во время матча.
  out.sort((a, b) => Number(a.kind === 'live') - Number(b.kind === 'live'));
  let hours = rng.int(1, 3);
  for (const p of out) {
    p.hoursAgo = hours;
    hours += rng.int(1, 6);
    const scale = p.account.kind === 'fan' ? 1 : p.account.kind === 'parody' ? 20 : 60;
    p.likes = rng.int(4, 40) * scale + rng.int(0, 9);
    p.reposts = Math.round(p.likes / rng.int(4, 12));
  }
  return out;
}

/** «2 год», «1 д» — время поста, как в твиттере. */
export function agoLabel(hours: number): string {
  return hours < 24 ? `${hours} год` : `${Math.floor(hours / 24)} д`;
}

/** «2,4 тис.» — лайки, как в твиттере. */
export function countLabel(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + ' тис.' : String(n);
}
