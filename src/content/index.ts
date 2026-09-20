import episodesJson from './episodes.json';
import playerJson from './player.json';
import rosterJson from './roster.json';
import flavorJson from './flavor.json';
import flagsJson from './flags.json';
import activitiesJson from './activities.json';
import weekscenesJson from './weekscenes.json';
import adsJson from './ads.json';
import prologueJson from './prologue.json';
import firstmatchJson from './firstmatch.json';
import { fillNamesDeep, type Roster, type TeamRoster } from '../engine/names';
import type { FlavorRule } from '../engine/flavor';
import type { Strength } from '../engine/conditions';
import type { Episode, FlagRule, Player } from '../engine/types';
import type { Rng } from '../engine/rng';
import type { Activity, WeekScene } from '../engine/week';
import type { AdRule } from '../engine/espm';
import type { PrologueSpread } from '../engine/prologue';
import type { Tutorial } from '../engine/match';

// JSON намеренно остаётся плоским файлом контента: писать эпизоды должно быть
// можно без оглядки на TypeScript. Проверку формы делает tests/content.test.ts.

export type Opponent = TeamRoster & { strength: Strength; blurb: string };
export const OPPONENTS = rosterJson.opponents as unknown as Record<string, Opponent>;
export const DEFAULT_OPPONENT = 'sandorea';

/** Ростер «мы + соперник по умолчанию» — для прогона, тестов и экрана /stats. */
export const ROSTER: Roster = { us: rosterJson.us as TeamRoster, them: OPPONENTS[DEFAULT_OPPONENT] };
/** Ростер на матч. С rng — у каждой роли соперника выбирается одно из имён (характеристика или
 *  вариант), одно на весь матч; без rng — каноническое, для тестов и /stats. */
export function rosterFor(opponentKey: string, rng?: Rng): Roster {
  const them = OPPONENTS[opponentKey] ?? OPPONENTS[DEFAULT_OPPONENT];
  if (!rng) return { us: ROSTER.us, them };
  const players: TeamRoster['players'] = {};
  for (const [role, p] of Object.entries(them.players)) {
    const pool = [p, ...(p.variants ?? [])];
    const pick = rng.pick(pool);
    players[role] = { nom: pick.nom, gen: pick.gen, dat: pick.dat, ins: pick.ins, trait: p.trait };
  }
  return { us: ROSTER.us, them: { ...them, players } };
}

/** Сырой контент с плейсхолдерами: имена подставляет createMatch под соперника матча. */
export const EPISODES_RAW = episodesJson as unknown as Episode[];
/** Эпизоды с именами соперника по умолчанию — там, где сессии нет (/stats, тесты формы). */
export const EPISODES = fillNamesDeep(EPISODES_RAW, ROSTER);
export const PLAYER = playerJson as unknown as Player;
export const FLAVOR = flavorJson as FlavorRule[];
export { FEED_RULES as FEED } from '../engine/feed';
/** Флаги-последствия; имена в подписях подставляет createMatch под ростер матча. */
export const FLAG_RULES = flagsJson as FlagRule[];
/** Дела тижня між матчами (engine/week.ts); имена подставляются при показе — партнёры свои. */
export const ACTIVITIES = activitiesJson as Activity[];
/** Сцены-продолжения дела недели (outcome.followUp → id сцены); одна на тиждень. */
export const WEEK_SCENES = weekscenesJson as WeekScene[];
/** Реклама на сторінці ESPM (engine/espm.ts): абсурд у форматах справжньої, без брендів і букмекерів. */
export const ADS = adsJson as AdRule[];
/** Пролог — тиждень нуль (engine/prologue.ts): три розвороти зі стікерами голосів; імена — при показі. */
export const PROLOGUE = prologueJson as PrologueSpread[];
/** Перший матч кар’єри (M12): чотири фіксовані сцени з лави, кожна з підказкою оповідача (match.ts:Tutorial). */
export const FIRST_MATCH = firstmatchJson as { scenes: { episode: string; hint: string }[] };
export const FIRST_MATCH_TUTORIAL: Tutorial = {
  plan: FIRST_MATCH.scenes.map((s) => s.episode),
  hints: Object.fromEntries(FIRST_MATCH.scenes.map((s) => [s.episode, s.hint])),
};
