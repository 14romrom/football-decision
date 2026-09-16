import episodesJson from './episodes.json';
import playerJson from './player.json';
import type { Episode, Player } from '../engine/types';

// JSON намеренно остаётся плоским файлом контента: писать эпизоды должно быть
// можно без оглядки на TypeScript. Проверку формы делает tests/content.test.ts.
export const EPISODES = episodesJson as unknown as Episode[];
export const PLAYER = playerJson as unknown as Player;
