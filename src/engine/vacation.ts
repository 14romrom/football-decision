// Відпустка (M15, 21.09, сценарій користувача): три розвороти зошита між першим і другим сезоном — той самий
// механізм, що пролог (engine/prologue.ts, ui/PrologueScreen.tsx), інший контент (content/vacation.json).
//   1. Дзвінок — агент, клуб із вищої ліги, «так» сказано; вибір — куди подіти три тижні до медогляду.
//      Правило M13 працює само: від’їзд абстрактно (тепло, чужий стадіон без назви), місто предметно (дача Тібо, база).
//   2. Медогляд — травма на індивідуальному тренуванні перед оглядом, єдина причина зриву (борги прибрано:
//      клуб із боргами продає першим). Травма стається завжди; вибір — як готувався, і від нього — тяжкість.
//      Не жорстока (рішення користувача 21.09): розтягнення, до серпня нога в порядку — Реєс починає другий сезон,
//      тільки не в формі: літо без передсезонки → сили на старті нижчі й маркер `out_of_form` на 1–2 матчі.
//      Корінь — страх не пройти перевірку (M12: страх втратити професію) — голос, якого не чутно.
//   3. База — дублер пішов у клуб, що піднявся разом із нами; новачок на позиції; жарт Тібо — з уст Реєса.
// Наслідки — через applyWeek, як у прологу; форма — nextMatch.start.stamina + флаг out_of_form (flags.json);
// запис в agentLog — «дзвінок був, зірвався через медогляд», тому літо другого сезону — фінальний дзвінок.

import { applyWeek, type LootItem } from './week';
import type { PrologueOption, PrologueSpread } from './prologue';
import type { Career } from './career';
import type { Promotion } from './season';

export type Injury = 'heavy' | 'medium' | 'light';
export type VacationOption = PrologueOption & { injury?: Injury; arcMin?: number };
export type VacationSpread = Omit<PrologueSpread, 'options'> & { options: VacationOption[] };
export type VacationPick = { spread: string; option: string };

/** Літо без передсезонки: сили на старті першого матчу нижчі, маркер «не в формі» на стільки матчів. */
const FORM: Record<Injury, { stamina: number; matches: number }> = { heavy: { stamina: -12, matches: 2 }, medium: { stamina: -8, matches: 2 }, light: { stamina: -4, matches: 1 } };

/** Відпустка — один раз, після першого сезону, коли той закінчено. */
export function vacationPending(career: Career, seasonNumber: number, seasonOver: boolean): boolean {
  return seasonNumber === 1 && seasonOver && !career.vacation && !career.ended;
}

export function finishVacation(
  career: Career, spreads: VacationSpread[], picks: VacationPick[], promo: Promotion | null, seasonNumber: number,
): { career: Career; tags: string[]; loot: LootItem[] } {
  const chosen = picks.map((p) => {
    const spread = spreads.find((s) => s.id === p.spread);
    const option = spread?.options.find((o) => o.id === p.option);
    return option ? { pick: p, option } : null;
  }).filter((x): x is { pick: VacationPick; option: VacationOption } => x !== null);

  const applied = applyWeek(career, chosen.map(({ option }) => ({
    activity: { id: option.id, voice: option.voice, title: option.say, line: option.line, effect: option.effect },
  })));
  const next: Career = { ...applied.career };
  const loot: LootItem[] = [...applied.loot];

  const injury = chosen.map(({ option }) => option.injury).find((x): x is Injury => !!x) ?? 'medium';
  const form = FORM[injury];
  const prep = next.nextMatch ?? {};
  next.nextMatch = { ...prep, start: { ...(prep.start ?? {}), stamina: (prep.start?.stamina ?? 0) + form.stamina } };
  next.carriedFlags = [
    ...(next.carriedFlags ?? []),
    ...Array.from({ length: form.matches }, (_, i) => ({ flag: 'out_of_form', after: i, mark: { minute: 0, episodeId: 'vacation', optionId: injury, past: 'пропустив передсезонку', whenText: 'улітку' } })),
  ];
  loot.push({ text: form.matches === 1 ? 'форма: літо без передсезонки — перший матч важчий' : 'форма: літо без передсезонки — перші матчі важчі', kind: 'start', who: 'body', dir: 'down', where: 'старт сезону' });

  // Дзвінок був, зірвався через медогляд: літо другого сезону — фінальний дзвінок (agent.ts:agentPending).
  next.agentLog = [...(career.agentLog ?? []), { season: seasonNumber, choice: 'leave', reason: 'medical' }];
  next.agentEcho = 'leave';
  // Дублер пішов туди, куди піднялися разом (перший із promo.with); ім’я дублера в ростері підміняється (content:syncRoster).
  next.subLeft = true;
  if (promo?.with[0]) next.subClub = promo.with[0];

  const ids = new Set(chosen.map(({ option }) => option.id));
  next.carriedFlags = (next.carriedFlags ?? []).map((f) => (ids.has(f.mark.episodeId) ? { ...f, mark: { ...f.mark, whenText: 'ще у відпустці' } } : f));
  next.vacation = Object.fromEntries(chosen.map(({ pick, option }) => [pick.spread, option.id]));
  const uniq = loot.filter((x, i) => loot.findIndex((y) => y.text === x.text) === i);
  return { career: next, tags: uniq.map((x) => x.text), loot: uniq };
}
