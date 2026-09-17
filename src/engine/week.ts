// Тиждень між матчами (M5): одна сцена без броска — преса, роздягальня, тренер, партнер.
// Тестеры назвали прототип «игрой на 15 минут» из-за отсутствия ставки между матчами;
// разбор DeckBall (DESIGN.md, «Референсы») показал, что держит игрока именно этот слой:
// событие по условию, once/cooldown и следствие, которое всплывает через несколько туров.
// Здесь только правила: выбор сцены по состоянию сезона и карьеры, применение выбора.
// Контент — content/weeks.json, экран — ui/WeekScreen.tsx (тонкий, под замену новым UI).

import { clampTrust, type Career, type CarriedFlag } from './career';
import type { Season } from './season';
import type { Rng } from './rng';
import type { Mark, ResultBadge } from './types';
import { fillTrigger } from './match';

/** Условие сцены — по итогам сезона и карьеры, не по матчу; проверяется в момент показа. */
export type WeekWhen = {
  result?: 'win' | 'draw' | 'loss';
  /** Разгром: проиграли с разницей ≥ 3. */
  bigLoss?: boolean;
  /** Игрок забил или отдал в последнем матче. */
  scored?: boolean;
  /** Матчей подряд без гола/передачи игрока, не меньше. */
  droughtMin?: number;
  /** Поражений подряд, не меньше. */
  lossStreakMin?: number;
  lowTrust?: boolean;
  highTrust?: boolean;
  /** Треть таблицы: верх (1–2), середина, низ. */
  position?: 'top' | 'mid' | 'bottom';
  roundMin?: number;
  roundMax?: number;
  /** Флаги, принесённые из матча (career.carriedFlags, без отложенных). */
  flags?: string[];
  notFlags?: string[];
};

export type WeekApply = {
  coachTrust?: number;
  /** Сдвиг старта следующего матча. */
  stamina?: number;
  fanHype?: number;
  composure?: number;
  /** Флаг в следующий матч (after 0) или через несколько туров (after N). `past` —
   *  поступок для {trigger.past} реактивного эпизода: «назвав суддівство ганьбою в пресі». */
  flags?: { flag: string; after?: number; past: string }[];
  removeFlags?: string[];
  /** Строка в брифинг следующего матча — что игрок принёс с собой. */
  note?: string;
};

export type WeekOption = {
  id: string;
  label: string;
  /** Что происходит после выбора — 1–2 предложения, второе лицо. */
  result: string;
  apply?: WeekApply;
};

export type WeekScene = {
  id: string;
  when: WeekWhen;
  /** Не чаще раза за сезон. */
  once?: boolean;
  /** Не раньше чем через столько туров после прошлого показа. */
  cooldown?: number;
  weight?: number;
  title: string;
  text: string;
  options: WeekOption[];
};

export type WeekContext = {
  season: number; round: number;
  result: 'win' | 'draw' | 'loss'; bigLoss: boolean; scored: boolean;
  drought: number; lossStreak: number;
  coachTrust: number; position: number; clubs: number;
  flags: string[];
};

/** Что видит сцена недели: последний тур, серии, место, доверие и флаги из матча. */
export function weekContext(season: Season, career: Career, position: number): WeekContext | null {
  const rounds = season.rounds ?? [];
  const last = rounds[rounds.length - 1];
  if (!last) return null;
  const result = last.scoreUs > last.scoreThem ? 'win' : last.scoreUs < last.scoreThem ? 'loss' : 'draw';
  let drought = 0;
  for (let i = rounds.length - 1; i >= 0 && rounds[i].goals + rounds[i].assists === 0; i--) drought += 1;
  let lossStreak = 0;
  for (let i = rounds.length - 1; i >= 0 && rounds[i].scoreUs < rounds[i].scoreThem; i--) lossStreak += 1;
  return {
    season: season.number, round: season.round,
    result, bigLoss: last.scoreThem - last.scoreUs >= 3, scored: last.goals + last.assists > 0,
    drought, lossStreak,
    coachTrust: career.coachTrust, position, clubs: season.clubs.length,
    flags: (career.carriedFlags ?? []).filter((f) => !(f.after && f.after > 0)).map((f) => f.flag),
  };
}

const LOW_TRUST = 40;
const HIGH_TRUST = 65;

export function matchesWeek(w: WeekWhen, c: WeekContext): boolean {
  if (w.result && w.result !== c.result) return false;
  if (w.bigLoss !== undefined && w.bigLoss !== c.bigLoss) return false;
  if (w.scored !== undefined && w.scored !== c.scored) return false;
  if (w.droughtMin !== undefined && c.drought < w.droughtMin) return false;
  if (w.lossStreakMin !== undefined && c.lossStreak < w.lossStreakMin) return false;
  if (w.lowTrust !== undefined && w.lowTrust !== c.coachTrust < LOW_TRUST) return false;
  if (w.highTrust !== undefined && w.highTrust !== c.coachTrust >= HIGH_TRUST) return false;
  if (w.position) {
    const third = c.position <= 2 ? 'top' : c.position > c.clubs - 2 ? 'bottom' : 'mid';
    if (third !== w.position) return false;
  }
  if (w.roundMin !== undefined && c.round < w.roundMin) return false;
  if (w.roundMax !== undefined && c.round > w.roundMax) return false;
  if (w.flags && !w.flags.every((f) => c.flags.includes(f))) return false;
  if (w.notFlags && w.notFlags.some((f) => c.flags.includes(f))) return false;
  return true;
}

/** Текст сцены со следом решения: {trigger.past} / {trigger.when} — по первому флагу условия
 *  («{partner} пам’ятає, як ти {trigger.past} {trigger.when}»), как у реактивных эпизодов. */
export function weekSceneText(scene: WeekScene, career: Career): string {
  const flag = scene.when.flags?.[0];
  const mark = flag ? (career.carriedFlags ?? []).find((f) => f.flag === flag)?.mark : undefined;
  return mark ? fillTrigger(scene.text, mark) : scene.text;
}

/** Сцена этой недели: подходящие по условию, минус once/cooldown, самое конкретное условие
 *  побеждает (как у сетапов), среди равных — по весу. Нет подходящей — недели нет. */
export function pickWeekScene(scenes: WeekScene[], c: WeekContext, career: Career, rng: Rng): WeekScene | null {
  const log = career.weekLog ?? [];
  const fitting = scenes.filter((s) => {
    if (!matchesWeek(s.when, c)) return false;
    const shown = log.filter((e) => e.sceneId === s.id);
    if (s.once && shown.some((e) => e.season === c.season)) return false;
    if (s.cooldown) {
      const lastRound = Math.max(-Infinity, ...shown.filter((e) => e.season === c.season).map((e) => e.round));
      if (c.round - lastRound < s.cooldown) return false;
    }
    return true;
  });
  if (fitting.length === 0) return null;
  const best = Math.max(...fitting.map((s) => Object.keys(s.when).length));
  const top = fitting.filter((s) => Object.keys(s.when).length === best);
  const total = top.reduce((sum, s) => sum + (s.weight ?? 1), 0);
  let r = rng.next() * total;
  for (const s of top) {
    r -= s.weight ?? 1;
    if (r <= 0) return s;
  }
  return top[top.length - 1];
}

/** «Когда» для реактивного эпизода, который сработает через after матчей после этой недели. */
export function whenTextFor(after: number): string {
  if (after <= 0) return 'ще минулого тижня';
  const words = ['', '', 'два', 'три', 'чотири', 'п’ять'];
  const n = after + 1;
  return `ще ${words[n] ?? n} тури тому`;
}

/** Применить выбор недели к карьере: доверие сразу, старт следующего матча — отложенно,
 *  флаги — в carriedFlags с задержкой. Возвращает бирки того, что изменилось. */
export function applyWeekChoice(
  career: Career, scene: WeekScene, option: WeekOption, c: WeekContext,
): { career: Career; badges: ResultBadge[] } {
  const a = option.apply ?? {};
  const badges: ResultBadge[] = [];
  const next: Career = { ...career };

  if (a.coachTrust) {
    next.coachTrust = clampTrust(career.coachTrust + a.coachTrust);
    badges.push({ icon: '🧥', label: a.coachTrust > 0 ? 'тренер задоволений' : 'тренер незадоволений', tone: a.coachTrust > 0 ? 'good' : 'bad' });
  }
  if (a.stamina || a.fanHype || a.composure || a.note) {
    const prev = career.nextStart ?? {};
    next.nextStart = {
      stamina: (prev.stamina ?? 0) + (a.stamina ?? 0),
      fanHype: (prev.fanHype ?? 0) + (a.fanHype ?? 0),
      composure: (prev.composure ?? 0) + (a.composure ?? 0),
      note: [prev.note, a.note].filter(Boolean).join(' ') || undefined,
    };
    if (a.stamina) badges.push({ icon: '🔋', label: a.stamina > 0 ? 'сили на старті' : 'менше сил на старті', tone: a.stamina > 0 ? 'good' : 'bad' });
    if (a.fanHype) badges.push({ icon: '📣', label: a.fanHype > 0 ? 'трибуни за тебе' : 'трибуни холодніші', tone: a.fanHype > 0 ? 'good' : 'bad' });
    if (a.composure) badges.push({ icon: '🧊', label: a.composure > 0 ? 'спокійніший' : 'на нервах', tone: a.composure > 0 ? 'good' : 'bad' });
  }

  let flags: CarriedFlag[] = career.carriedFlags ?? [];
  if (a.removeFlags?.length) {
    flags = flags.filter((f) => !a.removeFlags!.includes(f.flag));
  }
  for (const f of a.flags ?? []) {
    const after = f.after ?? 0;
    const mark: Mark = { minute: 0, episodeId: scene.id, optionId: option.id, past: f.past, previousMatch: true, whenText: whenTextFor(after) };
    flags = [...flags.filter((x) => x.flag !== f.flag), { flag: f.flag, mark, ...(after > 0 ? { after } : {}) }];
    badges.push({ icon: '🔖', label: after > 0 ? 'це ще відгукнеться' : 'це відгукнеться в наступному матчі', tone: 'neutral' });
  }
  next.carriedFlags = flags;
  next.weekLog = [...(career.weekLog ?? []), { season: c.season, round: c.round, sceneId: scene.id, optionId: option.id }];
  return { career: next, badges };
}

/** Недели без сцены тоже записываются — чтобы после перезагрузки не искать её заново. */
export function skipWeek(career: Career, c: WeekContext): Career {
  return { ...career, weekLog: [...(career.weekLog ?? []), { season: c.season, round: c.round, sceneId: null }] };
}

/** Неделя после последнего сыгранного тура ещё не показана. */
export function weekPending(career: Career, c: WeekContext): boolean {
  return !(career.weekLog ?? []).some((e) => e.season === c.season && e.round === c.round);
}
