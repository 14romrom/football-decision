import episodesJson from './episodes.json';
import playerJson from './player.json';
import rosterJson from './roster.json';
import flavorJson from './flavor.json';
import flagsJson from './flags.json';
import { fillNamesDeep, type Roster, type TeamRoster } from '../engine/names';
import type { FlavorRule } from '../engine/flavor';
import type { Strength } from '../engine/conditions';
import type { Episode, FlagRule, Player } from '../engine/types';

// JSON намеренно остаётся плоским файлом контента: писать эпизоды должно быть
// можно без оглядки на TypeScript. Проверку формы делает tests/content.test.ts.

export type Opponent = TeamRoster & { strength: Strength; blurb: string };
export const OPPONENTS = rosterJson.opponents as unknown as Record<string, Opponent>;
export const DEFAULT_OPPONENT = 'sandorea';

/** Ростер «мы + соперник по умолчанию» — для прогона, тестов и экрана /stats. */
export const ROSTER: Roster = { us: rosterJson.us as TeamRoster, them: OPPONENTS[DEFAULT_OPPONENT] };
export function rosterFor(opponentKey: string): Roster {
  return { us: ROSTER.us, them: OPPONENTS[opponentKey] ?? OPPONENTS[DEFAULT_OPPONENT] };
}

/** Сырой контент с плейсхолдерами: имена подставляет createMatch под соперника матча. */
export const EPISODES_RAW = episodesJson as unknown as Episode[];
/** Эпизоды с именами соперника по умолчанию — там, где сессии нет (/stats, тесты формы). */
export const EPISODES = fillNamesDeep(EPISODES_RAW, ROSTER);
export const PLAYER = playerJson as unknown as Player;
export const FLAVOR = flavorJson as FlavorRule[];
/** Флаги-последствия; имена в подписях подставляет createMatch под ростер матча. */
export const FLAG_RULES = flagsJson as FlagRule[];



