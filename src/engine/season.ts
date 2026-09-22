// Сезон (M5-лайт): 6 клубов, 10 туров по кругу, таблица и вердикт в конце.
// Тестеры называли прототип «игрой на 15 минут»: без ставки между матчами второй матч
// нечем мотивировать. Здесь только петля — расписание, чужие результаты по силе клубов,
// место в таблице, итог; замены/травмы/трансферный рынок — не сейчас.
// Чистая логика без React; хранилище — telemetry/season-storage.ts.

import { makeRng, type Rng } from './rng';
import { BALANCE } from './balance';
import type { Strength } from './conditions';

export const US = 'us';
export const SEASON_ROUNDS = 10;

export type Fixture = { round: number; home: string; away: string };
export type PlayedMatch = Fixture & { homeGoals: number; awayGoals: number };

export type PlayerSeasonStats = {
  matches: number; goals: number; assists: number; coachSum: number; fanSum: number;
};

export type Season = {
  seed: number;
  /** Порядковый номер сезона в карьере — для заголовка и «Новий сезон». */
  number: number;
  clubs: string[];
  fixtures: Fixture[];
  played: PlayedMatch[];
  /** Следующий тур (0-based) — равен числу сыгранных нами матчей. */
  round: number;
  player: PlayerSeasonStats;
  /** Голы своей команды по авторам (фамилия → голы) — привязанность к своим через протокол. */
  teamScorers: Record<string, number>;
  /** Наши матчи по турам как есть — для тижня між матчами (week.ts): результат, голи, оцінки. */
  rounds?: OurResult[];
  /** Стикові (M19, рішення користувача 22.09: двоє нагору, третє — стики): після 10-го туру третє місце
   *  грає з четвертим один матч. Ставиться, коли круг дограно і ми в парі; `result` — наш рахунок. */
  playoff?: { opponent: string; venue: 'home' | 'away'; result?: { scoreUs: number; scoreThem: number } };
};

export type TableRow = {
  club: string; played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; points: number; position: number;
};

/** Круговая система на 6 клубов: 5 туров, затем те же пары с обменом полем. */
export function makeFixtures(clubs: string[]): Fixture[] {
  const n = clubs.length;
  const order = [...clubs];
  const firstHalf: Fixture[] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = order[i];
      const b = order[n - 1 - i];
      // Чередуем поле по кругу, чтобы у каждого клуба дом/выезд шли вперемешку.
      const homeFirst = (r + i) % 2 === 0;
      firstHalf.push({ round: r, home: homeFirst ? a : b, away: homeFirst ? b : a });
    }
    // Вращение: первый фиксирован, остальные сдвигаются.
    order.splice(1, 0, order.pop()!);
  }
  const secondHalf = firstHalf.map((f) => ({ round: f.round + (n - 1), home: f.away, away: f.home }));
  return [...firstHalf, ...secondHalf];
}

/** Закріпити наш матч із клубом на тур `round` (0-based): міняємо місцями цілі тури — коло лишається колом,
 *  відповідний матч другого кола їде разом. M15: матч із клубом колишнього дублера — 3-й тур, не перший
 *  (там Реєс ще не в формі) і не дев’ятий (сцена загубилась би перед фіналом). */
export function pinFixture(fixtures: Fixture[], club: string, round: number): Fixture[] {
  const half = Math.max(...fixtures.map((f) => f.round)) + 1;
  const hit = fixtures.find((f) => f.round < half / 2 && ((f.home === US && f.away === club) || (f.away === US && f.home === club)));
  if (!hit || hit.round === round || round >= half / 2) return fixtures;
  const a = hit.round; const b = round; const shift = half / 2;
  const swap = (r: number) => (r === a ? b : r === b ? a : r === a + shift ? b + shift : r === b + shift ? a + shift : r);
  return fixtures.map((f) => ({ ...f, round: swap(f.round) })).sort((x, y) => x.round - y.round);
}

export const LEAGUE_SIZE = 6;

// ——— дві ліги (M14, 21.09) ————————————————————————————————————————————
// Перший сезон — друга ліга («нижче — тільки чемпіонат пивоварень»), другий — вища. Мета клубу на перший
// сезон декларується (на відміну від мети Реєса): вихід — перша трійка. Не потрапили — скандал із договірними
// матчами: нагору йде стільки команд, яке місце у «Вальмари», але з нами в наступну лігу переходять максимум
// двоє інших (PROMOTED_WITH) — інакше «нова ліга» була б старою.
export type League = { name: string; nameGen: string; short: string };
export const LEAGUES: Record<number, League> = {
  1: { name: 'Друга ліга', nameGen: 'другої ліги', short: 'друга' },
  2: { name: 'Вища ліга', nameGen: 'вищої ліги', short: 'вища' },
};
export const leagueOf = (seasonNumber: number): League => LEAGUES[Math.min(seasonNumber, 2)];
/** Прямо нагору — двоє; третє місце грає стикові з четвертим, переможець іде третім (M19). */
export const PROMOTION_SPOTS = 2;
export const PLAYOFF_SPOTS = [3, 4];
export const PROMOTED_WITH = 2;
/** Місяць туру (1-based): серпень → травень із зимовою перервою після 5-го. */
export const MONTHS = ['серпень', 'вересень', 'жовтень', 'листопад', 'грудень', 'лютий', 'березень', 'квітень', 'квітень', 'травень'];
export const monthOfRound = (round: number): string => MONTHS[Math.max(0, Math.min(MONTHS.length - 1, round - 1))];
/** Зимова перерва — між 5-м і 6-м туром (round — зіграних матчів). */
export const WINTER_BREAK_AFTER = 5;

export type Promotion = {
  kind: 'earned' | 'scandal';
  position: number;
  /** Скільки команд іде нагору за регламентом (новина): трійка або, за скандалом, наше місце. */
  count: number;
  /** Хто піднімається разом із нами в наступний сезон (ключі клубів, без нас). */
  with: string[];
};

/** Підсумок першого сезону за регламентом; для інших сезонів і незакінченого — null. */
export function promotion(season: Season): Promotion | null {
  if (season.number !== 1 || season.round < SEASON_ROUNDS) return null;
  const rows = standings(season);
  const us = rows.find((r) => r.club === US)!;
  // Двоє прямо; третє місце — через стикові; програш у стиках і місця нижче — за регламентом
  // (у вищій лізі дискваліфікували клуб, нагору беруть ще одну команду).
  const won = playoffWon(season);
  const kind = us.position <= PROMOTION_SPOTS || won === true ? 'earned' : 'scandal';
  const count = kind === 'earned' ? PROMOTION_SPOTS + (won === true ? 1 : 0) : us.position;
  const others = rows.filter((r) => r.club !== US && r.position <= count).slice(0, PROMOTED_WITH).map((r) => r.club);
  return { kind, position: us.position, count, with: others };
}

/** Лига — 6 клубов: мы и пять соперников. Соперников в ростере больше, чем мест, —
 *  каждый сезон состав лиги другой (перемешивание по сиду), и второй сезон не повторяет первый. */
export function createSeason(seed: number, opponentKeys: string[], number = 1, keep: string[] = [], pin?: { club: string; round: number }): Season {
  const rng = makeRng(seed);
  // `keep` — клуби, що піднялися разом із нами (M14): вони в лізі точно, решта місць — жеребом.
  const picked: string[] = keep.filter((k) => opponentKeys.includes(k)).slice(0, LEAGUE_SIZE - 1);
  const pool = opponentKeys.filter((k) => !picked.includes(k));
  while (picked.length < LEAGUE_SIZE - 1 && pool.length) picked.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  const clubs = [US, ...picked];
  const fixtures = pin && clubs.includes(pin.club) ? pinFixture(makeFixtures(clubs), pin.club, pin.round) : makeFixtures(clubs);
  return {
    seed, number, clubs, fixtures, played: [], round: 0,
    player: { matches: 0, goals: 0, assists: 0, coachSum: 0, fanSum: 0 },
    teamScorers: {},
  };
}

export function isSeasonOver(season: Season): boolean {
  if (season.round < SEASON_ROUNDS) return false;
  // Стикові дограються як 11-й матч: сезон не закінчено, поки пара є, а результату немає.
  return !(season.playoff && !season.playoff.result);
}

/** Чи чекають на нас стикові: круг дограно, ми третій або четвертий, першого сезону. */
export function playoffPending(season: Season): boolean {
  return !!season.playoff && !season.playoff.result;
}

/** Пара стикових після останнього туру: третій проти четвертого, поле — у третього (M19).
 *  Повертає сезон зі стиками, якщо ми в парі; інакше сезон як є — стики чужих клубів гра не показує. */
export function withPlayoff(season: Season): Season {
  if (season.number !== 1 || season.round < SEASON_ROUNDS || season.playoff) return season;
  const rows = standings(season);
  const us = rows.find((r) => r.club === US)!;
  if (!PLAYOFF_SPOTS.includes(us.position)) return season;
  const other = rows.find((r) => r.club !== US && PLAYOFF_SPOTS.includes(r.position))!;
  return { ...season, playoff: { opponent: other.club, venue: us.position === PLAYOFF_SPOTS[0] ? 'home' : 'away' } };
}

/** Закрити стикові нашим рахунком. */
export function recordPlayoff(season: Season, ours: OurResult): Season {
  const p = season.player;
  return {
    ...season,
    playoff: { ...season.playoff!, result: { scoreUs: ours.scoreUs, scoreThem: ours.scoreThem } },
    player: {
      matches: p.matches + 1, goals: p.goals + ours.goals, assists: p.assists + ours.assists,
      coachSum: p.coachSum + ours.coachRating, fanSum: p.fanSum + ours.fanRating,
    },
    rounds: [...(season.rounds ?? []), ours],
  };
}

/** Виграли стикові? null — стиків не було. */
export function playoffWon(season: Season): boolean | null {
  const r = season.playoff?.result;
  if (!r) return null;
  return r.scoreUs > r.scoreThem;
}

/** Наш матч текущего тура: с кем и где. */
export function ourFixture(season: Season): { opponentKey: string; venue: 'home' | 'away'; round: number } | null {
  if (playoffPending(season)) return { opponentKey: season.playoff!.opponent, venue: season.playoff!.venue, round: SEASON_ROUNDS };
  if (isSeasonOver(season)) return null;
  const f = season.fixtures.find((x) => x.round === season.round && (x.home === US || x.away === US))!;
  return { opponentKey: f.home === US ? f.away : f.home, venue: f.home === US ? 'home' : 'away', round: season.round };
}

const STRENGTH_INDEX: Record<Strength, number> = { strong: 2, even: 1, weak: 0 };

/** Пуассон через Кнута — голы чужих матчей. Ожидание от силы атаки минус сила обороны,
 *  плюс дом; коэффициенты дают ~1.3 гола на команду, как в реальных лигах. */
function poisson(rng: Rng, lambda: number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k += 1; p *= rng.next(); } while (p > limit);
  return k - 1;
}

export function simulateOthers(
  fixture: Fixture, strengths: Record<string, Strength>, rng: Rng,
): PlayedMatch {
  const home = STRENGTH_INDEX[strengths[fixture.home] ?? 'even'];
  const away = STRENGTH_INDEX[strengths[fixture.away] ?? 'even'];
  const homeGoals = poisson(rng, Math.max(0.3, 0.9 + 0.45 * home - 0.3 * away + 0.25));
  const awayGoals = poisson(rng, Math.max(0.3, 0.9 + 0.45 * away - 0.3 * home));
  return { ...fixture, homeGoals, awayGoals };
}

export type OurResult = {
  scoreUs: number; scoreThem: number; goals: number; assists: number;
  coachRating: number; fanRating: number;
  /** Авторы голов своей команды в этом матче (фамилии из ленты). */
  scorers: string[];
  /** Лучший/худший момент (match.ts:pickMoments) — для стрічки. */
  moments?: { best?: MomentRef; worst?: MomentRef };
};
export type MomentRef = { minute: number; past: string; recap: string; tier: string };

/** Закрыть тур: наш результат — настоящий, два чужих матча — по силе клубов.
 *  rng — отдельный, по сиду сезона и туру, чтобы чужие результаты не зависели от того,
 *  сколько бросков сделал наш матч. */
export function recordRound(
  season: Season, ours: OurResult, strengths: Record<string, Strength>, rng: Rng,
): Season {
  const fixtures = season.fixtures.filter((f) => f.round === season.round);
  const played: PlayedMatch[] = fixtures.map((f) => {
    if (f.home === US) return { ...f, homeGoals: ours.scoreUs, awayGoals: ours.scoreThem };
    if (f.away === US) return { ...f, homeGoals: ours.scoreThem, awayGoals: ours.scoreUs };
    return simulateOthers(f, strengths, rng);
  });
  const teamScorers = { ...season.teamScorers };
  for (const name of ours.scorers) teamScorers[name] = (teamScorers[name] ?? 0) + 1;
  const p = season.player;
  return {
    ...season,
    played: [...season.played, ...played],
    round: season.round + 1,
    player: {
      matches: p.matches + 1, goals: p.goals + ours.goals, assists: p.assists + ours.assists,
      coachSum: p.coachSum + ours.coachRating, fanSum: p.fanSum + ours.fanRating,
    },
    teamScorers,
    rounds: [...(season.rounds ?? []), ours],
  };
}

export function standings(season: Season): TableRow[] {
  const rows = new Map<string, TableRow>();
  for (const c of season.clubs) {
    rows.set(c, { club: c, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, position: 0 });
  }
  for (const m of season.played) {
    const h = rows.get(m.home)!;
    const a = rows.get(m.away)!;
    h.played += 1; a.played += 1;
    h.goalsFor += m.homeGoals; h.goalsAgainst += m.awayGoals;
    a.goalsFor += m.awayGoals; a.goalsAgainst += m.homeGoals;
    if (m.homeGoals > m.awayGoals) { h.won += 1; a.lost += 1; h.points += 3; }
    else if (m.homeGoals < m.awayGoals) { a.won += 1; h.lost += 1; a.points += 3; }
    else { h.drawn += 1; a.drawn += 1; h.points += 1; a.points += 1; }
  }
  const sorted = [...rows.values()].sort((x, y) =>
    y.points - x.points
    || (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst)
    || y.goalsFor - x.goalsFor
    || x.club.localeCompare(y.club));
  sorted.forEach((r, i) => { r.position = i + 1; });
  return sorted;
}

export function ourRow(season: Season): TableRow {
  return standings(season).find((r) => r.club === US)!;
}

export type Verdict = { kind: 'transfer' | 'extend' | 'bench'; title: string; text: string };

/** Кінець другого сезону (M16): дзвонить той самий скаут — тепер із клубу Ліги чемпіонів. Варіанту лишитися немає;
 *  цифри — лише протокол. Сам фінал — engine/ending.ts. */
export function secondSeasonVerdict(season: Season, coachTrust: number): Verdict {
  const base = seasonVerdict(season, coachTrust);
  const row = ourRow(season);
  const p = season.player;
  const stats = `${p.goals} голів і ${p.assists} передач`;
  const table = row.position === 1 ? 'Чемпіон вищої ліги' : `${row.position}-е місце у вищій лізі`;
  const tail = base.kind === 'bench' ? ' Тренер хотів би посадити на лаву. Не встигне.' : base.kind === 'transfer' ? ' Тренер каже «скатертиною» — і, здається, це щиро.' : ' Тренер підписав би ще на рік. Не доведеться.';
  return { kind: 'transfer', title: 'Дзвонить скаут', text: `${table}, ${stats} за сезон. Дзвонить той самий скаут, що два роки тому питав про ногу, — тепер із клубу, який грає в Лізі чемпіонів. Про ногу не питає.${tail}` };
}

/** Кінець першого сезону (M15): дзвінок агента безумовний — вихід у вищу лігу помітили. Таблиця й тренер
 *  вирішують формулювання (за таблицю / за протокол / «помітили»), а вердикт тренера й трибун (лава) лишається
 *  своїм рядком: з лави наступний сезон усе одно починаєш. Сам зрив — у відпустці (engine/vacation.ts). */
export function firstSeasonVerdict(season: Season, coachTrust: number): Verdict {
  const base = seasonVerdict(season, coachTrust);
  const k = BALANCE.season;
  const row = ourRow(season);
  const p = season.player;
  const actions = p.goals + p.assists;
  const stats = `${p.goals} голів і ${p.assists} передач`;
  const promo = promotion(season);
  const won = playoffWon(season);
  // Три гілки регламенту (M19): двійка — прямо, стики виграли — через них, решта — «за регламентом».
  const how = promo?.kind === 'scandal' ? 'Вихід у вищу лігу — хай і за регламентом —'
    : won === true ? 'Вихід через стикові' : 'Вихід у вищу лігу';
  let text: string;
  if (row.position <= k.transferPosition && coachTrust >= k.transferTrust) {
    text = `${row.position}-е місце, ${stats}. ${how} помітили не тільки в місті: клуб із вищої ліги хоче тебе вже влітку. Медогляд у липні. Тренер не радий — але це найкраща з його проблем.`;
  } else if (actions >= k.starActions) {
    text = `${stats} за сезон — і ${how.charAt(0).toLowerCase() + how.slice(1)} помітили: клуб із вищої ліги дзвонить за протоколом, попри ${row.position}-е місце. Медогляд у липні.`;
  } else {
    text = `${row.position}-е місце, ${stats}. ${how} помітили ті, хто дивиться не таблицю, а поле: клуб із вищої ліги дзвонить — не через цифри, а тому, що бачив тебе. Медогляд у липні.`;
  }
  if (base.kind === 'bench') text += ' А наступний сезон усе одно починаєш з лави: ' + (base.text.includes('свист') ? 'трибуни свистіли, і президент це чув.' : 'тренер не дивиться в очі.');
  return { kind: 'transfer', title: 'Дзвонить агент', text };
}

/** Итог сезона — две силы (M9, 20.09). Тренер: место, довіра, средняя оценка. Трибуни и протокол:
 *  средняя оценка трибун и голы+асисты. Тренер садит — трибуни защищают или свистят; агент звонит
 *  за таблицу или за протокол. Текст называет причину: игрок должен понять, что именно решило,
 *  иначе агентность невидима. Числа — balance.ts:season. */
export function seasonVerdict(season: Season, coachTrust: number): Verdict {
  const k = BALANCE.season;
  const row = ourRow(season);
  const p = season.player;
  const avgCoach = p.matches ? p.coachSum / p.matches : 0;
  const avgFan = p.matches ? p.fanSum / p.matches : 0;
  const actions = p.goals + p.assists;
  const stats = `${p.goals} голів і ${p.assists} передач`;

  // Свист трибун — раніше за трансфер від таблиці: клуб, що виграв лігу з тобою, все одно чує
  // стадіон, а агент за освистаного не дзвонить. Зірка протоколу (нижче) свисту не збирає за визначенням.
  if (avgFan < k.crowdBoo) {
    return {
      kind: 'bench',
      title: 'Розмова в кабінеті',
      text: `${row.position}-е місце, ${stats}. Тренер задоволений, трибуни — ні: свист після кожного пасу назад дійшов до президента. Наступний сезон починаєш з лави, «щоб зняти напругу».`,
    };
  }
  if (row.position <= k.transferPosition && coachTrust >= k.transferTrust) {
    return {
      kind: 'transfer',
      title: 'Дзвонить агент',
      text: `${row.position}-е місце, ${stats} за сезон. Клуб із сильнішої ліги хоче тебе вже цієї зими. Тренер не радий — але це найкраща з його проблем.`,
    };
  }
  if (actions >= k.starActions && avgFan >= k.starFan && coachTrust >= k.starMinTrust) {
    return {
      kind: 'transfer',
      title: 'Дзвонить агент',
      text: `${stats} за сезон, і трибуни знають твоє прізвище краще за тренера. Клуб із сильнішої ліги дзвонить попри ${row.position}-е місце. Тренер каже «скатертиною» — і, здається, це щиро.`,
    };
  }

  const clubs = season.clubs.length;
  const coachBenches = row.position > clubs - k.benchBottom || coachTrust < k.benchTrust || avgCoach < k.benchCoach;
  const crowdShields = avgFan >= k.crowdShieldFan && actions >= k.crowdShieldActions;
  if (coachBenches && crowdShields) {
    return {
      kind: 'extend',
      title: 'Продовження контракту',
      text: `${row.position}-е місце, ${stats}. Тренер хотів би посадити — але трибуни скандують твоє прізвище, і президент це чує. Контракт підписаний. Тренер — ні.`,
    };
  }
  if (coachBenches) {
    const why = coachTrust < k.benchTrust ? 'тренер не дивиться в очі' : row.position > clubs - k.benchBottom ? 'таблиця не пробачає' : 'тренер має свої оцінки';
    return {
      kind: 'bench',
      title: 'Розмова в кабінеті',
      text: `${row.position}-е місце, ${stats}, і ${why}: наступний сезон починаєш з лави. Дублер уже знає.`,
    };
  }
  return {
    kind: 'extend',
    title: 'Продовження контракту',
    text: `${row.position}-е місце, ${stats}. Тренер підписує ще на рік: «Місце в основі — твоє. Поки що».`,
  };
}

