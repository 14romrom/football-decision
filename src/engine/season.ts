// Сезон (M5-лайт): 6 клубов, 10 туров по кругу, таблица и вердикт в конце.
// Тестеры называли прототип «игрой на 15 минут»: без ставки между матчами второй матч
// нечем мотивировать. Здесь только петля — расписание, чужие результаты по силе клубов,
// место в таблице, итог; замены/травмы/трансферный рынок — не сейчас.
// Чистая логика без React; хранилище — telemetry/season-storage.ts.

import { makeRng, type Rng } from './rng';
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
  /** Наши матчи по турам как есть — для недели между матчами (week.ts): серия поразок,
   *  матчі без гола, оцінки. Суммы в player для таблицы оставлены, это не замена. */
  rounds?: OurResult[];
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

export const LEAGUE_SIZE = 6;

/** Лига — 6 клубов: мы и пять соперников. Соперников в ростере больше, чем мест, —
 *  каждый сезон состав лиги другой (перемешивание по сиду), и второй сезон не повторяет первый. */
export function createSeason(seed: number, opponentKeys: string[], number = 1): Season {
  const rng = makeRng(seed);
  const pool = [...opponentKeys];
  const picked: string[] = [];
  while (picked.length < LEAGUE_SIZE - 1 && pool.length) picked.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  const clubs = [US, ...picked];
  return {
    seed, number, clubs, fixtures: makeFixtures(clubs), played: [], round: 0,
    player: { matches: 0, goals: 0, assists: 0, coachSum: 0, fanSum: 0 },
    teamScorers: {},
  };
}

export function isSeasonOver(season: Season): boolean {
  return season.round >= SEASON_ROUNDS;
}

/** Наш матч текущего тура: с кем и где. */
export function ourFixture(season: Season): { opponentKey: string; venue: 'home' | 'away'; round: number } | null {
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
};

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

/** Итог сезона: место + доверие тренера на конец сезона. Без чисел вероятностей —
 *  три исхода, и каждый объясняется тем, что игрок видел весь сезон (таблица и тренер). */
export function seasonVerdict(season: Season, coachTrust: number): Verdict {
  const row = ourRow(season);
  const p = season.player;
  const avgCoach = p.matches ? p.coachSum / p.matches : 0;
  if (row.position <= 2 && coachTrust >= 60) {
    return {
      kind: 'transfer',
      title: 'Дзвонить агент',
      text: `${row.position}-е місце, ${p.goals} голів і ${p.assists} передач за сезон. Клуб із сильнішої ліги хоче тебе вже цієї зими. Тренер не радий — але це найкраща з його проблем.`,
    };
  }
  if (row.position <= 4 || coachTrust >= 50 || avgCoach >= 6.5) {
    return {
      kind: 'extend',
      title: 'Продовження контракту',
      text: `${row.position}-е місце, ${p.goals} голів і ${p.assists} передач. Тренер підписує ще на рік: «Місце в основі — твоє. Поки що».`,
    };
  }
  return {
    kind: 'bench',
    title: 'Розмова в кабінеті',
    text: `${row.position}-е місце, і тренер не дивиться в очі: наступний сезон починаєш з лави. Дублер уже знає.`,
  };
}
