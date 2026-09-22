// Аудит опций пула: доминируемые и «единственно правильные» варианты внутри эпизода.
// Гонять после добавления контента:  npm run audit          — сводка + нарушения
//                                     npm run audit -- --all — плюс полный список доминируемых опций
//
// В отличие от sim (боты играют матчи), здесь всё аналитически: для каждой опции считается
// распределение ярусов по 2d10 при нейтральном контексте для стартового Реєса и ожидаемая ценность
// исходов. Две валюты: team — что меняет счёт (гол, пропущенный, контратака), self — что меняет
// карьеру персонажа (протокол, довіра, трибуни, флаги). Веса грубые — задача не оценить опцию точно,
// а поймать пару, где один вариант лучше другого по всем осям сразу: такую пару игрок раскусит
// за два матча, и второй вариант станет мёртвой кнопкой. Аудит 20.09 нашёл 134 таких из 398.

import { EPISODES_RAW, PLAYER } from '../src/content';
import { CATASTROPHE_BAND, THRESHOLDS, BALANCE, MOMENTUM_BY_BOLDNESS } from '../src/engine/balance';
import { attrMod } from '../src/engine/attr';
import type { ApplyEffect, Episode, EpisodeOption, Position, Tier } from '../src/engine/types';

const TIERS: Tier[] = ['badFail', 'fail', 'cost', 'clean'];
const FORMS: Position[] = ['controlled', 'risky', 'desperate'];

// Распределение суммы 2d10.
const P2D10: number[] = Array(21).fill(0);
for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) P2D10[a + b] += 0.01;

/** Вероятности ярусов — та же логика, что resolve.ts:tierFor, но по всему распределению. */
export function tierProbs(pos: Position, mod: number, difficulty: number): Record<Tier, number> {
  const r: Record<Tier, number> = { badFail: 0, fail: 0, cost: 0, clean: 0 };
  const t = THRESHOLDS[pos];
  for (let raw = 2; raw <= 20; raw++) {
    const p = P2D10[raw];
    if (raw <= CATASTROPHE_BAND[pos]) r.badFail += p;
    else if (raw >= 20) r.clean += p;
    else if (raw + mod <= t.fail + difficulty) r.fail += p;
    else if (raw + mod <= t.cost + difficulty) r.cost += p;
    else r.clean += p;
  }
  return r;
}

/** Ценность исхода в двух валютах. Веса — порядок величин, не калибровка. */
function value(a: ApplyEffect | undefined): { team: number; self: number } {
  if (!a) return { team: 0, self: 0 };
  let team = 0, self = 0;
  if (a.goal) { team += 1; self += 6; }
  if (a.teamGoal) { team += 1; self += 1; }
  if (a.assist) self += 4;
  if (a.concede) { team -= 1; self -= 1; }
  if (a.counterAttack) { team -= BALANCE.counterAttackConcede; self -= 0.5; }
  if (a.keyPass) self += 1;
  if (a.duelWon) self += 0.7;
  if (a.corner) { team += 0.1; self += 0.3; }
  if (a.losses) self -= 0.6 * a.losses;
  if (a.foul) self -= 0.5;
  self += (a.coachTrust ?? 0) * 0.12 * BALANCE.systemic.trustDeltaScale;
  self += (a.fanHype ?? 0) * 0.08;
  self += (a.momentum ?? 0) * 0.4;
  // Спокій — ресурс концовки и слышимости голоса Спокою; без него 55 из 69 опций composure выглядели пустыми.
  self += (a.composure ?? 0) * 0.05;
  // Сили в ісході — та сама валюта, що й ціна варіанта (STAMINA_WEIGHT): «берегти сили» повертає їх.
  self += (a.stamina ?? 0) * 0.25;
  for (const f of a.addFlags ?? []) {
    if (f === 'booked') self -= 1.5;
    if (f === 'injured') self -= 4;
    if (f === 'knock') self -= 1.2;
    if (f === 'sent_off') { self -= 6; team -= 0.7; }
  }
  return { team, self };
}

type Row = {
  ep: Episode; o: EpisodeOption; mod: number; p: Record<Tier, number>;
  evTeam: number; evSelf: number; ev: number; pGoal: number;
};

/** Силы — тоже валюта: четверть очка за пункт (≈100 сил на 9 эпизодов). */
const STAMINA_WEIGHT = 0.25;
/** Отрыв EV, с которого эпизод считается «с правильным ответом». */
const SINGLE_ANSWER_GAP = 1.5;
/** Пороги аудита — храповик: опускать после каждой партии правок 9.6, поднимать нельзя.
 *  20.09: 34% / 36 на старте → 26% / 23 после пяти партий (кураж за ризик, цепочки и спокій в модели, призы
 *  проигравшим, «пас під удар» на складності ≥ 1, без двойной цены сил). */
export const AUDIT_LIMITS = { dominatedShare: 0.25, singleAnswer: 24 };

const unconditional = (o: EpisodeOption) => !o.requires && !o.insight;

/** Цепочка (apply.followUp) — тоже приз: звено с ударом или пенальті стоит столько, сколько лучшая его опция,
 *  с поправкой на лимиты цепочек (BALANCE.match.chain) — берём долю CHAIN_SHARE. Глубина — одно звено. */
const CHAIN_SHARE = 0.8;
const chainCache = new Map<string, { team: number; self: number; pGoal: number }>();
function chainValue(id: string, bonus: number): { team: number; self: number; pGoal: number } {
  const key = id + ':' + bonus;
  const hit = chainCache.get(key);
  if (hit) return hit;
  chainCache.set(key, { team: 0, self: 0, pGoal: 0 });   // защита от циклов
  const target = (EPISODES_RAW as Episode[]).find((e) => e.id === id);
  if (!target) throw new Error('followUp «' + id + '» не найден');
  const rows = target.options.filter(unconditional).map((o) => scoreOption(target, o, bonus, false));
  const best = rows.reduce((a, b) => (b.ev > a.ev ? b : a));
  const v = { team: best.evTeam * CHAIN_SHARE, self: (best.evSelf - best.o.staminaCost * STAMINA_WEIGHT) * CHAIN_SHARE, pGoal: best.pGoal * CHAIN_SHARE };
  chainCache.set(key, v);
  return v;
}

export function scoreOption(ep: Episode, o: EpisodeOption, bonus = 0, chains = true): Row {
  const mod = Math.min(12, attrMod(PLAYER.attrs[o.attribute]) + bonus);
  const p = tierProbs(o.basePosition, mod, o.difficulty ?? 0);
  let evTeam = 0, evSelf = 0, pGoal = 0;
  for (const t of TIERS) {
    const a = o.outcomes[t].apply;
    const v = value(a);
    let team = v.team, self = v.self, goal = a?.goal ? 1 : 0;
    if (chains && a?.followUp) {
      const c = chainValue(a.followUp, bonus);
      // Если цепочка не сработала — followUpElse; считаем половину на половину с самой цепочкой.
      const e = value(a.followUpElse);
      team += (c.team + e.team) / 2; self += (c.self + e.self) / 2; goal += (c.pGoal + (a.followUpElse?.goal ? 1 : 0)) / 2;
    }
    evTeam += p[t] * team;
    // Системний кураж за ризик (match.ts:applyChoice) — приз, якого нема в тексті ісходу.
    evSelf += p[t] * (self + (t === 'clean' ? MOMENTUM_BY_BOLDNESS[o.basePosition] * 0.4 : 0));
    // Трибуни реагують на сміливість до результату (BALANCE.systemic.boldnessHype) — теж системно.
    evSelf += p[t] * BALANCE.systemic.boldnessHype[o.basePosition] * 0.08;
    // Спокій: провал не збиває кураж і не тягне «після провалу» в наступний кидок (COMPOSURE_CALM).
    if (o.attribute === 'composure' && t === 'fail') evSelf += p[t] * 0.4;
    pGoal += p[t] * goal;
  }
  return { ep, o, mod, p, evTeam, evSelf, ev: evTeam * 5 + evSelf - o.staminaCost * STAMINA_WEIGHT, pGoal };
}

/** A доминирует B: не хуже по обеим валютам, катастрофе и силам, и заметно лучше хотя бы в одном. */
export function dominates(a: Row, b: Row): boolean {
  return a.evTeam >= b.evTeam - 0.02 && a.evSelf >= b.evSelf && a.p.badFail <= b.p.badFail && a.o.staminaCost <= b.o.staminaCost
    && (a.evSelf > b.evSelf + 0.3 || a.p.badFail < b.p.badFail - 0.01);
}

const f2 = (x: number) => x.toFixed(2);
const pc = (x: number) => (x * 100).toFixed(0) + '%';
const brief = (r: Row) => `«${r.o.label}» ${r.o.basePosition}/${r.o.effect} d${r.o.difficulty ?? 0} ${r.o.attribute}+${r.mod} сил${r.o.staminaCost} EV ${f2(r.ev)} (t ${f2(r.evTeam)} s ${f2(r.evSelf)}) bf ${pc(r.p.badFail)}`;

export function audit(bonus = 0) {
  const episodes = EPISODES_RAW as Episode[];
  const dominated: { ep: Episode; loser: Row; winner: Row }[] = [];
  const singleAnswer: { ep: Episode; best: Row; gap: number }[] = [];
  const bestForm: Record<Position, number> = { controlled: 0, risky: 0, desperate: 0 };
  let options = 0;

  for (const ep of episodes) {
    const rows = ep.options.filter(unconditional).map((o) => scoreOption(ep, o, bonus));
    options += rows.length;
    for (const b of rows) {
      const winner = rows.find((a) => a !== b && dominates(a, b));
      if (winner) dominated.push({ ep, loser: b, winner });
    }
    const sorted = [...rows].sort((a, b) => b.ev - a.ev);
    bestForm[sorted[0].o.basePosition]++;
    if (sorted.length > 1 && sorted[0].ev - sorted[1].ev > SINGLE_ANSWER_GAP) singleAnswer.push({ ep, best: sorted[0], gap: sorted[0].ev - sorted[1].ev });
  }

  // Гол на чистом исходе у безопасной формы — нарушение правила «great только там, где clean решает».
  // Исключения (решение 20.09): модули удара/пенальті (fin_*) и позиція — гол «головою» без риска —
  // это ниша атрибута, у которого иначе нет приза; у стартового Реєса позиція +0, так что 21%.
  const safeGoals = episodes.flatMap((ep) => ep.options
    .filter((o) => o.outcomes.clean.apply?.goal && o.basePosition === 'controlled' && !ep.id.startsWith('fin_') && o.attribute !== 'positioning')
    .map((o) => scoreOption(ep, o, bonus)));

  return { episodes: episodes.length, options, dominated, singleAnswer, bestForm, safeGoals };
}

function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const bonusArg = args.find((a) => a.startsWith('--bonus='));
  const bonus = bonusArg ? Number(bonusArg.slice('--bonus='.length)) : 0;
  const r = audit(bonus);

  console.log(`Аудит опций: ${r.episodes} эпизодов, ${r.options} безусловных опций, атрибуты Реєса ${bonus >= 0 ? '+' : ''}${bonus}\n`);

  console.log('Ярусы по форме (средняя по опциям):');
  for (const pos of FORMS) {
    const rows = (EPISODES_RAW as Episode[]).flatMap((ep) => ep.options.filter((o) => o.basePosition === pos).map((o) => scoreOption(ep, o, bonus)));
    const avg = (f: (x: Row) => number) => rows.reduce((s, x) => s + f(x), 0) / rows.length;
    console.log(`  ${pos.padEnd(11)} n=${String(rows.length).padStart(3)}  clean ${pc(avg((x) => x.p.clean))}  badFail ${pc(avg((x) => x.p.badFail))}  EV self ${f2(avg((x) => x.evSelf))}  EV team ${f2(avg((x) => x.evTeam))}  силы ${f2(avg((x) => x.o.staminaCost))}  P(гол) ${pc(avg((x) => x.pGoal))}`);
  }

  console.log(`\nЛучшая опция эпизода по EV: упевнено ${r.bestForm.controlled}, ризиковано ${r.bestForm.risky}, відчайдушно ${r.bestForm.desperate}`);
  console.log(`Доминируемых опций: ${r.dominated.length} из ${r.options} (${pc(r.dominated.length / r.options)}), эпизодов с ними: ${new Set(r.dominated.map((d) => d.ep.id)).size}`);
  console.log(`Эпизодов с «правильным ответом» (отрыв EV > ${SINGLE_ANSWER_GAP}): ${r.singleAnswer.length}`);

  if (r.safeGoals.length) {
    console.log(`\nГол на clean у формы «упевнено» (кроме fin_* и позиції) — ${r.safeGoals.length}, пересмотреть:`);
    for (const x of r.safeGoals) console.log(`  ${x.ep.id.padEnd(24)} ${brief(x)} P(гол) ${pc(x.pGoal)}`);
  }

  // Пороги — храповик: после каждой партии правок опускать, не поднимать. tests/content.test.ts держит их же.
  const c = AUDIT_LIMITS;
  const checks = [
    [`доминируемых опций ${pc(r.dominated.length / r.options)} ≤ ${pc(c.dominatedShare)}`, r.dominated.length / r.options <= c.dominatedShare],
    [`эпизодов с правильным ответом ${r.singleAnswer.length} ≤ ${c.singleAnswer}`, r.singleAnswer.length <= c.singleAnswer],
    [`безопасных голов вне ниш ${r.safeGoals.length} = 0`, r.safeGoals.length === 0],
  ] as const;
  console.log('\nПроверки:');
  for (const [label, ok] of checks) console.log(`  ${ok ? 'ок ' : 'НЕТ'} ${label}`);

  console.log(`\nЭпизоды с правильным ответом:`);
  for (const s of r.singleAnswer.sort((a, b) => b.gap - a.gap)) console.log(`  ${s.ep.id.padEnd(24)} отрыв ${f2(s.gap)}  ${brief(s.best)}`);

  if (all) {
    console.log(`\nДоминируемые опции:`);
    for (const d of r.dominated) console.log(`  ${d.ep.id}\n    ✗ ${brief(d.loser)}\n    ✓ ${brief(d.winner)}`);
  } else {
    console.log(`\nПолный список доминируемых — npm run audit -- --all; после сезона роста — --bonus=3`);
  }
}

if (process.argv[1] && process.argv[1].includes('audit-options')) main();
