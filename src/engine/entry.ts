// Вихід із лави (21.09, рішення користувача): вихід — подія, а не рядок у стрічці. На хвилині виходу лента
// зупиняється, поверх — лист без кубика: сетап оповідача (табло, четвертий суддя, тренер) і колонка голосів,
// потім стандартна кнопка «Вийти на поле». Дебют — свої тексти і всі голоси, крім Спокою (його за лором ще не
// чутно, і тиша на його місці доречна); звичайний вихід — коротше, два-три голоси за станом матчу: рахунок,
// стан арки, зимовий дзвінок, коліно, кураж. Вибір — matchesSituation, як у сетапів: конкретніше перемагає.
// Контент — content/entry.json; екран — ui/EntryCard.tsx; момент — App.proceed (перед nextEpisode).

import entryJson from '../content/entry.json';
import { matchesSituation } from './flavor';
import type { MatchConditions } from './conditions';
import type { MatchState, SituationWhen, Voice, VoiceKey } from './types';

type EntryVoice = Voice & { when?: SituationWhen };
type EntryBlock = { setups: { when: SituationWhen; text: string }[]; voices: EntryVoice[] };
export type EntryContent = { debut: EntryBlock; regular: EntryBlock };
export type Entry = { setup: string; voices: Voice[] };

export const ENTRY = entryJson as EntryContent;

/** Скільки голосів на листі: дебют — усі, що підходять; звичайний вихід — не більше трьох. */
const REGULAR_MAX = 3;

export function buildEntry(state: MatchState, conditions: MatchConditions, debut: boolean, content: EntryContent = ENTRY): Entry {
  const block = debut ? content.debut : content.regular;
  const specificity = (w: SituationWhen | undefined) => Object.keys(w ?? {}).length;
  const setups = block.setups.filter((s) => matchesSituation(s.when, state, conditions));
  const best = Math.max(...setups.map((s) => specificity(s.when)));
  const setup = (setups.find((s) => specificity(s.when) === best) ?? block.setups[0]).text;
  // На кожен голос — найконкретніший рядок, що підходить; порядок голосів — як на листі моменту.
  const byVoice = new Map<VoiceKey, EntryVoice>();
  for (const v of block.voices) {
    if (v.when && !matchesSituation(v.when, state, conditions)) continue;
    const prev = byVoice.get(v.who);
    if (!prev || specificity(v.when) > specificity(prev.when)) byVoice.set(v.who, v);
  }
  const order: VoiceKey[] = ['ego', 'team', 'body', 'vision', 'instinct', 'composure'];
  let voices = order.filter((k) => byVoice.has(k)).map((k) => ({ who: k, line: byVoice.get(k)!.line }));
  if (!debut) {
    // Спершу ті, у кого є умова (вони про цей матч), потім загальні — і не більше трьох.
    voices = voices
      .map((v, i) => ({ v, i, s: specificity(byVoice.get(v.who)!.when) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, REGULAR_MAX)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.v);
  }
  return { setup, voices };
}
