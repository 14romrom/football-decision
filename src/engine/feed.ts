// Лента между эпизодами: строки, которые игрок читает, пока матч идёт без него.
// Плейтест 17.09: 12 нейтральных строк на ~16 показов за матч — 38% повторов внутри
// одного матча и 88% на дистанции сезона. Теперь правила — данные (feed.json), с теми же
// условиями, что у реплик (flavor.ts:matchesSituation) плюс поле/погода/сила соперника
// и флаги характеристик (them_*): лента знает, против кого и где играем.
//
// Лента — единственный слой, где движок читает контент напрямую: у неё нет «другого
// контента» ни в тестах, ни в прогоне, а тянуть правила через createMatch (54 вызова)
// ради этого не стоит. Тесты подменяют пул через параметр rules.

import feedJsonRaw from '../content/feed.json';
import { tr } from '../content/i18n';
// Контент цього модуля йде повз content/index.ts, тому переклад (M47) вмикається тут же.
const feedJson = tr(feedJsonRaw);
import type { MatchConditions } from './conditions';
import { matchesSituation, pickFresh } from './flavor';
import type { Rng } from './rng';
import type { MatchState, SituationWhen } from './types';

/** filler — между эпизодами; goalUs/goalThem — гол ленты (с манерой); goalUsEcho/goalThemEcho —
 *  гол из исхода эпизода (только кто и счёт: манеру уже описал текст исхода, спорить с ним нельзя);
 *  halftime — перерва по счёту; knock — мікротравма в стыке; kickoff — первая строка по полю;
 *  benchIn — вихід з лави (M9): команда грала без тебе, тепер твоя черга. */
export type FeedKind = 'kickoff' | 'filler' | 'goalUs' | 'goalThem' | 'goalUsEcho' | 'goalThemEcho' | 'halftime' | 'knock' | 'benchIn';
export type FeedRule = { kind: FeedKind; when?: SituationWhen; lines: string[]; stage?: string[] };

export const FEED_RULES = feedJson as FeedRule[];

// ——— постановка рядка на полі (17.10) ————————————————————————————————————
// Кожен рядок стрічки має запис «дія зона [хто>кого] [кінець…]» у паралельному масиві `stage`:
// поле розігрує саме те, про що рядок, а не випадкові передачі. Рушій нічого з цим не робить —
// лише несе разом із текстом до UI (TimelineEvent.stage). Розбір і словник — тут, щоб тест і поле
// читали одне й те саме.

/** Дії, які вміє розіграти поле (ui/Pitch.tsx). Нова дія — спершу тут, потім хореографія. */
export const STAGE_ACTS = [
  'kickoff', 'build', 'switch', 'back', 'long', 'press', 'intercept', 'dribble', 'cross', 'shot', 'header', 'duel',
  'foul', 'out', 'wall', 'corner', 'keeper', 'hold', 'stoppage', 'offside', 'swap', 'argue', 'bench', 'wide', 'crowd',
  'self', 'knock', 'run', 'push', 'deep', 'slip', 'clear', 'block', 'goal', 'echo', 'half', 'enter',
] as const;
export type StageAct = typeof STAGE_ACTS[number];
/** Зони по довжині поля (ми атакуємо праворуч) і по ширині: L — лівий фланг (угорі екрана). */
export const STAGE_X = ['ownBox', 'own', 'mid', 'their', 'theirBox'] as const;
export const STAGE_Y = ['L', 'C', 'R'] as const;
/** Ролі на полі: свої — ключі ростера, чужі — `them.*`; плюс узагальнені й службові. */
export const STAGE_ROLES = [
  'self', 'keeper', 'rb', 'lb', 'cb', 'cb2', 'dm', 'partner', 'striker', 'winger', 'sub', 'coach',
  'them.keeper', 'them.rb', 'them.lb', 'them.cb', 'them.cb2', 'them.mid', 'them.mid2', 'them.winger', 'them.winger2', 'them.striker',
  'us', 'them', 'ref', 'medic', 'fourth',
] as const;

/** Уточнення дії: чим скінчилось і хто ще поруч. Невідоме слово — опечатка, тест його ловить. */
export const STAGE_TAGS = [
  'alone', 'away', 'back', 'ball', 'bar', 'beat', 'beaten', 'blocked', 'boots', 'both', 'cb', 'cb2', 'cleared', 'corner',
  'counter', 'cutback', 'dive', 'double', 'down', 'error', 'flag', 'foul', 'fouled', 'hand', 'hang', 'header', 'heel',
  'hold', 'idle', 'ignored', 'keeper', 'keeperup', 'kick', 'long', 'lost', 'low', 'medic', 'nobody', 'none', 'nothing',
  'out', 'over', 'pen', 'play', 'rain', 'rebound', 'ref', 'rest', 'saved', 'shift', 'shout', 'slow', 'solo', 'sore',
  'stand', 'stands', 'stopped', 'talk', 'tap', 'them.cb', 'through', 'throw', 'tired', 'turn', 'wall', 'watch', 'water',
  'whistle', 'wide', 'winger', 'wipe', 'won',
] as const;

export type Stage = {
  act: StageAct; x?: typeof STAGE_X[number]; y?: typeof STAGE_Y[number]; place?: 'bench';
  who?: string; vs?: string; tags: string[];
  /** Хто з `who`/`vs` названий у рядку іменем (`{dm}`, `{them.cb.gen}`) — тільки їх поле підписує.
   *  «Хтось із їхніх лежить» показує фішку без підпису: рядок не каже, хто. */
  named?: string[];
};

/** Постановка разом зі списком тих, кого рядок називає іменем (плейсхолдер ролі в сирому тексті). */
export function stageFor(src: string, raw: string): Stage {
  const st = parseStage(src);
  const named = [st.who, st.vs].filter((r): r is string => !!r && new RegExp(`\\{${r.replace('.', '\\.')}[.}]`).test(raw));
  return named.length ? { ...st, named } : st;
}

/** «shot ownBox:L them.winger bar» → { act, x, y, who, tags }. Помилку розбору ловить тест контенту. */
export function parseStage(src: string): Stage {
  const [act, ...rest] = src.trim().split(/\s+/);
  const st: Stage = { act: act as StageAct, tags: [] };
  for (const tok of rest) {
    if (tok === 'bench') { st.place = 'bench'; continue; }
    const zone = /^(ownBox|own|mid|their|theirBox):(L|C|R)$/.exec(tok);
    if (zone) { st.x = zone[1] as Stage['x']; st.y = zone[2] as Stage['y']; continue; }
    const pair = /^([a-z.0-9]+)>([a-z.0-9]+)$/.exec(tok);
    if (pair && !st.who) { st.who = pair[1]; st.vs = pair[2]; continue; }
    if ((STAGE_ROLES as readonly string[]).includes(tok) && !st.who) { st.who = tok; continue; }
    st.tags.push(tok);
  }
  return st;
}

/** Строка ленты нужного вида: все подходящие правила, вес 3^ключей условия, виденные
 *  в этом и прошлых матчах уступают свежим. Плейсхолдеры ({scorer}, {score}, имена ростера)
 *  подставляет вызывающий. */
export function pickFeedLine(
  kind: FeedKind, state: MatchState, conditions: MatchConditions, rng: Rng, seen: Set<string> = new Set(),
  rules: FeedRule[] = FEED_RULES, seenNow: Set<string> = new Set(),
): string | undefined {
  return pickFeed(kind, state, conditions, rng, seen, rules, seenNow)?.text;
}

/** Те саме, що `pickFeedLine`, але разом із постановкою рядка. Вибір той самий — rng не змінюється. */
export function pickFeed(
  kind: FeedKind, state: MatchState, conditions: MatchConditions, rng: Rng, seen: Set<string> = new Set(),
  rules: FeedRule[] = FEED_RULES, seenNow: Set<string> = new Set(),
): { text: string; stage?: Stage } | undefined {
  const pool: { text: string; weight: number; stage?: string }[] = [];
  for (const r of rules) {
    if (r.kind !== kind) continue;
    if (r.when && !matchesSituation(r.when, state, conditions)) continue;
    const weight = 3 ** Object.keys(r.when ?? {}).length;
    r.lines.forEach((text, i) => pool.push({ text, weight, stage: r.stage?.[i] }));
  }
  const pick = pickFresh(pool, seen, rng, seenNow);
  return pick && { text: pick.text, ...(pick.stage ? { stage: stageFor(pick.stage, pick.text) } : {}) };
}
