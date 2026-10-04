// Перемотка кар'єри з гри (M34.2): склеює контент, рушій (engine/autoplay.ts) і сховище слота.
// Тут живе все, що знає про localStorage; у autoplay — чиста логіка, яку ганяють і тести.
//
// Перед перемоткою автоматично ставимо контрольну точку: мотати туди, звідки не повернешся, —
// пастка, а не інструмент.

import { ACTIVITIES, EPISODES_RAW, FLAG_RULES, OPPONENTS, OPPONENT_KEYS, PLAYER, PROLOGUE, ROSTER, VACATION, WEEK_SCENES, rosterFor } from '../content';
import { fillNamesDeep } from '../engine/names';
import { autoPlay, type AutoTarget } from '../engine/autoplay';
import { defaultCareer } from '../engine/career';
import { createSeason } from '../engine/season';
import { readCareer, writeCareer } from './career-storage';
import { readSeason, writeSeason } from './season-storage';
import { recordResult } from './history';
import { takeShot } from './checkpoint';
import { t } from '../content/i18n';

export type FastForwardResult = { played: number; vacationAuto: boolean; seed: number };

export function fastForward(target: AutoTarget): FastForwardResult {
  // Точка повернення — до того, як щось зміниться.
  takeShot('save', t('перед перемоткою'));

  const career = readCareer();
  const season = readSeason() ?? createSeason(Math.floor(Math.random() * 1e9), OPPONENT_KEYS.second);
  const seed = Math.floor(Math.random() * 1e9);

  const res = autoPlay({ career: career ?? defaultCareer(), season }, target, seed, {
    player: PLAYER,
    episodes: EPISODES_RAW,
    activities: ACTIVITIES,
    scenes: WEEK_SCENES,
    prologue: fillNamesDeep(PROLOGUE, ROSTER),
    vacation: fillNamesDeep(VACATION, ROSTER),
    flagRules: FLAG_RULES,
    opponents: OPPONENTS,
    secondKeys: OPPONENT_KEYS.second,
    topKeys: OPPONENT_KEYS.top,
    rosterFor,
  });

  writeCareer(res.career);
  writeSeason(res.season);
  // Історія потрібна для тонусу й таблиці, а от пам'ять прочитаних текстів — ні: ці матчі ніхто не
  // читав, і перший справжній матч має починатися зі свіжими репліками.
  for (const m of res.matches) recordResult(m.scoreUs, m.scoreThem, []);

  return { played: res.played, vacationAuto: res.vacationAuto, seed };
}
