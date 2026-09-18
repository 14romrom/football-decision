// Стрічка між матчами — пародія на твіттер: новини великого футболу з реальними клубами
// (без реальних людей — см. CLAUDE.md), наша ліга, болільники про персонажа, перетини двох
// світів («Барселона» не знайшла «Терра-Нову» на карті) і мета-жарти (FM, Disco Elysium, EA).
// Правила — данные (posts.json), условия — по итогу тура, таблице, следующему сопернику и
// карьере; выбор тот же, что у реплик и ленты матча (flavor.ts:pickFresh), с памятью через
// историю, чтобы за сезон один твит не читался дважды.

import postsJson from '../content/posts.json';
import { pickFresh } from './flavor';
import type { Rng } from './rng';
import type { Career } from './career';
import type { Season } from './season';
import { standings, US } from './season';
import type { VoiceKey } from './types';

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
};

export type PostRule = {
  group: PostGroup; account: string; when?: PostWhen; lines: string[];
  /** Ответ под постом — от другого аккаунта, одна из строк. */
  reply?: { account: string; lines: string[] };
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
    flags: (career.carriedFlags ?? []).filter((f) => !(f.after && f.after > 0)).map((f) => f.flag),
    nextStrength: next?.strength ?? null, nextFlags: next?.traits.map((t) => 'them_' + t) ?? [], nextVenue: next?.venue ?? null,
    leaderLost: lostBy(leader.club), bottomWon: wonBy(bottom.club),
    voice, hasScored: season.player.goals + season.player.assists > 0,
    leaderKey: leader.club, bottomKey: bottom.club,
    lastOpponentKey: ours ? (ours.home === US ? ours.away : ours.home) : null,
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
  return true;
}

export type Post = {
  account: PostAccount; text: string; group: PostGroup;
  reply?: { account: PostAccount; text: string };
  /** Часы назад и «лайки» — декорация, детерминированная по rng. */
  hoursAgo: number; likes: number; reposts: number;
};

/** Сколько постов каждой группы в одной стрічці: про себя больше всего — это же его лента. */
export const POST_QUOTA: Record<PostGroup, number> = { self: 3, league: 2, world: 2, cross: 1, meta: 1 };

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
    for (let i = 0; i < quota[group]; i++) {
      const fresh = pool.filter((p) => !taken.has(p.text));
      const pick = pickFresh(fresh, seen, rng);
      if (!pick) break;
      taken.add(pick.text);
      seen.add(pick.text);
      const account = content.accounts[pick.rule.account];
      const reply = pick.rule.reply
        ? { account: content.accounts[pick.rule.reply.account], text: rng.pick(pick.rule.reply.lines) }
        : undefined;
      out.push({ account, text: pick.text, group, reply, hoursAgo: 0, likes: 0, reposts: 0 });
    }
  }
  // Перемешать и раздать время/лайки: издания собирают тысячи, фанаты — десятки.
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
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
