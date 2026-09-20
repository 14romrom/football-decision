// Лента между эпизодами: строки, которые игрок читает, пока матч идёт без него.
// Плейтест 17.09: 12 нейтральных строк на ~16 показов за матч — 38% повторов внутри
// одного матча и 88% на дистанции сезона. Теперь правила — данные (feed.json), с теми же
// условиями, что у реплик (flavor.ts:matchesSituation) плюс поле/погода/сила соперника
// и флаги характеристик (them_*): лента знает, против кого и где играем.
//
// Лента — единственный слой, где движок читает контент напрямую: у неё нет «другого
// контента» ни в тестах, ни в прогоне, а тянуть правила через createMatch (54 вызова)
// ради этого не стоит. Тесты подменяют пул через параметр rules.

import feedJson from '../content/feed.json';
import type { MatchConditions } from './conditions';
import { matchesSituation, pickFresh } from './flavor';
import type { Rng } from './rng';
import type { MatchState, SituationWhen } from './types';

/** filler — между эпизодами; goalUs/goalThem — гол ленты (с манерой); goalUsEcho/goalThemEcho —
 *  гол из исхода эпизода (только кто и счёт: манеру уже описал текст исхода, спорить с ним нельзя);
 *  halftime — перерва по счёту; knock — мікротравма в стыке; kickoff — первая строка по полю;
 *  benchIn — вихід з лави (M9): команда грала без тебе, тепер твоя черга. */
export type FeedKind = 'kickoff' | 'filler' | 'goalUs' | 'goalThem' | 'goalUsEcho' | 'goalThemEcho' | 'halftime' | 'knock' | 'benchIn';
export type FeedRule = { kind: FeedKind; when?: SituationWhen; lines: string[] };

export const FEED_RULES = feedJson as FeedRule[];

/** Строка ленты нужного вида: все подходящие правила, вес 3^ключей условия, виденные
 *  в этом и прошлых матчах уступают свежим. Плейсхолдеры ({scorer}, {score}, имена ростера)
 *  подставляет вызывающий. */
export function pickFeedLine(
  kind: FeedKind, state: MatchState, conditions: MatchConditions, rng: Rng, seen: Set<string> = new Set(),
  rules: FeedRule[] = FEED_RULES, seenNow: Set<string> = new Set(),
): string | undefined {
  const pool: { text: string; weight: number }[] = [];
  for (const r of rules) {
    if (r.kind !== kind) continue;
    if (r.when && !matchesSituation(r.when, state, conditions)) continue;
    const weight = 3 ** Object.keys(r.when ?? {}).length;
    for (const text of r.lines) pool.push({ text, weight });
  }
  return pickFresh(pool, seen, rng, seenNow)?.text;
}
