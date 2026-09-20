// Тиждень між матчами: шість пропозицій — по одній на голос — з пулу на кар’єру, узяти
// можна до двох. Дело — это «какой голос беру на матч»: оно делает голос гучнішим або тихішим
// на один матч (временный сдвиг атрибутов), двигает старт (сили, кураж, трибуни), тренера,
// ставит флаги на поле, а тренировки тела/техники/зрения копятся в постоянный рост.
// Первая попытка недели (события «что сказать журналисту») откачена 17.09 как поверхностная:
// влияние на свой матч не читалось. Здесь каждое дело читается через бирку голоса и строку
// брифинга. Иронический тон строк — фишка игры, не украшение: без него это меню.
// Чистая логика; контент — content/activities.json; экран — ui/WeekScreen.tsx (тонкий).

import { BALANCE } from './balance';
import { clampTrust, POINT_VALUE, type Career, type CarriedFlag, type NextMatchPrep } from './career';
import type { Season } from './season';
import type { Rng } from './rng';
import { ATTRIBUTE_LABEL, type Attribute, type Mark, type Player, type VoiceKey } from './types';
import { VOICE_LABEL, voiceSees } from './voices';
import { attrMod } from './attr';

/** Условие показа — по итогам сезона и карьеры; побеждает не самое конкретное, а вес:
 *  условия здесь отсекают, а не ранжируют (в отличие от сетапов). */
export type ActivityWhen = {
  result?: 'win' | 'draw' | 'loss';
  bigLoss?: boolean;
  scored?: boolean;
  /** Забивал хоть раз за сезон — автографи не дають тому, хто ще не забив. */
  hasScored?: boolean;
  position?: 'top' | 'mid' | 'bottom';
  lowTrust?: boolean;
  highTrust?: boolean;
  minLevel?: number;
  minSeason?: number;
  minRound?: number;
  injured?: boolean;
  /** Флаги, принесённые из матча (partner_annoyed, booked…). */
  flags?: string[];
  notFlags?: string[];
  /** Оценка трибун в последнем матче не ниже — популярність. */
  fanRatingMin?: number;
};

export type ActivityEffect = {
  /** Голоси гучніші / тихіші на матч: +1 / −1 к модификатору их атрибутов. */
  louder?: VoiceKey[];
  quieter?: VoiceKey[];
  /** Сдвиг старта следующего матча. */
  stamina?: number;
  composure?: number;
  fanHype?: number;
  momentum?: number;
  /** Доверие тренера — сразу. */
  coachTrust?: number;
  /** Тренировка атрибута: +1 к счётчику, BALANCE.week.trainToPoint = +1 очко навсегда.
   *  'choice' — игрок выбирает атрибут голоса на экране. */
  train?: Attribute | 'choice';
  /** Флаги в следующий матч (after 0) или через N туров; past — для {trigger.past}. */
  flags?: { flag: string; after?: number; past: string }[];
  removeFlags?: string[];
  /** Вылечить травму/мікротравму к следующему матчу. */
  heal?: boolean;
  /** Строка в брифинг («Наслідки»). Обязательна: то, что игрок принёс с собой. */
  note: string;
};

/** Исход дела (тиждень v3, 19.09): дело — история с неизвестным концом. Какой исход выпадет,
 *  решает не случайность, а профиль голосов и скрытая проверка атрибута (без кубика на экране):
 *  вечірка після Его-сезону частіше закінчується сваркою, побачення при сильній Холоднокровності —
 *  тим, що вона розбирається у футболі. Каждый исход обязан оставить след (note + эффект). */
export type ActivityOutcome = {
  id: string;
  /** Сцена исхода — 1–3 предложения в тоне игры. */
  text: string;
  /** Чей это вечер: совпадает с доминирующим голосом карьеры — вес ×outcomeVoiceBoost. */
  voice?: VoiceKey;
  /** Скрытая проверка: модификатор атрибута ≥ min — вес ×outcomeCheckPass, иначе ×outcomeCheckFail. */
  check?: { attr: Attribute; min: number };
  /** Ситуация, в которой исход вероятнее (после поражения — сварка): ×outcomeSituationBoost. */
  boost?: ActivityWhen;
  weight?: number;
  effect: ActivityEffect;
  /** Продолжение — сцена недели (content/weekscenes.json). Одна сцена за неделю. */
  followUp?: string;
};

/** Сцена-продолжение: решение без кубика. Вариант с insight виден только тому, чей голос бачить
 *  (weekVoiceSees) — прокачка открывает варианты и между матчами. */
export type WeekSceneOption = { id: string; label: string; text: string; effect: ActivityEffect; insight?: { who: VoiceKey; line: string } };
export type WeekScene = { id: string; setup: string; options: WeekSceneOption[] };

export type Activity = {
  id: string;
  voice: VoiceKey;
  title: string;
  /** Одна строка в тоне Disco — то, что читает игрок под названием. */
  line: string;
  when?: ActivityWhen;
  once?: boolean;
  cooldown?: number;
  weight?: number;
  /** Эффект по умолчанию — когда исходов нет (дела v2) и для прогона. */
  effect: ActivityEffect;
  outcomes?: ActivityOutcome[];
};

export type WeekContext = {
  season: number; round: number; level: number;
  result: 'win' | 'draw' | 'loss' | null; bigLoss: boolean; scored: boolean; hasScored: boolean;
  position: number; clubs: number; coachTrust: number; injured: boolean;
  flags: string[]; fanRating: number;
};

const LOW_TRUST = 40;
const HIGH_TRUST = 65;

/** Что видит неделя: последний тур, место, доверие, флаги из матча, травма. Без сыгранного
 *  тура недели нет — она всегда «після матчу». */
export function weekContext(season: Season, career: Career, position: number): WeekContext | null {
  const rounds = season.rounds ?? [];
  const last = rounds[rounds.length - 1];
  if (!last) return null;
  return {
    season: season.number, round: season.round, level: career.level,
    result: last.scoreUs > last.scoreThem ? 'win' : last.scoreUs < last.scoreThem ? 'loss' : 'draw',
    bigLoss: last.scoreThem - last.scoreUs >= 3,
    scored: last.goals + last.assists > 0,
    hasScored: season.player.goals + season.player.assists > 0,
    position, clubs: season.clubs.length, coachTrust: career.coachTrust,
    injured: career.injuredMatches > 0 || (career.carriedFlags ?? []).some((f) => f.flag === 'knock'),
    flags: (career.carriedFlags ?? []).filter((f) => !(f.after && f.after > 0)).map((f) => f.flag),
    fanRating: last.fanRating,
  };
}

export function matchesActivity(w: ActivityWhen | undefined, c: WeekContext): boolean {
  if (!w) return true;
  if (w.result && w.result !== c.result) return false;
  if (w.bigLoss !== undefined && w.bigLoss !== c.bigLoss) return false;
  if (w.scored !== undefined && w.scored !== c.scored) return false;
  if (w.hasScored !== undefined && w.hasScored !== c.hasScored) return false;
  if (w.position) {
    const third = c.position <= 2 ? 'top' : c.position > c.clubs - 2 ? 'bottom' : 'mid';
    if (third !== w.position) return false;
  }
  if (w.lowTrust !== undefined && w.lowTrust !== c.coachTrust < LOW_TRUST) return false;
  if (w.highTrust !== undefined && w.highTrust !== c.coachTrust >= HIGH_TRUST) return false;
  if (w.minLevel !== undefined && c.level < w.minLevel) return false;
  if (w.minSeason !== undefined && c.season < w.minSeason) return false;
  if (w.minRound !== undefined && c.round < w.minRound) return false;
  if (w.injured !== undefined && w.injured !== c.injured) return false;
  if (w.flags && !w.flags.every((f) => c.flags.includes(f))) return false;
  if (w.notFlags && w.notFlags.some((f) => c.flags.includes(f))) return false;
  if (w.fanRatingMin !== undefined && c.fanRating < w.fanRatingMin) return false;
  return true;
}

/** Тренер після розгрому або при низькій довірі закриває місто: лишаються дела Тіла й Бачення
 *  (і Холоднокровності — психолог теж «на базі»). Это не механика, это реплика. */
export function coachLocksCity(c: WeekContext): boolean {
  return c.bigLoss || c.coachTrust < LOW_TRUST;
}
const BASE_VOICES: VoiceKey[] = ['body', 'vision', 'composure'];
export const VOICE_ORDER: VoiceKey[] = ['body', 'vision', 'instinct', 'composure', 'team', 'ego'];

/** Шесть предложений недели — по одному на голос. Пул фильтруется условиями, once и cooldown,
 *  недавно показанные (BALANCE.week.recentPenalty недель) весят меньше; среди оставшихся — по весу.
 *  Детерминированно по rng: перезагрузка показывает те же карточки. */
export function offerWeek(pool: Activity[], c: WeekContext, career: Career, rng: Rng): Activity[] {
  const log = career.weekLog ?? [];
  const thisSeason = log.filter((e) => e.season === c.season);
  const lastChosen = (id: string) => Math.max(-Infinity, ...thisSeason.filter((e) => (e.chosen ?? []).includes(id)).map((e) => e.round));
  const lastOffered = (id: string) => Math.max(-Infinity, ...thisSeason.filter((e) => (e.offered ?? []).includes(id)).map((e) => e.round));
  const locked = coachLocksCity(c);
  const offers: Activity[] = [];
  for (const voice of VOICE_ORDER) {
    const voiceLocked = locked && !BASE_VOICES.includes(voice);
    const fitting = pool.filter((a) => {
      if (a.voice !== voice || !matchesActivity(a.when, c)) return false;
      // Закрытый город не отменяет разговор с ображеним партнёром: ситуационные дела по флагу остаются.
      if (voiceLocked && !a.when?.flags?.length) return false;
      if (a.once && thisSeason.some((e) => (e.chosen ?? []).includes(a.id))) return false;
      if (a.cooldown && c.round - lastChosen(a.id) < a.cooldown) return false;
      return true;
    });
    if (fitting.length === 0) continue;
    const weighted = fitting.map((a) => ({
      a, w: (a.weight ?? 1) * (c.round - lastOffered(a.id) < BALANCE.week.recentPenalty ? 0.25 : 1),
    }));
    const total = weighted.reduce((s, x) => s + x.w, 0);
    let r = rng.next() * total;
    let pick = weighted[weighted.length - 1].a;
    for (const x of weighted) { r -= x.w; if (r <= 0) { pick = x.a; break; } }
    offers.push(pick);
  }
  return offers;
}

/** Голос, которого слушали чаще всех за карьеру, — не меньше dominantMin раз и без ничьей. */
export function dominantCareerVoice(career: Career): VoiceKey | null {
  const entries = Object.entries(career.voiceCounts) as [VoiceKey, number][];
  const top = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (top[1] < BALANCE.week.dominantMin) return null;
  return entries.filter(([, n]) => n === top[1]).length === 1 ? top[0] : null;
}

/** Голос бачить между матчами: атрибутные — по силе атрибута (как в матче), Его — на популярности
 *  или как доминирующий, Команда — при доверии тренера. Открывает варианты в сценах недели. */
export function weekVoiceSees(who: VoiceKey, player: Player, c: WeekContext, career: Career): boolean {
  if (who === 'ego') return c.fanRating >= 7 || dominantCareerVoice(career) === 'ego';
  if (who === 'team') return c.coachTrust >= BALANCE.teamSeesTrust || dominantCareerVoice(career) === 'team';
  return voiceSees(who, player);
}

/** Какой исход выпадает: веса исходов × голос × проверка атрибута × ситуация. Детерминированно
 *  по rng (тот же сид — тот же вечер), без кубика на экране: игрок видит сцену, а не бросок. */
export function resolveOutcome(activity: Activity, player: Player, c: WeekContext, career: Career, rng: Rng): ActivityOutcome | null {
  const outs = activity.outcomes ?? [];
  if (outs.length === 0) return null;
  const w = BALANCE.week;
  const dominant = dominantCareerVoice(career);
  const weighted = outs.map((o) => {
    let weight = o.weight ?? 1;
    if (o.voice && o.voice === dominant) weight *= w.outcomeVoiceBoost;
    if (o.check) weight *= attrMod(player.attrs[o.check.attr]) >= o.check.min ? w.outcomeCheckPass : w.outcomeCheckFail;
    if (o.boost && matchesActivity(o.boost, c)) weight *= w.outcomeSituationBoost;
    return { o, weight };
  });
  const total = weighted.reduce((s, x) => s + x.weight, 0);
  let r = rng.next() * total;
  for (const x of weighted) { r -= x.weight; if (r <= 0) return x.o; }
  return weighted[weighted.length - 1].o;
}

/** Тиждень v3: три дні по три пропозиції. Голоса разные внутри дня, не больше maxPerVoice дел
 *  одного голоса за неделю (если голосов хватает); правила отбора те же, что у offerWeek. */
export function offerWeekDays(pool: Activity[], c: WeekContext, career: Career, rng: Rng): Activity[][] {
  const log = career.weekLog ?? [];
  const thisSeason = log.filter((e) => e.season === c.season);
  const lastChosen = (id: string) => Math.max(-Infinity, ...thisSeason.filter((e) => (e.chosen ?? []).includes(id)).map((e) => e.round));
  const lastOffered = (id: string) => Math.max(-Infinity, ...thisSeason.filter((e) => (e.offered ?? []).includes(id)).map((e) => e.round));
  const locked = coachLocksCity(c);
  const fits = (a: Activity) => {
    if (!matchesActivity(a.when, c)) return false;
    if (locked && !BASE_VOICES.includes(a.voice) && !a.when?.flags?.length) return false;
    if (a.once && thisSeason.some((e) => (e.chosen ?? []).includes(a.id))) return false;
    if (a.cooldown && c.round - lastChosen(a.id) < a.cooldown) return false;
    return true;
  };
  const used = new Set<string>();
  const perVoice: Partial<Record<VoiceKey, number>> = {};
  const days: Activity[][] = [];
  const w = BALANCE.week;
  for (let d = 0; d < w.days; d++) {
    const day: Activity[] = [];
    const dayVoices = new Set<VoiceKey>();
    // Порядок голосов внутри дня — со сдвигом, чтобы Его не открывал каждый день.
    const order = [...VOICE_ORDER.slice(d), ...VOICE_ORDER.slice(0, d)];
    // Второй проход без лимита на голос — когда голосов не хватает (тренер закрив місто: три
    // базовых голоса на три дня), иначе третий день оставался пустым.
    for (const capped of [true, false]) {
      for (const voice of order) {
        if (day.length >= w.perDay) break;
        if (dayVoices.has(voice) || (capped && (perVoice[voice] ?? 0) >= w.maxPerVoice)) continue;
        const fitting = pool.filter((a) => a.voice === voice && !used.has(a.id) && fits(a));
        if (fitting.length === 0) continue;
        const weighted = fitting.map((a) => ({ a, weight: (a.weight ?? 1) * (c.round - lastOffered(a.id) < w.recentPenalty ? 0.25 : 1) }));
        const total = weighted.reduce((s, x) => s + x.weight, 0);
        let r = rng.next() * total;
        let pick = weighted[weighted.length - 1].a;
        for (const x of weighted) { r -= x.weight; if (r <= 0) { pick = x.a; break; } }
        day.push(pick); used.add(pick.id); dayVoices.add(voice); perVoice[voice] = (perVoice[voice] ?? 0) + 1;
      }
    }
    days.push(day);
  }
  return days;
}

/** Обида голосов: кто предлагал и не был взят — +1 неделя; на neglectWeeks голос замовкає на
 *  matчі (quieter) и счётчик сбрасывается. Возвращает псевдо-дела с эффектом — их применяет applyWeek. */
export function neglectPenalties(career: Career, offeredVoices: VoiceKey[], chosenVoices: VoiceKey[]): { career: Career; penalties: Activity[] } {
  const next: Partial<Record<VoiceKey, number>> = { ...(career.voiceNeglect ?? {}) };
  const penalties: Activity[] = [];
  for (const v of new Set(offeredVoices)) {
    if (chosenVoices.includes(v)) { next[v] = 0; continue; }
    next[v] = (next[v] ?? 0) + 1;
    if (next[v]! >= BALANCE.week.neglectWeeks) {
      next[v] = 0;
      penalties.push({
        id: `neglect_${v}`, voice: v, title: `${VOICE_LABEL[v]} мовчить`, line: '',
        effect: { quieter: [v], note: `${VOICE_LABEL[v]} мовчить: три тижні без жодної його справи.` },
      });
    }
  }
  return { career: { ...career, voiceNeglect: next }, penalties };
}

/** Атрибуты, которые кормят голос — те же, что в voices.ts. Его и Команда атрибутов не имеют:
 *  «гучніший» для них — кураж и трибуны, это делает само дело. */
export const VOICE_ATTRS: Record<VoiceKey, Attribute[]> = {
  vision: ['vision', 'positioning'], instinct: ['dribbling', 'first_touch'], body: ['pace', 'strength'],
  composure: ['composure'], ego: [], team: [],
};

export type WeekChoice = { activity: Activity; trainAttr?: Attribute };

/** Применить выбранные дела к карьере. Доверие и тренировки — сразу и навсегда, остальное —
 *  в nextMatch на один матч. Возвращает бирки для экрана: что изменилось, словами. */
export function applyWeek(career: Career, choices: WeekChoice[]): { career: Career; tags: string[] } {
  const next: Career = { ...career, training: { ...(career.training ?? {}) }, attrPoints: { ...career.attrPoints } };
  // Начинаем с того, что уже приготовлено к матчу (ответ в стрічці идёт раньше тижня, 19.09):
  // иначе неделя затирала бы его последствия. consumeStartPenalty очищает всё разом.
  const prev = career.nextMatch;
  const prep: NextMatchPrep = {
    attrBonus: { ...(prev?.attrBonus ?? {}) }, start: { ...(prev?.start ?? {}) }, notes: [...(prev?.notes ?? [])],
    ...(prev?.voiceStreak ? { voiceStreak: prev.voiceStreak } : {}), ...(prev?.voiceMute ? { voiceMute: prev.voiceMute } : {}),
    ...(prev?.healed ? { healed: true } : {}),
  };
  const tags: string[] = [];
  let flags: CarriedFlag[] = career.carriedFlags ?? [];
  const bump = (attr: Attribute, mods: number) => { prep.attrBonus![attr] = (prep.attrBonus![attr] ?? 0) + mods * POINT_VALUE; };

  for (const { activity, trainAttr } of choices) {
    const e = activity.effect;
    // Атрибутные голоса — ±1 к модификатору; Его и Команда атрибутов не имеют: гучніший —
    // матч начинается с их серии (Его не затихает при провалах, Команда зовёт при низком
    // доверии), тихіший — голос замовк на первые эпизоды.
    for (const v of e.louder ?? []) {
      if (v === 'ego' || v === 'team') prep.voiceStreak = { who: v, count: 2 };
      for (const a of VOICE_ATTRS[v]) bump(a, 1);
      tags.push(`${VOICE_LABEL[v]} гучніше`);
    }
    for (const v of e.quieter ?? []) {
      if (v === 'ego' || v === 'team') prep.voiceMute = { ...(prep.voiceMute ?? {}), [v]: BALANCE.week.muteEpisodes };
      for (const a of VOICE_ATTRS[v]) bump(a, -1);
      tags.push(`${VOICE_LABEL[v]} тихіше`);
    }
    if (e.stamina) { prep.start!.stamina = (prep.start!.stamina ?? 0) + e.stamina; tags.push(e.stamina > 0 ? 'сили ↑' : 'сили ↓'); }
    if (e.composure) { prep.start!.composure = (prep.start!.composure ?? 0) + e.composure; tags.push(e.composure > 0 ? 'спокій ↑' : 'спокій ↓'); }
    if (e.fanHype) { prep.start!.fanHype = (prep.start!.fanHype ?? 0) + e.fanHype; tags.push(e.fanHype > 0 ? 'трибуни ↑' : 'трибуни ↓'); }
    if (e.momentum) { prep.start!.momentum = (prep.start!.momentum ?? 0) + e.momentum; tags.push(e.momentum > 0 ? 'кураж ↑' : 'кураж ↓'); }
    if (e.coachTrust) { next.coachTrust = clampTrust(next.coachTrust + e.coachTrust); tags.push(e.coachTrust > 0 ? 'тренер ↑' : 'тренер ↓'); }
    if (e.heal) {
      prep.healed = true;
      flags = flags.filter((f) => f.flag !== 'knock');
      if (career.injuredMatches > 0 || (career.carriedFlags ?? []).some((f) => f.flag === 'knock')) tags.push('здоровий');
    }
    const attr = e.train === 'choice' ? trainAttr : e.train;
    if (attr) {
      const n = (next.training![attr] ?? 0) + 1;
      if (n >= BALANCE.week.trainToPoint) {
        next.training![attr] = 0;
        next.attrPoints[attr] = (next.attrPoints[attr] ?? 0) + 1;
        tags.push(`${ATTRIBUTE_LABEL[attr]} +1 назавжди`);
      } else {
        next.training![attr] = n;
        tags.push(`${ATTRIBUTE_LABEL[attr]}: ${n} з ${BALANCE.week.trainToPoint}`);
      }
    }
    if (e.removeFlags?.length) flags = flags.filter((f) => !e.removeFlags!.includes(f.flag));
    for (const f of e.flags ?? []) {
      const after = f.after ?? 0;
      const mark: Mark = { minute: 0, episodeId: activity.id, optionId: 'week', past: f.past, previousMatch: true, whenText: whenTextFor(after) };
      flags = [...flags.filter((x) => x.flag !== f.flag), { flag: f.flag, mark, ...(after > 0 ? { after } : {}) }];
      tags.push(after > 0 ? 'це ще відгукнеться' : 'відгукнеться на полі');
    }
    prep.notes!.push(e.note);
  }
  next.carriedFlags = flags;
  next.nextMatch = choices.length || prev ? prep : undefined;
  return { career: next, tags: [...new Set(tags)] };
}

/** «Когда» для реактивного эпизода от дела недели. */
export function whenTextFor(after: number): string {
  if (after <= 0) return 'ще минулого тижня';
  const words = ['', '', 'два', 'три', 'чотири', 'п’ять'];
  return `ще ${words[after + 1] ?? after + 1} тури тому`;
}

/** Неделя записывается всегда — и с выбором, и без, — чтобы после перезагрузки не искать её заново. */
export function recordWeek(
  career: Career, c: WeekContext, offered: Activity[], chosen: Activity[],
  extra: { outcomes?: string[]; scene?: { id: string; option: string } } = {},
): Career {
  return { ...career, weekLog: [...(career.weekLog ?? []), { season: c.season, round: c.round, chosen: chosen.map((a) => a.id), offered: offered.map((a) => a.id), ...extra }] };
}

/** Дело с выпавшим исходом — то, что реально применяется: эффект исхода вместо эффекта по умолчанию. */
export function withOutcome(activity: Activity, outcome: ActivityOutcome | null): Activity {
  return outcome ? { ...activity, effect: outcome.effect } : activity;
}

export function weekPending(career: Career, c: WeekContext): boolean {
  return !(career.weekLog ?? []).some((e) => e.season === c.season && e.round === c.round);
}

/** Сколько раз игрок читал уже виденную реплику — не сюда; здесь: сколько разных дел видел за сезон. */
export function distinctOffered(career: Career, season: number): number {
  return new Set((career.weekLog ?? []).filter((e) => e.season === season).flatMap((e) => e.offered ?? [])).size;
}

// ——— тиждень v3: дні → ісходи → сцена → підсумок —————————————————————————————

export type WeekOffer = { activity: Activity; outcome: ActivityOutcome | null };
export type WeekPick = { day: number; activityId: string; trainAttr?: Attribute; scene?: { id: string; option: string } };

/** Неделя целиком: дни с предложениями, у каждого предложения — уже выпавший исход. Исход
 *  считается заранее и тем же rng, что и предложения: перезагрузка не даёт перебросить вечер. */
export function planWeek(pool: Activity[], player: Player, c: WeekContext, career: Career, rng: Rng): WeekOffer[][] {
  return offerWeekDays(pool, c, career, rng).map((day) => day.map((activity) => ({ activity, outcome: resolveOutcome(activity, player, c, career, rng) })));
}

/** Закрыть неделю: выбранные дела с их исходами, сцена-продолжение и обида голосов — всё через
 *  applyWeek, чтобы бирки и nextMatch собирались одним способом; сцена идёт голосом подсказки,
 *  без подсказки — голосом дела, из которого выросла. */
export function finishWeek(career: Career, c: WeekContext, days: WeekOffer[][], picks: WeekPick[], scenes: WeekScene[]): { career: Career; tags: string[] } {
  const choices: WeekChoice[] = [];
  const chosen: Activity[] = [];
  const outcomes: string[] = [];
  let scene: { id: string; option: string } | undefined;
  for (const p of picks) {
    const offer = days[p.day]?.find((o) => o.activity.id === p.activityId);
    if (!offer) continue;
    chosen.push(offer.activity);
    if (offer.outcome) outcomes.push(`${offer.activity.id}:${offer.outcome.id}`);
    choices.push({ activity: withOutcome(offer.activity, offer.outcome), ...(p.trainAttr ? { trainAttr: p.trainAttr } : {}) });
    if (p.scene) {
      const sc = scenes.find((s) => s.id === p.scene!.id);
      const opt = sc?.options.find((o) => o.id === p.scene!.option);
      if (sc && opt) {
        scene = p.scene;
        choices.push({ activity: { id: `${sc.id}:${opt.id}`, voice: opt.insight?.who ?? offer.activity.voice, title: sc.id, line: '', effect: opt.effect } });
      }
    }
  }
  const offeredVoices = days.flat().map((o) => o.activity.voice);
  const { career: withNeglect, penalties } = neglectPenalties(career, offeredVoices, choices.map((x) => x.activity.voice));
  const { career: after, tags } = applyWeek(withNeglect, [...choices, ...penalties.map((activity) => ({ activity }))]);
  return { career: recordWeek(after, c, days.flat().map((o) => o.activity), chosen, { outcomes, ...(scene ? { scene } : {}) }), tags };
}

/** Варианты сцены, которые видит игрок: с подсказкой — только когда голос бачить. */
/** Сцены, которые карьера уже видела (weekLog.scene, все сезоны). */
export function seenScenes(career: Career): Set<string> {
  return new Set((career.weekLog ?? []).map((e) => e.scene?.id).filter((id): id is string => !!id));
}

/** Сцена-продолжение для исхода: одна на неделю и **без дословных повторов** — виденную в карьере
 *  сцену пропускаем (исход показывается без «що далі»), пока остаются невиденные. 20.09: замер на 300
 *  сезонах — 1,35 сцены за сезон, а `sc_kid_promise` выпадала в 55% сезонов; без памяти второй
 *  сезон начинался с той же лікарні. Когда все сцены пройдены — память сбрасывается. */
export function sceneFor(outcome: ActivityOutcome | null | undefined, scenes: WeekScene[], seen: Set<string>, sceneUsed: boolean): WeekScene | undefined {
  if (sceneUsed || !outcome?.followUp) return undefined;
  const scene = scenes.find((s) => s.id === outcome.followUp);
  if (!scene) return undefined;
  const allSeen = scenes.every((s) => seen.has(s.id));
  return !allSeen && seen.has(scene.id) ? undefined : scene;
}

export function sceneOptionsFor(scene: WeekScene, sees: (who: VoiceKey) => boolean): WeekSceneOption[] {
  return scene.options.filter((o) => !o.insight || sees(o.insight.who));
}
