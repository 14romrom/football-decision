// Стрічка між матчами (posts.json, engine/posts.ts): реальные клубы — да, реальные люди — нет;
// посты знают тур, таблицу и следующего соперника; за сезон не повторяются.
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { createSeason, ourFixture, recordRound, US } from '../src/engine/season';
import { defaultCareer } from '../src/engine/career';
import { fillNames, opponentTraits } from '../src/engine/names';
import { buildFeed, buildPostContext, matchesPost, POST_QUOTA, postQuota, POSTS, type PostContext, type PostGroup } from '../src/engine/posts';
import { OPPONENTS, rosterFor } from '../src/content';

const keys = Object.keys(OPPONENTS);
const strengths = Object.fromEntries(keys.map((k) => [k, OPPONENTS[k].strength]));
const GROUPS: PostGroup[] = ['self', 'league', 'world', 'cross', 'meta'];
const EXTRA = {
  last: 'Ольвар', 'last.gen': 'Ольвара', leader: 'Ольвар', 'leader.gen': 'Ольвара',
  bottom: 'Ріо-Секо', 'bottom.gen': 'Ріо-Секо', score: '1:2', position: '4', round: '5', quote: '…',
};

/** Правило CLAUDE.md: реальных людей в контенте нет. Клубы — можно, это сатира на клубы. */
const REAL_PEOPLE = /Мбапп|Роналд|Мессі|Холанд|Сафонов|Салах|Вінісіус|Магуайр|Фернандеш|Нуньєс|Кейн|Гвардіол|Моурінь|Конте|Лукаку|Неймар|Онана|Каземір|Райс|Трент|Арнольд|Пулішич|Емері|Перес|Клопп|Артет|Слот|Анчелотт|Флік|Путін/;

const ctx = (over: Partial<PostContext> = {}): PostContext => ({
  result: 'draw', scoreUs: 1, scoreThem: 1, goals: 0, assists: 0, coachRating: 6, fanRating: 6,
  position: 3, clubs: 6, round: 4, coachTrust: 55, injured: false, flags: [],
  nextStrength: 'even', nextFlags: ['them_star'], nextVenue: 'home',
  leaderLost: false, bottomWon: false, voice: null, hasScored: true,
  leaderKey: 'olvar', bottomKey: 'rioseco', lastOpponentKey: 'terranova', lastWeek: [], ...over,
});

describe('стрічка: контент', () => {
  it('аккаунты существуют, у каждой группы есть безусловное правило, пулов хватает на сезон', () => {
    for (const r of POSTS.posts) {
      expect(POSTS.accounts[r.account], r.account).toBeDefined();
      if (r.reply) expect(POSTS.accounts[r.reply.account], r.reply.account).toBeDefined();
      expect(GROUPS, r.group).toContain(r.group);
    }
    for (const g of GROUPS) expect(POSTS.posts.some((r) => r.group === g && !r.when), g).toBe(true);
    const count = (g: PostGroup) => POSTS.posts.filter((r) => r.group === g).reduce((n, r) => n + r.lines.length, 0);
    expect(count('self')).toBeGreaterThanOrEqual(60);
    expect(count('league')).toBeGreaterThanOrEqual(40);
    expect(count('world')).toBeGreaterThanOrEqual(60);
    expect(count('cross')).toBeGreaterThanOrEqual(15);
    expect(count('meta')).toBeGreaterThanOrEqual(20);
  });

  it('плейсхолдеры разрешаются любым ростером; реальных людей по имени нет', () => {
    const texts = POSTS.posts.flatMap((r) => [
      ...r.lines, ...(r.reply?.lines ?? []), ...(r.poll ?? []),
      ...(r.replyOptions ?? []).flatMap((o) => [o.text, o.reaction]),
    ]);
    for (const key of keys) {
      const roster = rosterFor(key, makeRng(2));
      for (const t of texts) expect(fillNames(t, roster, EXTRA), t).not.toMatch(/\{[a-z]/);
      for (const a of Object.values(POSTS.accounts)) expect(fillNames(a.name, roster, EXTRA)).not.toMatch(/\{[a-z]/);
    }
    for (const t of texts) expect(t, t).not.toMatch(REAL_PEOPLE);
    // Реальные клубы — только в большом мире и на пересечении миров, наша лига живёт своими.
    const REAL_CLUBS = /Тоттенгем|Ліверпуль|Арсенал|Челсі|Реал|Барселон|Ювентус|Мілан|Інтер|ПСЖ|Баварі|Сіті|Юнайтед/;
    for (const r of POSTS.posts) if (r.group === 'self' || r.group === 'league') for (const t of r.lines) expect(t, t).not.toMatch(REAL_CLUBS);
  });

  it('условия работают: пост про гол не выпадает без гола, про лидера — пока лидер не проиграл', () => {
    const scoredLines = new Set(POSTS.posts.filter((r) => r.when?.scored).flatMap((r) => r.lines));
    const leaderLines = new Set(POSTS.posts.filter((r) => r.when?.leaderLost).flatMap((r) => r.lines));
    for (let i = 0; i < 30; i++) {
      for (const p of buildFeed(ctx(), makeRng(100 + i))) {
        expect(scoredLines.has(p.text), p.text).toBe(false);
        expect(leaderLines.has(p.text), p.text).toBe(false);
      }
    }
    expect(matchesPost({ scored: true }, ctx({ goals: 1 }))).toBe(true);
    expect(matchesPost({ position: 'bottom' }, ctx({ position: 5 }))).toBe(true);
    expect(matchesPost({ position: 'bottom' }, ctx({ position: 4 }))).toBe(false);
    expect(matchesPost({ nextFlags: ['them_veteran'] }, ctx())).toBe(false);
    expect(matchesPost({ voice: 'ego' }, ctx({ voice: 'ego' }))).toBe(true);
  });

  it('стрічка — по квоте на группу, без дублей, с лайками и временем', () => {
    const feed = buildFeed(ctx({ goals: 1, result: 'win', scoreUs: 2 }), makeRng(9));
    expect(feed).toHaveLength(Object.values(POST_QUOTA).reduce((a, b) => a + b, 0));
    for (const g of GROUPS) expect(feed.filter((p) => p.group === g), g).toHaveLength(POST_QUOTA[g]);
    expect(new Set(feed.map((p) => p.text)).size).toBe(feed.length);
    for (const p of feed) { expect(p.likes).toBeGreaterThan(0); expect(p.hoursAgo).toBeGreaterThan(0); }
    expect(feed.some((p) => p.reply)).toBe(true);
  });

  it('первый сезон — 2–3 поста про игровой мир, остальное общее; со второго — половина наша', () => {
    const q1 = postQuota(1);
    expect(q1.self + q1.league + q1.cross).toBeLessThanOrEqual(3);
    expect(q1.world + q1.meta).toBeGreaterThanOrEqual(6);
    const feed1 = buildFeed(ctx(), makeRng(31), new Set(), POSTS, q1);
    expect(feed1.filter((p) => p.group === 'self' || p.group === 'league' || p.group === 'cross')).toHaveLength(3);
    const q2 = postQuota(2);
    expect(q2.self + q2.league + q2.cross).toBeGreaterThanOrEqual(5);
    expect(postQuota(7)).toEqual(q2);
  });

  it('форма: опрос в сумме 100, видалений твіт цитируется в ответе, лайв — с минутой и внизу, ответить можно на один пост', () => {
    let sawPoll = false, sawDeleted = false, sawLive = false;
    for (let i = 0; i < 60; i++) {
      const feed = buildFeed(ctx({ result: 'loss', scoreUs: 0, scoreThem: 1, lastWeek: ['insta_date'], coachTrust: 30 }), makeRng(700 + i));
      expect(feed.filter((p) => p.replyOptions).length).toBeLessThanOrEqual(1);
      for (const p of feed) {
        if (p.kind === 'poll') { sawPoll = true; expect(p.poll!.reduce((a, o) => a + o.pct, 0)).toBe(100); }
        if (p.kind === 'deleted') { sawDeleted = true; expect(p.text).toBe('Цей твіт видалено'); expect(p.reply!.text).not.toContain('{quote}'); expect(p.reply!.text.length).toBeGreaterThan(20); }
        if (p.kind === 'live') { sawLive = true; expect(p.liveMinute).toBeGreaterThan(0); }
      }
      const liveIdx = feed.map((p) => p.kind === 'live');
      if (liveIdx.includes(true)) expect(liveIdx.indexOf(true)).toBeGreaterThanOrEqual(liveIdx.lastIndexOf(false));
    }
    expect(sawPoll && sawDeleted && sawLive).toBe(true);
    // Ответ игрока — как дело недели: у каждого варианта есть эффект и реакция автора.
    for (const r of POSTS.posts) for (const o of r.replyOptions ?? []) {
      expect(o.reaction.length).toBeGreaterThan(0);
      expect(o.effect.note.length).toBeGreaterThan(0);
    }
  });

  it('за сезон из десяти туров ни один пост не читается дважды', () => {
    const seen = new Set<string>();
    const all: string[] = [];
    const results: PostContext['result'][] = ['win', 'loss', 'draw', 'win', 'win', 'loss', 'draw', 'loss', 'win', 'draw'];
    for (let round = 1; round <= 10; round++) {
      const feed = buildFeed(ctx({ round, result: results[round - 1], goals: round % 3 === 0 ? 1 : 0, position: 1 + (round % 5), nextFlags: ['them_' + ['star', 'veteran', 'hard', 'rookie', 'local'][round % 5]] }), makeRng(500 + round), seen);
      all.push(...feed.map((p) => p.text));
    }
    expect(new Set(all).size, 'повторы за сезон').toBe(all.length);
  });
});

describe('стрічка: ответ игрока', () => {
  it('последствия ответа переживают тиждень: applyWeek дополняет nextMatch, а не затирает', async () => {
    const { applyWeek } = await import('../src/engine/week');
    const reply = { id: 'reply', voice: 'ego' as const, title: 'Відповідь', line: '', effect: { fanHype: 5, coachTrust: -4, note: 'відповів' } };
    const gym = { id: 'gym', voice: 'body' as const, title: 'Зал', line: '', effect: { stamina: -8, note: 'зал' } };
    const c0 = defaultCareer();
    const c1 = applyWeek(c0, [{ activity: reply }]).career;
    expect(c1.nextMatch?.start?.fanHype).toBe(5);
    expect(c1.coachTrust).toBe(c0.coachTrust - 4);
    const c2 = applyWeek(c1, [{ activity: gym }]).career;
    expect(c2.nextMatch?.start?.fanHype).toBe(5);
    expect(c2.nextMatch?.start?.stamina).toBe(-8);
    expect(c2.nextMatch?.notes).toEqual(['відповів', 'зал']);
  });
});

describe('стрічка: контекст из сезона', () => {
  it('лидер и дно — среди чужих, последний соперник и результат — по сыгранному туру', () => {
    let season = createSeason(21, keys);
    const rng = makeRng(21);
    const first = ourFixture(season)!;
    season = recordRound(season, { scoreUs: 0, scoreThem: 2, goals: 0, assists: 0, coachRating: 5, fanRating: 4.5, scorers: [] }, strengths, rng);
    const next = ourFixture(season)!;
    const roster = rosterFor(next.opponentKey, rng);
    const c = buildPostContext(season, defaultCareer(), { opponentKey: next.opponentKey, venue: next.venue, strength: OPPONENTS[next.opponentKey].strength, traits: opponentTraits(roster.them) })!;
    expect(c.result).toBe('loss');
    expect(c.lastOpponentKey).toBe(first.opponentKey);
    expect(c.leaderKey).not.toBe(US);
    expect(c.bottomKey).not.toBe(US);
    expect(c.nextFlags.length).toBeGreaterThan(0);
    expect(c.round).toBe(1);
    expect(buildPostContext(createSeason(22, keys), defaultCareer(), null)).toBeNull();
  });
});
