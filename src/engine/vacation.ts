// Відпустка (M15, 21.09, сценарій користувача): розвороти зошита між першим і другим сезоном — той самий
// механізм, що пролог (engine/prologue.ts, ui/PrologueScreen.tsx), інший контент (content/vacation.json).
//
// **Порядок — лінійний** (M35, 03.10). Було in medias res: спершу газон без дати, потім ніч «шість годин тому»,
// потім «та сама ніч» — і два слова `head` дрібним рядком на весь скачок. Плейтест прочитав це як три події
// поспіль: травмувався, вночі поліз через паркан, травмувався ще раз. Загадка, заради якої скачок і робився,
// нікуди не ділася — вона просто інша: не «коли це», а «те саме коліно чи нове».
//   1. `trip` — дзвінок: агент, клуб із вищої ліги, «так» сказано; вибір — куди подіти три тижні до медогляду.
//      Правило M13 працює само: від’їзд абстрактно (тепло, чужий стадіон без назви), місто предметно (дача Тібо, база).
//   2. `sc_night_before` — ніч 03:20: невроз перед оглядом, якого Реєс ніколи не проходив, база на ремонті,
//      низький паркан. Корінь — страх не пройти перевірку (M12: страх втратити професію), голос, якого не чутно.
//   3. `sc_pitch_no_date` — газон: нога пішла, і треба зрозуміти, що це. Улики (бутса, звук, нога, трава)
//      відповідають «те саме чи нове». **Вибір міняє переживання, не сюжет** — так зникає відчуття рейок;
//      хто не став перевіряти, ще довго певен, що це старе коліно (`nightKnowledge().denied`).
//      Id лишився з часів «газону без дати»: він записаний у career.vacation збережених кар’єр.
//   4. `sc_pitch_again` — біль доходить, і приходить {oldsub}: він єдиний свідок, і від того, що ти йому сказав,
//      залежить тяжкість і `career.larsson` на другий сезон.
//   5. `sc_medical` — огляд буденний: лікар дивиться історію п’ять секунд.
//   6. `sc_window` — лист без вибору: розв’язка словами. Гравець щойно отримав новину, йому треба її дочитати.
//   7. `return` — база: дублер пішов у клуб, що піднявся разом із нами; новачок на позиції; жарт Тібо з уст Реєса.
//
// **Канон травми** (рішення користувача 03.10): у пролозі — розрив передньої хрестоподібної, півроку.
// Тут — тільки розтягнення з набряком, і ступінь одразу не видно. Жодних трансплантатів і швів: лікар не
// каже «ні», він каже, що другий знімок потрібен через три тижні, — а трансферне вікно зачиняється раніше.
// Перехід зривається через календар, а не через вердикт. Місяць без м’яча, одне тренування перед першим туром:
// другий сезон Реєс починає здоровим, тільки не в формі — сили на старті нижчі й маркер `out_of_form`.
//
// Наслідки — через applyWeek, як у прологу; форма — nextMatch.start.stamina + флаг out_of_form (flags.json);
// запис в agentLog — «дзвінок був, зірвався через медогляд», тому літо другого сезону — фінальний дзвінок.

import { applyWeek, type LootItem } from './week';
import type { PrologueOption, PrologueSpread } from './prologue';
import type { Career } from './career';
import type { Promotion } from './season';
import { base, t } from '../content/i18n';

export type Injury = 'heavy' | 'medium' | 'light';
/** Що {oldsub} знає про травму (M28): він єдиний свідок, і другий сезон проти його клубу це пам’ятає. */
export type Witness = 'knows' | 'silent' | 'lied' | 'unsure' | 'none';
export type VacationOption = PrologueOption & { injury?: Injury; witness?: Witness; arcMin?: number };
export type VacationSpread = Omit<PrologueSpread, 'options'> & { options: VacationOption[] };
export type VacationPick = { spread: string; option: string };

/** Місяць без м’яча: сили на старті першого матчу нижчі, маркер «не в формі» на стільки матчів.
 *  М’якше, ніж було (−12/−8/−4 на 1–2 матчі): пропущено не все літо, а місяць, і одне тренування перед
 *  туром Реєс устигає. Різниця між ступенями — наслідок того, що сказано {oldsub} на газоні: лід одразу
 *  чи «дійду сам». */
const FORM: Record<Injury, { stamina: number; matches: number }> = { heavy: { stamina: -8, matches: 2 }, medium: { stamina: -6, matches: 1 }, light: { stamina: -4, matches: 1 } };

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
    ...Array.from({ length: form.matches }, (_, i) => ({ flag: 'out_of_form', after: i, mark: { minute: 0, episodeId: 'vacation', optionId: injury, past: base('місяць не бігав'), whenText: base('у липні') } })),
  ];
  loot.push({ text: form.matches === 1 ? t('місяць без м’яча: у першому матчі сили закінчаться раніше') : t('місяць без м’яча: у перших матчах сили закінчаться раніше'), kind: 'start', who: 'body', dir: 'down', where: t('старт сезону') });

  // Єдиний свідок (M28): {oldsub} бачив травму на газоні — другий сезон проти його клубу читає це з career.
  const witness = chosen.map(({ option }) => option.witness).find((x): x is Witness => !!x);
  if (witness) next.larsson = witness;

  // Дзвінок був, зірвався через медогляд: літо другого сезону — фінальний дзвінок (agent.ts:agentPending).
  next.agentLog = [...(career.agentLog ?? []), { season: seasonNumber, choice: 'leave', reason: 'medical' }];
  next.agentEcho = 'leave';
  // Дублер пішов туди, куди піднялися разом (перший із promo.with); ім’я дублера в ростері підміняється (content:syncRoster).
  next.subLeft = true;
  if (promo?.with[0]) next.subClub = promo.with[0];

  const ids = new Set(chosen.map(({ option }) => option.id));
  next.carriedFlags = (next.carriedFlags ?? []).map((f) => (ids.has(f.mark.episodeId) ? { ...f, mark: { ...f.mark, whenText: base('ще у відпустці') } } : f));
  next.vacation = Object.fromEntries(chosen.map(({ pick, option }) => [pick.spread, option.id]));
  const uniq = loot.filter((x, i) => loot.findIndex((y) => y.text === x.text) === i);
  return { career: next, tags: uniq.map((x) => x.text), loot: uniq };
}
