// Дія Реєса на полі після кидка (17.10, спрощений варіант). Шаблон руху й місце сцени виводить
// tools/actions.ts з української бази (src/content/actions.json); тут — лише читання й вибір кінцівки.
// Кінцівку вирішує ярус кидка, а не контент: чисто — вийшло, «вийшло, але» — вийшло з ціною,
// не вийшло — відібрали чи воротар узяв, катастрофа — втрата й контратака. Гол, пропущений,
// фол і червона — з ісходу (події й apply), як і раніше в finale.ts.

import actionsJson from '../content/actions.json';
import endsJson from '../content/action-ends.json';
import type { Episode, EpisodeOption, Resolution, TimelineEvent } from './types';
import { pickOutcome } from './resolve';

/** 23.10: «hold» був звалищем (94 варіанти з 604): позиційне, психологічне, навіть передачі. Тепер окремо:
 *  line — лінія оборони крокує разом (офсайдна пастка), mark — опіка, cover — закрити кут чи шлях,
 *  wait — чекати на підбір, calm — пауза: зберегти м'яч, не реагувати, збити темп. */
export const ACTION_TEMPLATES = ['pass', 'switch', 'through', 'back', 'cross', 'dribble', 'shot', 'header', 'tackle', 'shield', 'run', 'foul', 'hold', 'talk', 'line', 'mark', 'cover', 'wait', 'calm'] as const;
export type ActionTemplate = typeof ACTION_TEMPLATES[number];
export type ActionResult = 'goal' | 'concede' | 'red' | 'foul' | 'ok' | 'meh' | 'fail' | 'lost';
/** Події кінцівки, які називає текст ісходу (M52, tools/action-ends.ts), у порядку тексту.
 *  Удар: whiff — по повітрю, bar/post — каркас, over/wide — повз, tip — воротар кінчиками (далі кутовий),
 *  held — воротар забрав, parry — відбив перед собою, block — захисник чи стінка, line — винесли з лінії.
 *  Далі: rebound — добивання (гол — того, хто в `by`), corner, out, offside, pen — пенальті, fk — фол на
 *  Реєсі, cut — перехоплення, down — Реєс на газоні. */
/** 23.10: + card/cardme (картка їм / тобі; red — червона), ref (суддя показує, махає, розводить), cross (подача
 *  чи простріл, не Реєса), aerial (боротьба вгорі), shout (крик, жест), run (ривок), beat (обвели). */
export const ACTION_BEATS = ['whiff', 'bar', 'post', 'over', 'wide', 'tip', 'held', 'parry', 'block', 'line', 'rebound', 'corner', 'out', 'offside', 'pen', 'fk', 'cut', 'down',
  'card', 'cardme', 'red', 'ref', 'cross', 'aerial', 'shout', 'run', 'beat'] as const;
export type ActionBeat = typeof ACTION_BEATS[number];
/** `target` — куди м'яч, якщо назва варіанта це каже («на дугу», «на дальню»); зона стрічки або nearPost/farPost.
 *  `end` — події кінцівки з тексту ісходу; `by` — хто забиває, якщо гол не Реєса (ключ ростера з `apply.scorer`);
 *  `counter` — ісход каже про їхню контратаку (воротар вводить уперед, вони біжать). */
export type ReyesAction = { template: ActionTemplate; place: string | null; target: string | null; result: ActionResult; end?: ActionBeat[]; by?: string; counter?: boolean };
/** Шаблони, у яких Реєс сам не б'є: якщо ісход каже «твій гол», поле має показати удар, а не передачу. */
const NOT_A_STRIKE = new Set<ActionTemplate>(['pass', 'back', 'through', 'switch', 'cross', 'hold', 'talk', 'shield', 'tackle', 'foul']);
const ENDS = endsJson as Record<string, string>;

const ACTIONS = actionsJson as { places: Record<string, string>; options: Record<string, ActionTemplate>; targets?: Record<string, string> };

/** Місце сцени зоною стрічки («theirD:C») або null — тоді точка сім'ї (Pitch:FAMILY_SPOT). */
export const scenePlace = (episodeId: string): string | null => ACTIONS.places[episodeId] ?? null;

export function reyesAction(episode: Episode, option: EpisodeOption, res: Resolution, events: TimelineEvent[]): ReyesAction {
  const template = ACTIONS.options[`${episode.id}/${option.id}`] ?? 'hold';
  const place = scenePlace(episode.id);
  const target = ACTIONS.targets?.[`${episode.id}/${option.id}`] ?? null;
  const outcome = pickOutcome(option, res);
  const apply = outcome.apply;
  const tierKey = outcome === option.outcomes.crit ? 'crit' : res.tier;
  const end = (ENDS[`${episode.id}/${option.id}/${tierKey}`] ?? '').split(' ').filter(Boolean) as ActionBeat[];
  const result: ActionResult =
    events.some((e) => e.kind === 'goalThem') ? 'concede'
    : events.some((e) => e.kind === 'goalUs') ? 'goal'
    : apply?.addFlags?.includes('sent_off') ? 'red'
    : apply?.foul || apply?.addFlags?.includes('booked') ? 'foul'
    : (apply?.losses ?? 0) > 0 || apply?.counterAttack ? 'lost'
    : res.tier === 'clean' ? 'ok' : res.tier === 'cost' ? 'meh' : res.tier === 'fail' ? 'fail' : 'lost';
  // Свій гол Реєса (`apply.goal`) — завжди удар (плейтест 19.10: «замкнути в дотик» з голом виглядало як пас).
  // Шаблон виводиться з назви варіанта («в дотик» — передача), а ісход знає, хто забив: 34 таких ісходи.
  const own = !!apply?.goal && (result === 'goal');
  return { template: own && NOT_A_STRIKE.has(template) ? 'shot' : template, place, target, result, end, by: apply?.scorer && apply.scorer !== 'self' ? apply.scorer : undefined, counter: !!apply?.counterAttack };
}
