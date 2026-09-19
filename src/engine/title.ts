// Реплика голоса на титуле (19.09). Картинка титула героическая — так Реєса видит Его; строка под
// ней — второй голос, который её осаживает. Формат пассивной проверки Disco Elysium:
// «ТІЛО [Легко: успіх] — Красиво. Приземлишся на шию.» — скобка необязательна, чисел в ней нет.
// Правила — content/title.json, условие как у flavor: все ключи `when` должны совпасть с контекстом,
// вес 3^ключей, виденные строки уступают свежим (pickFresh, память — settings.ts, не по слоту:
// титул один на устройство).

import type { VoiceKey } from './types';
import type { Rng } from './rng';
import { pickFresh } from './flavor';
import type { MatchResult } from './conditions';

export type TitleContext = {
  career: 'none' | 'any';
  /** Результат последнего матча активного слота. */
  last?: MatchResult;
  trust: 'low' | 'ok';
  /** Последний матч был давно — «давно не заходив». */
  idle: boolean;
  over: boolean;
};

export type TitleWhen = Partial<{ career: 'none' | 'any'; last: MatchResult; trust: 'low' | 'ok'; idle: boolean; over: boolean }>;
export type TitleRule = { when: TitleWhen; voice: VoiceKey; check?: string; lines: string[] };
export type TitleLine = { voice: VoiceKey; check?: string; text: string; weight: number };

/** Столько дней без матча — голос это замечает. */
export const IDLE_DAYS = 3;
/** Ниже — тренер «дивиться на список». Совпадает с порогом закрытого города в week.ts по смыслу,
 *  но титул не тянет weekContext: ему хватает числа. */
export const LOW_TRUST = 40;

export function titleContext(input: { matches: number; last?: MatchResult; coachTrust: number; lastAt: number | null; over: boolean; now?: number }): TitleContext {
  const now = input.now ?? Date.now();
  const idle = input.lastAt !== null && now - input.lastAt > IDLE_DAYS * 24 * 3600 * 1000;
  return {
    career: input.matches === 0 ? 'none' : 'any',
    last: input.matches === 0 ? undefined : input.last,
    trust: input.coachTrust < LOW_TRUST ? 'low' : 'ok',
    idle: input.matches > 0 && idle,
    over: input.over,
  };
}

export function matchesTitle(when: TitleWhen, ctx: TitleContext): boolean {
  return (Object.keys(when) as (keyof TitleWhen)[]).every((k) => when[k] === ctx[k]);
}

export function titlePool(rules: TitleRule[], ctx: TitleContext): TitleLine[] {
  return rules.filter((r) => matchesTitle(r.when, ctx)).flatMap((r) => {
    const weight = Math.pow(3, Object.keys(r.when).length);
    return r.lines.map((text) => ({ voice: r.voice, check: r.check, text, weight }));
  });
}

export function pickTitleLine(rules: TitleRule[], ctx: TitleContext, seen: Set<string>, rng: Rng): TitleLine | undefined {
  return pickFresh(titlePool(rules, ctx), seen, rng);
}
