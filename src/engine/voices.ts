// Голоса на вариантах (Disco Elysium): Его и Команда спорят, атрибуты подсказывают.
// Голос слышно, только когда он сильный: Бачення +4 видит открытого партнёра,
// Позиція +0 молчит. Так сильные и слабые стороны объясняются репликами, а не бирками.
//
// Голос, который слушают, становится громче: слушал Его два раза подряд —
// он перекрикивает даже серию провалов, но Команда от этого замолкает (и наоборот).
// Это первый слой «выбор имеет вес» — полный перенос между матчами будет в M2.

import { BALANCE } from './balance';
import { attrMod } from './attr';
import type { EpisodeOption, MatchState, Player, VoiceKey, VoiceTrace } from './types';

export const VOICE_LABEL: Record<VoiceKey, string> = {
  ego: 'Его',
  team: 'Команда',
  composure: 'Холоднокровність',
  vision: 'Бачення',
  instinct: 'Інстинкт',
  body: 'Тіло',
};

export function initVoiceTrace(): VoiceTrace {
  return {
    counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 },
    streak: { who: null, count: 0 },
  };
}

/** Вызывается из applyChoice на каждом выборе, у которого есть голос. */
export function recordVoice(trace: VoiceTrace, who: VoiceKey): void {
  trace.counts[who] += 1;
  trace.streak = trace.streak.who === who ? { who, count: trace.streak.count + 1 } : { who, count: 1 };
}

/** Голос, который звучал громче всех за матч — для пересказа. null, если разброс ровный. */
export function dominantVoice(trace: VoiceTrace): { who: VoiceKey; count: number } | null {
  const entries = Object.entries(trace.counts) as [VoiceKey, number][];
  const [who, count] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return count >= BALANCE.voiceDominantMin ? { who, count } : null;
}

const listenedTwice = (state: MatchState, who: VoiceKey) => state.voices.streak.who === who && state.voices.streak.count >= 2;

export function voiceAudible(who: VoiceKey, option: EpisodeOption, state: MatchState, player: Player): boolean {
  const m = (a: keyof Player['attrs']) => attrMod(player.attrs[a]);
  const loud = BALANCE.voiceMinMod;
  switch (who) {
    case 'ego':
      // Разогнався: слушал Его дважды подряд — он не затихает даже в серии провалов.
      if (option.goals.personal < 2) return false;
      return state.momentum >= 0 || listenedTwice(state, 'ego');
    case 'team':
      if (option.goals.team < 2) return false;
      // Команда замовкає, если только что слушали Его: партнёры перестали звать.
      if (listenedTwice(state, 'ego')) return false;
      return state.coachTrust >= 40;
    case 'composure': return m('composure') >= loud || state.composureNow >= 70;
    case 'vision': return m('vision') >= loud || m('positioning') >= loud;
    case 'instinct': return m('dribbling') >= loud || m('first_touch') >= loud;
    case 'body': return m('pace') >= loud || m('strength') >= loud || state.stamina >= 80;
  }
}
