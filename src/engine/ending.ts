// Останній дзвінок (M16, 21.09, сценарій користувача): кінець другого сезону — пропозиція клубу Ліги чемпіонів,
// варіанту лишитися немає; вибір — як прощатися: з ким останній вечір, що сказати сектору в інтерв’ю, що взяти
// з міста. Три розвороти зошита тим самим механізмом, що пролог і відпустка (ui/PrologueScreen.tsx), контент —
// content/ending.json. Рими до прологу: лист першого розвороту обирається за голосом відповіді скауту два роки тому
// (Его «через рік подзвоните самі» — і подзвонили), Мендонса вперше каже не «нормальний», Тібо — «мафія знає,
// де ти житимеш» (про нове місто абстрактно), партнер — квитки на Лігу чемпіонів за partnerBond, новачок чує жарт
// Тібо від Реєса. Епілог — перший матч у Лізі чемпіонів з лави, «розминайся», «Нога тримає. Решта — ваша справа».
// Далі — тільки титул із «Далі буде»: career.ended, як і в літньому «так» M13.

import { applyWeek } from './week';
import type { PrologueOption, PrologueSpread } from './prologue';
import type { Career } from './career';
import type { VoiceKey } from './types';
import { BALANCE } from './balance';

export type EndingOption = PrologueOption & { arcMin?: number; /** Партнер без дуету — прощання холодніше. */ replyCold?: string };
export type EndingSpread = Omit<PrologueSpread, 'options'> & { options: EndingOption[] };
export type EndingContent = { spreads: EndingSpread[]; epilogue: { tab: string; text: string[]; sign: string } };
export type EndingPick = { spread: string; option: string };

/** Фінал — після другого сезону, коли той закінчено; варіанту лишитися немає. */
export function endingPending(career: Career, seasonNumber: number, seasonOver: boolean): boolean {
  return seasonNumber >= 2 && seasonOver && !career.ended;
}

/** Голос відповіді скауту в пролозі — ним звучить останній дзвінок. */
export function prologueVoice(career: Career, prologue: PrologueSpread[]): VoiceKey | undefined {
  const id = career.prologue?.scout;
  return prologue.find((s) => s.id === 'scout')?.options.find((o) => o.id === id)?.voice;
}

export const partnerBonded = (career: Career): boolean => (career.partnerBond ?? 0) >= BALANCE.people.partnerBonded;

export function finishEnding(career: Career, spreads: EndingSpread[], picks: EndingPick[], seasonNumber: number): { career: Career } {
  const chosen = picks.map((p) => spreads.find((s) => s.id === p.spread)?.options.find((o) => o.id === p.option)).filter((o): o is EndingOption => !!o);
  // Наслідки застосовуємо тим самим шляхом, що в пролозі, — вони нікуди не підуть, але картка й здобутки чесні.
  const applied = applyWeek(career, chosen.map((option) => ({ activity: { id: option.id, voice: option.voice, title: option.say, line: option.line, effect: option.effect } })));
  const next: Career = {
    ...applied.career,
    ended: { season: seasonNumber },
    ending: Object.fromEntries(picks.map((p) => [p.spread, p.option])),
    agentLog: [...(career.agentLog ?? []), { season: seasonNumber, choice: 'leave' }],
  };
  return { career: next };
}
