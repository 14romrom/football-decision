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
import { ATTRIBUTE_LABEL, type Attribute, type Mark, type VoiceKey } from './types';
import { VOICE_LABEL } from './voices';

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
  effect: ActivityEffect;
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
  const lastChosen = (id: string) => Math.max(-Infinity, ...thisSeason.filter((e) => e.chosen.includes(id)).map((e) => e.round));
  const lastOffered = (id: string) => Math.max(-Infinity, ...thisSeason.filter((e) => e.offered.includes(id)).map((e) => e.round));
  const locked = coachLocksCity(c);
  const offers: Activity[] = [];
  for (const voice of VOICE_ORDER) {
    if (locked && !BASE_VOICES.includes(voice)) continue;
    const fitting = pool.filter((a) => {
      if (a.voice !== voice || !matchesActivity(a.when, c)) return false;
      if (a.once && thisSeason.some((e) => e.chosen.includes(a.id))) return false;
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
  const prep: NextMatchPrep = { attrBonus: {}, start: {}, notes: [] };
  const tags: string[] = [];
  let flags: CarriedFlag[] = career.carriedFlags ?? [];
  const bump = (attr: Attribute, mods: number) => { prep.attrBonus![attr] = (prep.attrBonus![attr] ?? 0) + mods * POINT_VALUE; };

  for (const { activity, trainAttr } of choices) {
    const e = activity.effect;
    for (const v of e.louder ?? []) { for (const a of VOICE_ATTRS[v]) bump(a, 1); tags.push(`${VOICE_LABEL[v]} гучніше`); }
    for (const v of e.quieter ?? []) { for (const a of VOICE_ATTRS[v]) bump(a, -1); tags.push(`${VOICE_LABEL[v]} тихіше`); }
    if (e.stamina) { prep.start!.stamina = (prep.start!.stamina ?? 0) + e.stamina; tags.push(e.stamina > 0 ? 'сили ↑' : 'сили ↓'); }
    if (e.composure) { prep.start!.composure = (prep.start!.composure ?? 0) + e.composure; tags.push(e.composure > 0 ? 'спокій ↑' : 'спокій ↓'); }
    if (e.fanHype) { prep.start!.fanHype = (prep.start!.fanHype ?? 0) + e.fanHype; tags.push(e.fanHype > 0 ? 'трибуни ↑' : 'трибуни ↓'); }
    if (e.momentum) { prep.start!.momentum = (prep.start!.momentum ?? 0) + e.momentum; tags.push(e.momentum > 0 ? 'кураж ↑' : 'кураж ↓'); }
    if (e.coachTrust) { next.coachTrust = clampTrust(next.coachTrust + e.coachTrust); tags.push(e.coachTrust > 0 ? 'тренер ↑' : 'тренер ↓'); }
    if (e.heal) { prep.healed = true; flags = flags.filter((f) => f.flag !== 'knock'); tags.push('здоровий'); }
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
  next.nextMatch = choices.length ? prep : undefined;
  return { career: next, tags: [...new Set(tags)] };
}

/** «Когда» для реактивного эпизода от дела недели. */
export function whenTextFor(after: number): string {
  if (after <= 0) return 'ще минулого тижня';
  const words = ['', '', 'два', 'три', 'чотири', 'п’ять'];
  return `ще ${words[after + 1] ?? after + 1} тури тому`;
}

/** Неделя записывается всегда — и с выбором, и без, — чтобы после перезагрузки не искать её заново. */
export function recordWeek(career: Career, c: WeekContext, offered: Activity[], chosen: Activity[]): Career {
  return { ...career, weekLog: [...(career.weekLog ?? []), { season: c.season, round: c.round, chosen: chosen.map((a) => a.id), offered: offered.map((a) => a.id) }] };
}

export function weekPending(career: Career, c: WeekContext): boolean {
  return !(career.weekLog ?? []).some((e) => e.season === c.season && e.round === c.round);
}

/** Сколько раз игрок читал уже виденную реплику — не сюда; здесь: сколько разных дел видел за сезон. */
export function distinctOffered(career: Career, season: number): number {
  return new Set((career.weekLog ?? []).filter((e) => e.season === season).flatMap((e) => e.offered)).size;
}
