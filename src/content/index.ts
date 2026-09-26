import episodesJson from './episodes.json';
import playerJson from './player.json';
import rosterJson from './roster.json';
import flavorJson from './flavor.json';
import flagsJson from './flags.json';
import activitiesJson from './activities.json';
import weekscenesJson from './weekscenes.json';
import adsJson from './ads.json';
import prologueJson from './prologue.json';
import vacationJson from './vacation.json';
import endingJson from './ending.json';
import firstmatchJson from './firstmatch.json';
import agentJson from './agent.json';
import espmJson from './espm.json';
import studiedJson from './studied.json';
import shotsJson from './shots.json';
import { fillNamesDeep, type Roster, type TeamRoster, type NameForms } from '../engine/names';
import type { FlavorRule } from '../engine/flavor';
import type { Strength } from '../engine/conditions';
import type { Episode, FlagRule, Player } from '../engine/types';
import type { Rng } from '../engine/rng';
import type { Activity, WeekScene } from '../engine/week';
import type { AdRule } from '../engine/espm';
import type { PrologueSpread } from '../engine/prologue';
import type { VacationSpread } from '../engine/vacation';
import type { EndingContent } from '../engine/ending';
import type { Tutorial, TutorialHint } from '../engine/match';
import type { AgentContent } from '../engine/agent';
import type { EspmColumn } from '../engine/espm';

// JSON намеренно остаётся плоским файлом контента: писать эпизоды должно быть
// можно без оглядки на TypeScript. Проверку формы делает tests/content.test.ts.

export type Opponent = TeamRoster & { strength: Strength; blurb: string; /** Вища ліга (M14); без поля — друга. */ tier?: 'top' };
export const OPPONENTS = rosterJson.opponents as unknown as Record<string, Opponent>;
/** Клуби за лігами (M14): перший сезон — тільки друга ліга; другий — вища плюс ті, хто піднявся з нами. */
export const OPPONENT_KEYS = {
  second: Object.keys(OPPONENTS).filter((k) => OPPONENTS[k].tier !== 'top'),
  top: Object.keys(OPPONENTS).filter((k) => OPPONENTS[k].tier === 'top'),
};
export const DEFAULT_OPPONENT = 'sandorea';

/** Ростер «мы + соперник по умолчанию» — для прогона, тестов и экрана /stats. */
export const ROSTER: Roster = { us: rosterJson.us as TeamRoster, them: OPPONENTS[DEFAULT_OPPONENT] };
// `{oldsub}` — колишній дублер: у чужій формі після відпустки (програмка, пости, сетап проти його клубу); до того —
// він же, щоб плейсхолдер розв’язувався будь-яким ростером. Ставиться до EPISODES: ті заповнюються при завантаженні.
const SUB_ORIGINAL: NameForms = { ...(rosterJson.us as TeamRoster).players.sub };
ROSTER.us.players.oldsub = { ...SUB_ORIGINAL };
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
export const VACATION = vacationJson as VacationSpread[];
export const ENDING = endingJson as EndingContent;

/** Дублер пішов (M15): ім’я `sub` у ростері підміняється на наступника — на місці, бо ROSTER читають усі
 *  (пости, агент, тиждень) і робити з нього функцію — правити півсотні викликів. Викликається з App при
 *  завантаженні кар’єри й після відпустки; `false` повертає Ларссона (нова кар’єра). */
export function syncRoster(subLeft: boolean): void {
  const us = rosterJson.us as TeamRoster & { subNext: NameForms };
  const target = subLeft ? us.subNext : SUB_ORIGINAL;
  Object.assign(ROSTER.us.players.sub, { nom: target.nom, gen: target.gen, dat: target.dat, ins: target.ins });
}
/** Перший матч кар’єри (M12): чотири фіксовані сцени з лави, кожна з підказкою оповідача (match.ts:Tutorial). */
export const FIRST_MATCH = firstmatchJson as { scenes: ({ episode: string } & TutorialHint)[] };
export const FIRST_MATCH_TUTORIAL: Tutorial = {
  plan: FIRST_MATCH.scenes.map((s) => s.episode),
  hints: Object.fromEntries(FIRST_MATCH.scenes.map(({ episode, target, title, text }) => [episode, { target, title, text }])),
};
/** Сцена агента між сезонами (engine/agent.ts): сетап, голоси, три відповіді, три обставини зриву. */
export const AGENT = agentJson as AgentContent;
/** Колонки ESPM про Реєса за станом арки (engine/espm.ts:playerColumn). */
export const ESPM_COLUMNS = espmJson as { column: Record<string, EspmColumn[]> };

/** «Тебе вивчили» (M27.1): що Бачення помічає, коли на листі є варіант, який суперник уже знає.
 *  Наблюдение, не совет — как строки insight; без «!» (тест). */
export const STUDIED_LINES = studiedJson as string[];

/** Рядок для листа: один на сцену, за хвилиною — щоб на тому самому листі він не стрибав.
 *  Живе тут, а не в екрані: у `src/ui/*` оператор остачі заборонений тестом «никаких процентов». */
export const studiedLine = (minute: number): string => STUDIED_LINES[Math.abs(minute) % STUDIED_LINES.length];

/** Кадри якорів (M24): файл лежить у `public/img/anchors/<id>.webp` — збирає його
 *  `npx tsx tools/optimize-images.ts` із папки `images/`. `focus` — object-position кадру: коли
 *  головне в сцені не по центру, зміщуємо, щоб його було видно на вузькому листі (рішення користувача 26.09).
 *  Немає ключа — немає кадру: лист лишається текстовим, кадру-дефолта в грі немає. */
export const SHOTS = shotsJson as Record<string, { focus?: string }>;
export const shotFor = (sceneId: string): { src: string; focus: string } | null => {
  const s = SHOTS[sceneId];
  return s ? { src: `./img/anchors/${sceneId}.webp`, focus: s.focus ?? '50% 42%' } : null;
};
