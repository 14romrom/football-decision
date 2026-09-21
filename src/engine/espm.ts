// Сторінка таблиці на сайті ESPM (19.09, макет «Таблиця: ESPM», решение пользователя) — экран сезона
// как страница спортивного сайта: оммаж на известное издание, красный прямоугольный логотип
// латиницей. Здесь — то, что страница собирает из данных: заголовок тура и реклама. Единственный
// «экран в экране» в игре — больше таких не добавлять.
//
// Заголовок — шаблон из данных (лидер, наш счёт, движение по таблице), не новый пул контента.
// Реклама — content/ads.json: абсурд в форматах настоящей (банер / «вам сподобається» / оголошення),
// без реальных брендов и без букмекеров (проценты и шансы — правило игры). Условия `when` — как у
// титула: все ключи должны совпасть; вес 3^ключей; виденные уступают свежим (pickFresh).

import { pickFresh } from './flavor';
import type { Rng } from './rng';
import { standings, SEASON_ROUNDS, US, type OurResult, type Season } from './season';
import type { MatchResult } from './conditions';

export type ClubName = { nom: string; gen: string };

// Місцевий відмінок для «на … місці» — і називний середнього роду для «піднялася на …».
const AT = ['', 'першому', 'другому', 'третьому', 'четвертому', 'п’ятому', 'шостому', 'сьомому', 'восьмому'];
const TO = ['', 'перше', 'друге', 'третє', 'четверте', 'п’яте', 'шосте', 'сьоме', 'восьме'];

/** Колонка ESPM про Реєса (M13): ставлення видання дрейфує зі станом арки — абзац в огляді («той, що після
 *  травми») → «гравець туру?» → колонка «Чому він ще тут» → «узимку він міг піти». Вибір — pickFresh з
 *  пам’яттю медіа (recentPosts), як реклама й пости. */
export type EspmColumn = { kicker: string; title: string; text: string };
export function playerColumn(columns: Record<string, EspmColumn[]>, arc: number, rng: Rng, seen: Set<string>): EspmColumn | undefined {
  const pool = (columns[String(arc)] ?? []).map((c) => ({ ...c, weight: 1 }));
  return pickFresh(pool, seen, rng);
}

const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

/** Заголовок тура на странице таблицы. Наш клуб — «Вальмара», женский род глаголов зашит: клуб
 *  фиксирован в ростере (roster.json → us). Соперник — только в родительном («проти „Ольвара“»),
 *  у клубов нет орудного (см. CLAUDE.md про «з/із/у»). */
export function roundHeadline(season: Season, club: (key: string) => ClubName): string {
  const rows = standings(season);
  const us = rows.find((r) => r.club === US)!;
  const usName = club(US).nom;
  const last = season.rounds?.[season.rounds.length - 1];
  const fixture = season.fixtures.find((f) => f.round === season.round - 1 && (f.home === US || f.away === US));
  if (!last || !fixture) return `Тур ${season.round} з ${SEASON_ROUNDS}. «${usName}» — на ${AT[us.position]} місці.`;

  const oppKey = fixture.home === US ? fixture.away : fixture.home;
  const opp = club(oppKey);
  const res: MatchResult = last.scoreUs > last.scoreThem ? 'W' : last.scoreUs < last.scoreThem ? 'L' : 'D';
  const score = `${last.scoreUs}:${last.scoreThem} проти «${opp.gen}»`;
  const leader = rows[0];
  const leaderName = club(leader.club).nom;

  if (season.round >= SEASON_ROUNDS) {
    return leader.club === US
      ? `Сезон закінчено. «${usName}» — чемпіон.`
      : `Сезон закінчено. «${leaderName}» — чемпіон, «${usName}» фінішує на ${AT[us.position]} місці.`;
  }
  if (season.round === 1) {
    const how = res === 'W' ? 'з перемоги' : res === 'L' ? 'з поразки' : 'з нічиєї';
    return `«${usName}» стартує ${how}: ${score}.`;
  }

  const prev = standings({ ...season, played: season.played.filter((m) => m.round < season.round - 1) });
  const prevUs = prev.find((r) => r.club === US)!;
  const prevLeader = prev[0];

  if (leader.club === US) {
    const second = rows[1];
    const gap = us.points - second.points;
    const tail = gap > 0
      ? `«${club(second.club).nom}» відстає на ${gap} ${plural(gap, 'очко', 'очки', 'очок')}.`
      : `«${club(second.club).nom}» — поруч, за різницею м’ячів.`;
    const verb = prevUs.position === 1 ? 'утримує перше' : 'виходить на перше';
    return `«${usName}» ${verb} після ${score}. ${tail}`;
  }

  const lead = prevLeader.club === leader.club ? `«${leaderName}» утримує перше.` : `«${leaderName}» виходить на перше.`;
  const move = us.position < prevUs.position ? `піднялася на ${TO[us.position]}`
    : us.position > prevUs.position ? `опустилася на ${TO[us.position]}`
    : `лишається на ${AT[us.position]}`;
  return `${lead} «${usName}» ${move} після ${score}.`;
}

/** Підзаголовок про Реєса — реакція видання на його гру в останньому турі (21.09, пользователь: після дубля
 *  новини мовчали). Без чисел: дубль, гол, «серед найкращих» за оцінками тренера й трибун, або мовчання,
 *  коли нічого не сталося; провал — теж новина. Оцінка тренера 0–10, трибун 0–10 (whistle/board). */
export function playerLine(last: OurResult | undefined, name: { nom: string; gen: string }): string {
  if (!last) return '';
  const { goals, assists, coachRating, fanRating } = last;
  const lost = last.scoreUs < last.scoreThem;
  if (goals >= 3) return `Хет-трик ${name.gen} — головна тема вечора.`;
  if (goals === 2) return lost ? `Дубль ${name.gen} команду не врятував.` : `Дубль ${name.gen} — головна тема вечора.`;
  if (goals === 1 && assists >= 1) return `Гол і передача: ${name.nom} — найкращий на полі.`;
  if (goals === 1) return lost ? `Гол ${name.gen} — єдине, що варто переглянути.` : `Гол ${name.gen} вирішив долю матчу.`;
  if (assists >= 2) return `Дві передачі ${name.gen}: у центрі поля все йшло через нього.`;
  if (assists === 1) return `Передача ${name.gen} — момент туру.`;
  if (coachRating >= 7.5 || fanRating >= 8) return `${name.nom} — серед найкращих на полі, хоч і без гола.`;
  if (coachRating < 5.5 && fanRating < 5.5) return `${name.nom} — один із найгірших у складі. Питання до тренера.`;
  return '';
}

// ——— реклама ————————————————————————————————————————————————————————

export type AdWhen = Partial<{ last: MatchResult; trust: 'low' | 'ok'; position: 'top' | 'bottom' | 'mid' }>;
export type AdRule = {
  id: string; kind: 'banner' | 'reco' | 'classified'; when: AdWhen;
  title?: string; text: string; cta?: string; tag?: string; mark?: string; sign?: string;
};
export type AdContext = { last?: MatchResult; trust: 'low' | 'ok'; position: 'top' | 'bottom' | 'mid' };
export type AdSet = { banners: AdRule[]; reco: AdRule[]; classified: AdRule[] };

/** Верх таблицы — два первых, низ — два последних; сколько банеров/плиток на странице. */
export const AD_SLOTS = { banners: 2, reco: 3, classified: 2 };
export const AD_TRUST_LOW = 40;

export function adContext(season: Season, coachTrust: number): AdContext {
  const rows = standings(season);
  const pos = rows.find((r) => r.club === US)!.position;
  const last = season.rounds?.[season.rounds.length - 1];
  return {
    last: last ? (last.scoreUs > last.scoreThem ? 'W' : last.scoreUs < last.scoreThem ? 'L' : 'D') : undefined,
    trust: coachTrust < AD_TRUST_LOW ? 'low' : 'ok',
    position: pos <= 2 ? 'top' : pos >= rows.length - 1 ? 'bottom' : 'mid',
  };
}

const matches = (when: AdWhen, ctx: AdContext) => (Object.keys(when) as (keyof AdWhen)[]).every((k) => when[k] === ctx[k]);

function pickMany(rules: AdRule[], n: number, seen: Set<string>, rng: Rng): AdRule[] {
  const pool = rules.map((r) => ({ rule: r, text: r.text, weight: 3 ** Object.keys(r.when).length }));
  const out: AdRule[] = [];
  const seenNow = new Set<string>();
  for (let i = 0; i < n && out.length < pool.length; i++) {
    const p = pickFresh(pool.filter((x) => !seenNow.has(x.text)), seen, rng, seenNow);
    if (!p) break;
    out.push(p.rule);
    seenNow.add(p.text);
  }
  return out;
}

/** Реклама на страницу: банеры, плитки «вам сподобається», оголошення — по контексту, без повторов на странице. */
export function pickAds(rules: AdRule[], ctx: AdContext, seen: Set<string>, rng: Rng): AdSet {
  const fit = rules.filter((r) => matches(r.when, ctx));
  return {
    banners: pickMany(fit.filter((r) => r.kind === 'banner'), AD_SLOTS.banners, seen, rng),
    reco: pickMany(fit.filter((r) => r.kind === 'reco'), AD_SLOTS.reco, seen, rng),
    classified: pickMany(fit.filter((r) => r.kind === 'classified'), AD_SLOTS.classified, seen, rng),
  };
}
