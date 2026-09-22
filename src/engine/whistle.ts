// Фінальний свисток (M10, 20.09): лист оповідача на полі перед роздягальнею. Без жодної цифри і без
// конкретних моментів — конкретика лишається дошці аналітика, з якою перший макет перетинався.
// Три рядки: одне речення-резюме про гру (багато варіацій за тоном матчу), обіцянка з тижня, якщо
// була, і трибуни — як розходяться і чи будуть затори. Правила — content/whistle.json, вибір той
// самий, що в реплік і ленти: вага 3^ключів, виденные строки уступают свежим (pickFresh).

import whistleJson from '../content/whistle.json';
import type { MatchConditions } from './conditions';
import { pickFresh } from './flavor';
import type { MatchSummary } from './match';
import type { Rng } from './rng';
import type { Episode, MatchState } from './types';

export type WhistleKind = 'summary' | 'promise' | 'crowd';
export type PromiseState = 'kept' | 'missed' | 'untouched';

/** Умова рядка — все без чисел на екрані, але добір іде за станом матчу. */
export type WhistleWhen = {
  result?: 'win' | 'draw' | 'loss';
  /** Гол або асист Реєса був. */
  scored?: boolean;
  /** Була катастрофа. */
  bad?: boolean;
  /** Сили на свисток нижче BALANCE.tiredBelow. */
  tired?: boolean;
  /** Матч без жодного результативного руху команди — рахунок нуль. */
  scoreless?: boolean;
  hype?: 'high' | 'low';
  venue?: 'home' | 'away';
  weather?: 'clear' | 'rain' | 'heat' | 'wind';
  strength?: 'strong' | 'even' | 'weak';
  promise?: PromiseState;
  /** Перший матч кар’єри (M12): свисток уперше говорить про віру собі. */
  first?: boolean;
  /** Стан арки (M13): три регістри свистка — нога, «ніхто не сказав молодець», «не подивився на трибуну». */
  arc?: number;
  /** Вища ліга (M14): другий сезон — стадіони в три яруси, і свисток це знає. */
  top?: boolean;
  /** Вилучення (M18.0): кінцівку ти дивився не з поля. */
  sentOff?: boolean;
  /** Тебе замінили по ходу (M18): кінцівку ти дивився з лави, і це вирішив тренер. */
  subbedOff?: boolean;
  /** Стикові (M19): один матч за вихід — свисток тут важить більше за будь-який тур. */
  playoff?: boolean;
};
export type WhistleRule = { kind: WhistleKind; when?: WhistleWhen; lines: string[] };

export const WHISTLE_RULES = whistleJson as WhistleRule[];

/** Обіцянка з тижня: варіант із requires.flags week_promise зіграно? гол Реєса тієї ж хвилини — виконав. */
export function promiseState(state: MatchState, episodes: Episode[], selfName: string): PromiseState | null {
  const promised = new Set<string>();
  for (const e of episodes) for (const o of e.options) if (o.requires?.flags?.includes('week_promise')) promised.add(e.id + '/' + o.id);
  const played = state.log.find((e) => e.kind === 'episode' && promised.has((e.episodeId ?? '') + '/' + (e.optionId ?? '')));
  if (played) {
    const scored = state.log.some((e) => e.kind === 'goalUs' && e.minute === played.minute && e.scorer === selfName);
    return scored ? 'kept' : 'missed';
  }
  // Прапорець дожив до свистка — до удару не дійшло. Без прапорця обіцянки не було.
  return state.flags.includes('week_promise') ? 'untouched' : null;
}

export function whistleContext(state: MatchState, summary: MatchSummary, cond: MatchConditions, promise: PromiseState | null, tiredBelow: number, first = false, arc?: number, top = false, sentOff = false, subbedOff = false, playoff = false): WhistleWhen {
  return {
    result: summary.scoreUs > summary.scoreThem ? 'win' : summary.scoreUs < summary.scoreThem ? 'loss' : 'draw',
    scored: summary.stats.goals + summary.stats.assists > 0,
    bad: state.log.some((e) => e.kind === 'episode' && e.tier === 'badFail'),
    tired: state.stamina < tiredBelow,
    scoreless: summary.scoreUs === 0,
    hype: state.fanHype >= 70 ? 'high' : state.fanHype < 35 ? 'low' : undefined,
    venue: cond.venue === 'neutral' ? undefined : cond.venue,
    weather: cond.weather,
    strength: cond.strength,
    ...(promise ? { promise } : {}),
    ...(first ? { first } : {}),
    ...(sentOff ? { sentOff } : {}),
    ...(subbedOff ? { subbedOff } : {}),
    ...(playoff ? { playoff } : {}),
    ...(top ? { top } : {}),
    ...(arc ? { arc } : {}),
  };
}

function matches(w: WhistleWhen | undefined, c: WhistleWhen): boolean {
  if (!w) return true;
  for (const [k, v] of Object.entries(w) as [keyof WhistleWhen, unknown][]) {
    if (v !== undefined && c[k] !== v) return false;
  }
  return true;
}

export function pickWhistleLine(kind: WhistleKind, c: WhistleWhen, rng: Rng, seen: Set<string>, rules: WhistleRule[] = WHISTLE_RULES): string | undefined {
  const pool: { text: string; weight: number }[] = [];
  // Перший матч кар’єри: якщо для цього виду є рядки «first», решта не конкурує — свисток має сказати
  // про віру собі саме сьогодні, а вагами (3^ключів) це не гарантувати.
  const fit = rules.filter((r) => r.kind === kind && matches(r.when, c));
  const firstOnly = c.first ? fit.filter((r) => r.when?.first) : [];
  // Вилучення так само витісняє решту: після червоної свисток не може говорити «ти дотягнув до кінця».
  const offOnly = c.sentOff ? fit.filter((r) => r.when?.sentOff) : c.subbedOff ? fit.filter((r) => r.when?.subbedOff) : c.playoff ? fit.filter((r) => r.when?.playoff) : [];
  for (const r of firstOnly.length ? firstOnly : offOnly.length ? offOnly : fit) {
    const weight = 3 ** Object.keys(r.when ?? {}).length;
    for (const text of r.lines) pool.push({ text, weight });
  }
  return pickFresh(pool, seen, rng)?.text;
}

export type Whistle = { summary: string; promise?: string; crowd: string };

/** Три рядки листа. Обіцянка — лише коли була. Порожній пул — помилка контенту (тест тримає безумовні правила). */
export function buildWhistle(c: WhistleWhen, rng: Rng, seen: Set<string> = new Set(), rules: WhistleRule[] = WHISTLE_RULES): Whistle {
  const take = (kind: WhistleKind) => {
    const line = pickWhistleLine(kind, c, rng, seen, rules);
    if (!line) throw new Error(`в whistle.json нет строк вида ${kind}`);
    seen.add(line);
    return line;
  };
  return {
    summary: take('summary'),
    ...(c.promise ? { promise: take('promise') } : {}),
    crowd: take('crowd'),
  };
}
