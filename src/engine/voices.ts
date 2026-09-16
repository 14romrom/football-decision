// Голоса на вариантах (Disco Elysium): Его и Команда спорят, атрибуты подсказывают.
// Голос слышно, только когда он сильный: Бачення +4 видит открытого партнёра,
// Позиція +0 молчит. Так сильные и слабые стороны объясняются репликами, а не бирками.

import { BALANCE } from './balance';
import { attrMod } from './context';
import type { EpisodeOption, MatchState, Player, VoiceKey } from './types';

export const VOICE_LABEL: Record<VoiceKey, string> = {
  ego: 'Его',
  team: 'Команда',
  composure: 'Холоднокровність',
  vision: 'Бачення',
  instinct: 'Інстинкт',
  body: 'Тіло',
};

export function voiceAudible(who: VoiceKey, option: EpisodeOption, state: MatchState, player: Player): boolean {
  const m = (a: keyof Player['attrs']) => attrMod(player.attrs[a]);
  const loud = BALANCE.voiceMinMod;
  switch (who) {
    case 'ego': return option.goals.personal >= 2 && state.momentum >= 0;      // в серии провалов эго затихает
    case 'team': return option.goals.team >= 2 && state.coachTrust >= 40;      // при низком доверии команда не зовёт
    case 'composure': return m('composure') >= loud || state.composureNow >= 70;
    case 'vision': return m('vision') >= loud || m('positioning') >= loud;
    case 'instinct': return m('dribbling') >= loud || m('first_touch') >= loud;
    case 'body': return m('pace') >= loud || m('strength') >= loud || state.stamina >= 80;
  }
}
