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
import { PLAYOFF_SPOTS, playoffPending, playoffWon, promotion, PROMOTION_SPOTS, standings, SEASON_ROUNDS, US, type OurResult, type Season } from './season';
import type { MatchResult } from './conditions';
import type { Attribute } from './types';
import { plural, t, tf } from '../content/i18n';

export type ClubName = { nom: string; gen: string };

// Місцевий відмінок для «на … місці» — і називний середнього роду для «піднялася на …».
const AT = ['', t('першому'), t('другому'), t('третьому'), t('четвертому'), t('п’ятому'), t('шостому'), t('сьомому'), t('восьмому')];
const TO = ['', t('перше'), t('друге'), t('третє'), t('четверте'), t('п’яте'), t('шосте'), t('сьоме'), t('восьме')];

/** Колонка ESPM про Реєса (M13): ставлення видання дрейфує зі станом арки — абзац в огляді («той, що після
 *  травми») → «гравець туру?» → колонка «Чому він ще тут» → «узимку він міг піти». Вибір — pickFresh з
 *  пам’яттю медіа (recentPosts), як реклама й пости. */
export type EspmColumn = { kicker: string; title: string; text: string };
export function playerColumn(columns: Record<string, EspmColumn[]>, arc: number, rng: Rng, seen: Set<string>): EspmColumn | undefined {
  const pool = (columns[String(arc)] ?? []).map((c) => ({ ...c, weight: 1 }));
  return pickFresh(pool, seen, rng);
}

/** Ярлик редакції на профілі гравця (28.09): видання називає тебе тим, чим ти робиш чисті ісходи
 *  (`career.useCounts` — реальний лічильник M18.4, той самий, що дає очки росту). Це не рейтинг і не
 *  сила: ярлик міняється разом із грою, і поставило його видання, а не клуб. Групи усереднюються —
 *  інакше «плеймейкер» з двох атрибутів завжди перебивав би «бомбардира» з одного. */
export function pressLabel(uses: Partial<Record<Attribute, number>> | undefined): { label: string; why: string } {
  const u = (a: Attribute) => uses?.[a] ?? 0;
  const total = (Object.values(uses ?? {}) as number[]).reduce((s, n) => s + n, 0);
  if (total < 6) return { label: t('Новий у лізі'), why: t('поки що рядок у протоколі') };
  const kinds = [
    { label: t('Бомбардир'), why: t('б’є сам і влучає'), n: u('finishing') },
    { label: t('Плеймейкер'), why: t('віддає і бачить поле'), n: (u('passing') + u('vision')) / 2 },
    { label: t('Технар'), why: t('проходить і приймає'), n: (u('dribbling') + u('first_touch')) / 2 },
    { label: t('Робоча конячка'), why: t('виграє те, що виграється ногами'), n: (u('pace') + u('strength') + u('stamina')) / 3 },
    { label: t('Холодна голова'), why: t('не поспішає і стоїть там, де треба'), n: (u('composure') + u('positioning')) / 2 },
  ];
  return kinds.reduce((a, b) => (b.n > a.n ? b : a));
}

/** Заголовок тура на странице таблицы. Наш клуб — «Вальмара», женский род глаголов зашит: клуб
 *  фиксирован в ростере (roster.json → us). Соперник — только в родительном («проти „Ольвара“»),
 *  у клубов нет орудного (см. CLAUDE.md про «з/із/у»). */
export function roundHeadline(season: Season, club: (key: string) => ClubName): string {
  const rows = standings(season);
  const us = rows.find((r) => r.club === US)!;
  const usName = club(US).nom;
  const last = season.rounds?.[season.rounds.length - 1];
  const fixture = season.fixtures.find((f) => f.round === season.round - 1 && (f.home === US || f.away === US));
  if (!last || !fixture) return tf('Тур {0} з {1}. «{2}» — на {3} місці.', season.round, SEASON_ROUNDS, usName, AT[us.position]);

  const oppKey = fixture.home === US ? fixture.away : fixture.home;
  const opp = club(oppKey);
  const res: MatchResult = last.scoreUs > last.scoreThem ? 'W' : last.scoreUs < last.scoreThem ? 'L' : 'D';
  const score = tf('{0}:{1} проти «{2}»', last.scoreUs, last.scoreThem, opp.gen);
  const leader = rows[0];
  const leaderName = club(leader.club).nom;

  if (season.round >= SEASON_ROUNDS) {
    // Стикові (M19): поки пара є, а результату немає — заголовок про них, а не про підсумок сезону.
    if (playoffPending(season)) {
      const rival = club(season.playoff!.opponent);
      return tf('Круг дограно. «{0}» — {1} місце і стикові проти «{2}»: один матч, переможець іде нагору третім.', usName, AT[us.position], rival.gen);
    }
    const won = playoffWon(season);
    if (won === true) {
      const rival = club(season.playoff!.opponent);
      const r = season.playoff!.result!;
      return tf('Стикові: «{0}» — «{1}» {2}:{3}. Третє місце у вищій лізі — наше.', usName, rival.nom, r.scoreUs, r.scoreThem);
    }
    if (won === false) {
      const rival = club(season.playoff!.opponent);
      const r = season.playoff!.result!;
      return tf('Стикові програні: «{0}» — «{1}» {2}:{3}. Сезон закінчено {4} місцем.', usName, rival.nom, r.scoreUs, r.scoreThem, AT[us.position]);
    }
    // Перший сезон — про регламент, не про чемпіона: клуб цілий рік кричав про вихід (M14).
    const promo = promotion(season);
    if (promo?.kind === 'earned') {
      return leader.club === US
        ? tf('Сезон закінчено. «{0}» — чемпіон другої ліги і виходить у вищу.', usName)
        : tf('Сезон закінчено. «{0}» — {1} місце і вихід у вищу лігу.', usName, AT[promo.position]);
    }
    if (promo?.kind === 'scandal') {
      // M19: місце звільняє дискваліфікація у вищій лізі — так програш у стиках усе одно веде нагору.
      return tf('У вищій лізі дискваліфікували клуб: нагору цього року йдуть {0} {1}. «{2}» — {3} місце — серед них.', promo.count, plural(promo.count, t('команда'), t('команди'), t('команд')), usName, AT[promo.position]);
    }
    return leader.club === US
      ? tf('Сезон закінчено. «{0}» — чемпіон.', usName)
      : tf('Сезон закінчено. «{0}» — чемпіон, «{1}» фінішує на {2} місці.', leaderName, usName, AT[us.position]);
  }
  // Друга ліга: після рахунку — де ми відносно зони підвищення (мета клубу, M14).
  const zone = season.number === 1 ? (() => {
    if (us.position <= PROMOTION_SPOTS) return t(' У зоні прямого підвищення: нагору йдуть двоє.');
    if (PLAYOFF_SPOTS.includes(us.position)) {
      const second = rows[PROMOTION_SPOTS - 1];
      const gap = second.points - us.points;
      return tf(' У зоні стикових. До прямого підвищення — {0} {1}.', gap, plural(gap, t('очко'), t('очки'), t('очок')));
    }
    const last = rows[PLAYOFF_SPOTS[PLAYOFF_SPOTS.length - 1] - 1];
    const gap = last.points - us.points;
    return gap > 0 ? tf(' До стикових — {0} {1}.', gap, plural(gap, t('очко'), t('очки'), t('очок'))) : t(' Стикові — поруч, за різницею м’ячів.');
  })() : '';
  if (season.round === 1) {
    const how = res === 'W' ? t('з перемоги') : res === 'L' ? t('з поразки') : t('з нічиєї');
    return tf('«{0}» стартує {1}: {2}.{3}', usName, how, score, zone);
  }

  const prev = standings({ ...season, played: season.played.filter((m) => m.round < season.round - 1) });
  const prevUs = prev.find((r) => r.club === US)!;
  const prevLeader = prev[0];

  if (leader.club === US) {
    const second = rows[1];
    const gap = us.points - second.points;
    const tail = gap > 0
      ? tf('«{0}» відстає на {1} {2}.', club(second.club).nom, gap, plural(gap, t('очко'), t('очки'), t('очок')))
      : tf('«{0}» — поруч, за різницею м’ячів.', club(second.club).nom);
    const verb = prevUs.position === 1 ? t('утримує перше') : t('виходить на перше');
    return tf('«{0}» {1} після {2}. {3}', usName, verb, score, tail);
  }

  const lead = prevLeader.club === leader.club ? tf('«{0}» утримує перше.', leaderName) : tf('«{0}» виходить на перше.', leaderName);
  const move = us.position < prevUs.position ? tf('піднялася на {0}', TO[us.position])
    : us.position > prevUs.position ? tf('опустилася на {0}', TO[us.position])
    : tf('лишається на {0}', AT[us.position]);
  return tf('{0} «{1}» {2} після {3}.{4}', lead, usName, move, score, zone);
}

/** Підзаголовок про Реєса — реакція видання на його гру в останньому турі (21.09, пользователь: після дубля
 *  новини мовчали). Без чисел: дубль, гол, «серед найкращих» за оцінками тренера й трибун, або мовчання,
 *  коли нічого не сталося; провал — теж новина. Оцінка тренера 0–10, трибун 0–10 (whistle/board). */
export function playerLine(last: OurResult | undefined, name: { nom: string; gen: string }): string {
  if (!last) return '';
  const { goals, assists, coachRating, fanRating } = last;
  const lost = last.scoreUs < last.scoreThem;
  if (goals >= 3) return tf('Хет-трик {0} — головна тема вечора.', name.gen);
  if (goals === 2) return lost ? tf('Дубль {0} команду не врятував.', name.gen) : tf('Дубль {0} — головна тема вечора.', name.gen);
  if (goals === 1 && assists >= 1) return tf('Гол і передача: {0} — найкращий на полі.', name.nom);
  if (goals === 1) return lost ? tf('Гол {0} — єдине, що варто переглянути.', name.gen) : tf('Гол {0} вирішив долю матчу.', name.gen);
  if (assists >= 2) return tf('Дві передачі {0}: у центрі поля все йшло через нього.', name.gen);
  if (assists === 1) return tf('Передача {0} — момент туру.', name.gen);
  if (coachRating >= 7.5 || fanRating >= 8) return tf('{0} — серед найкращих на полі, хоч і без гола.', name.nom);
  if (coachRating < 5.5 && fanRating < 5.5) return tf('{0} — один із найгірших у складі. Питання до тренера.', name.nom);
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
