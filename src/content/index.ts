import episodesJson from './episodes.json';
import playerJson from './player.json';
import rosterJson from './roster.json';
import { fillNamesDeep, type Roster } from '../engine/names';
import type { Episode, Player } from '../engine/types';

// JSON намеренно остаётся плоским файлом контента: писать эпизоды должно быть
// можно без оглядки на TypeScript. Проверку формы делает tests/content.test.ts.
export const ROSTER = rosterJson as Roster;
/** Эпизоды с уже подставленными именами: движок и UI про плейсхолдеры не знают. */
export const EPISODES = fillNamesDeep(episodesJson as unknown as Episode[], ROSTER);
/** Сырой контент — для проверок, что плейсхолдеры разрешаются и имена не зашиты. */
export const EPISODES_RAW = episodesJson as unknown as Episode[];
export const PLAYER = playerJson as unknown as Player;
