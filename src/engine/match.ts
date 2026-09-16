// Машина состояний матча: расписание эпизодов, лента между ними, применение
// исходов и сборка итога. React сюда не заглядывает — UI только вызывает функции.

import { BALANCE, MOMENTUM_BY_TIER } from './balance';
import { fillNames, type Roster } from './names';
import { pickFlavor, type FlavorRule } from './flavor';
import type { Rng } from './rng';
import type {
  ApplyEffect, Episode, EpisodeOption, MatchState, Player, Resolution, TimelineEvent, Tier,
} from './types';

export type MatchSession = {
  matchId: string;
  seed: number;
  player: Player;
  roster: Roster;
  state: MatchState;
  schedule: number[];
  /** Эпизод на каждый слот, подобранный заранее. См. planEpisodes. */
  plan: string[];
  usedEpisodeIds: string[];
  nextIndex: number;
  finished: boolean;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Доверие тренера двигается через общий множитель — см. BALANCE.systemic.trustDeltaScale. */
function addTrust(state: MatchState, delta: number) {
  state.coachTrust = clamp(state.coachTrust + delta * BALANCE.systemic.trustDeltaScale, 0, 100);
}

/** Подходит ли эпизод по времени. Флаги динамические и здесь не учитываются. */
function fitsMinute(e: Episode, minute: number): boolean {
  const r = e.requires;
  if (!r) return true;
  return (r.minMinute ?? 0) <= minute && (r.maxMinute ?? 999) >= minute;
}

/** Раскладка эпизодов по слотам с перебором и откатом.
 *  Жадный выбор на десяти эпизодах и десяти слотах загоняет себя в тупик:
 *  «концовочный» эпизод не подходит никуда, кроме последнего слота, и матч
 *  теряет момент. Перебор по самым узким слотам такого не допускает. */
function planEpisodes(schedule: number[], episodes: Episode[], rng: Rng): string[] {
  const slots = schedule
    .map((minute, index) => ({ index, candidates: episodes.filter((e) => fitsMinute(e, minute)) }))
    .sort((a, b) => a.candidates.length - b.candidates.length);

  const plan: (string | null)[] = schedule.map(() => null);
  const used = new Set<string>();

  const assign = (k: number): boolean => {
    if (k >= slots.length) return true;
    const pool = slots[k].candidates.filter((e) => !used.has(e.id));
    const rest = [...pool];
    const order: Episode[] = [];
    while (rest.length) {
      const picked = rng.weighted(rest, (e) => e.weight);
      order.push(picked);
      rest.splice(rest.indexOf(picked), 1);
    }
    for (const e of order) {
      used.add(e.id);
      plan[slots[k].index] = e.id;
      if (assign(k + 1)) return true;
      used.delete(e.id);
      plan[slots[k].index] = null;
    }
    return false;
  };
  assign(0);

  // Если раскладка не сошлась (контента меньше, чем слотов) — добиваем чем есть.
  return plan.map((id, i) => id ?? episodes.filter((e) => !plan.includes(e.id))[0]?.id ?? episodes[i % episodes.length].id);
}

export function createMatch(
  matchId: string, seed: number, player: Player, rng: Rng, episodes: Episode[], roster: Roster,
): MatchSession {
  const last = BALANCE.match.episodeMinutes.length - 1;
  const schedule = BALANCE.match.episodeMinutes.map((m, i) => {
    const j = BALANCE.match.minuteJitter;
    const minute = m + rng.int(-j, j);
    // последний эпизод обязан быть после 85-й — это требование ТЗ, а не случайность
    return i === last ? Math.max(86, minute) : minute;
  });

  const state: MatchState = {
    minute: 0,
    scoreUs: 0,
    scoreThem: 0,
    stamina: BALANCE.staminaStart,
    composureNow: BALANCE.composureStart,
    coachTrust: BALANCE.coachTrustStart,
    fanHype: BALANCE.fanHypeStart,
    momentum: 0,
    stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 },
    flags: [],
    log: [{
      minute: 0,
      kind: 'kickoff',
      text: '«' + roster.us.name.nom + '» — «' + roster.them.name.nom + '». Свисток. Трибуни встали.',
    }],
  };

  return {
    matchId, seed, player, roster, state, schedule,
    plan: planEpisodes(schedule, episodes, rng),
    usedEpisodeIds: [], nextIndex: 0, finished: false,
  };
}

// ——— лента между эпизодами ———————————————————————————————————————————

// Тексты ленты с плейсхолдерами имён — подставляются в момент показа по ростеру сессии.
const FILLER_NEUTRAL = [
  'М’яч гуляє між захисниками, ніхто не хоче ризикувати першим.',
  '{dm} накриває розігруючого, суперник відкочує назад.',
  'Довга передача на хід — {keeper} виходить і забирає.',
  'Пара фолів у центрі, гра рветься.',
  '{partner} пробує флангом, але його зустрічають удвох.',
  'Суперник перекочує м’яч упоперек поля, час іде.',
  '{striker} бореться за верховий м’яч і не дістає півкорпусу.',
  'Вкидання біля нашого штрафного, лава кричить про лінію.',
];
const FILLER_LEADING = [
  'Лава вимагає тримати м’яч, рахунок нас влаштовує.',
  '{cb} виносить без затій — зараз не до краси.',
  'Суперник пішов уперед усією лінією, ззаду порожньо в обох.',
];
const FILLER_TRAILING = [
  'Трибуни свистять: час щось робити.',
  'Тренер махає рукою вперед — вище, вище.',
  '{striker} б’є з-під захисника, повз.',
];
const FILLER_TIRED = [
  'Ти впираєшся руками в коліна, поки м’яч на тій половині.',
  'Ноги важкі, до найближчого суперника два кроки, яких немає.',
];

function fillerText(session: MatchSession, rng: Rng): string {
  const state = session.state;
  const pool = [...FILLER_NEUTRAL];
  if (state.scoreUs > state.scoreThem) pool.push(...FILLER_LEADING);
  if (state.scoreUs < state.scoreThem) pool.push(...FILLER_TRAILING);
  if (state.stamina < BALANCE.tiredBelow) pool.push(...FILLER_TIRED);
  return fillNames(rng.pick(pool), session.roster);
}

function scorer(roster: Roster, side: 'us' | 'them', rng: Rng): string {
  const team = roster[side];
  return team.players[rng.pick(team.scorers)].nom;
}

/** Счёт между эпизодами меняется по простой таблице, а не по симуляции поля. */
function rollFillerGoal(state: MatchState, rng: Rng): 'us' | 'them' | null {
  const m = BALANCE.match;
  const pUs = clamp(m.fillerGoalBase + state.momentum * m.fillerGoalMomentum, 0.01, 0.16);
  const pThem = clamp(m.fillerGoalBase - state.momentum * m.fillerGoalMomentum, 0.01, 0.16);
  const r = rng.next();
  if (r < pUs) return 'us';
  if (r < pUs + pThem) return 'them';
  return null;
}

function pushGoal(session: MatchSession, side: 'us' | 'them', minute: number, rng: Rng, text?: string) {
  const state = session.state;
  if (side === 'us') {
    state.scoreUs += 1;
    state.momentum = clamp(state.momentum + 1, -3, 3);
    state.fanHype = clamp(state.fanHype + 6, 0, 100);
    state.log.push({
      minute,
      kind: 'goalUs',
      text: text ?? (scorer(session.roster, 'us', rng) + ' проштовхує м’яч у сітку — гол! ' + state.scoreUs + ':' + state.scoreThem + '.'),
    });
  } else {
    state.scoreThem += 1;
    state.momentum = clamp(state.momentum - 1, -3, 3);
    state.composureNow = clamp(state.composureNow - 6, 0, 100);
    state.log.push({
      minute,
      kind: 'goalThem',
      text: text ?? (scorer(session.roster, 'them', rng) + ' тікає і б’є в дальній. ' + state.scoreUs + ':' + state.scoreThem + '.'),
    });
  }
}

function syncTired(state: MatchState) {
  const tired = state.stamina < BALANCE.tiredBelow;
  if (tired && !state.flags.includes('tired')) state.flags.push('tired');
  if (!tired) state.flags = state.flags.filter((f) => f !== 'tired');
}

function drainStamina(state: MatchState, minutes: number) {
  state.stamina = clamp(state.stamina - minutes * BALANCE.staminaDrainPerMinute, 0, 100);
  syncTired(state);
}

/** Прокручивает время до минуты `until`, наполняя ленту. Возвращает новые события. */
export function advanceTo(session: MatchSession, until: number, rng: Rng): TimelineEvent[] {
  const state = session.state;
  const from = state.minute;
  const before = state.log.length;
  if (until <= from) return [];

  if (from < 45 && until >= 45) {
    state.stamina = clamp(state.stamina + BALANCE.halftimeRecovery, 0, 100);
    syncTired(state);
    state.log.push({ minute: 45, kind: 'halftime', text: 'Перерва. ' + state.scoreUs + ':' + state.scoreThem + '. П’ятнадцять хвилин на лавці — ноги трохи відпустило.' });
  }

  const gap = until - from;
  const beats = gap >= 16 ? 3 : gap >= 8 ? 2 : 1;
  // Гол разыгрывается один раз на промежуток, а не на каждую строку ленты:
  // иначе темп подачи текста начал бы менять счёт матча.
  const goal = rollFillerGoal(state, rng);
  const goalBeat = goal ? rng.int(1, beats) : -1;
  for (let i = 1; i <= beats; i++) {
    const minute = Math.round(from + (gap * i) / (beats + 1));
    drainStamina(state, gap / (beats + 1));
    if (i === goalBeat) pushGoal(session, goal!, minute, rng);
    else state.log.push({ minute, kind: 'filler', text: fillerText(session, rng) });
  }
  drainStamina(state, gap / (beats + 1));
  state.minute = until;

  return state.log.slice(before);
}

// ——— выбор эпизода ————————————————————————————————————————————————

export function pickEpisode(session: MatchSession, episodes: Episode[], _rng: Rng): Episode | null {
  const i = session.nextIndex;
  const byId = (id: string) => episodes.find((e) => e.id === id) ?? null;
  const blocked = (e: Episode) => e.requires?.notFlags?.some((f) => session.state.flags.includes(f)) ?? false;

  const planned = byId(session.plan[i]);
  if (!planned) return null;
  if (!blocked(planned)) return planned;

  // Эпизод закрыт флагом (например, угловой при повреждении) — меняем его
  // местами с более поздним, который сейчас доступен и влезает по времени.
  for (let j = i + 1; j < session.plan.length; j++) {
    const other = byId(session.plan[j]);
    if (!other || blocked(other)) continue;
    if (!fitsMinute(other, session.schedule[i]) || !fitsMinute(planned, session.schedule[j])) continue;
    session.plan[j] = planned.id;
    session.plan[i] = other.id;
    return other;
  }
  return planned;   // менять не с чем — играем как есть, матч важнее чистоты флага
}

/** Следующий эпизод: сначала лента до его минуты, потом сам эпизод. */
export function nextEpisode(
  session: MatchSession, episodes: Episode[], rng: Rng,
): { episode: Episode; minute: number; events: TimelineEvent[] } | null {
  if (session.nextIndex >= session.schedule.length) return null;
  const minute = session.schedule[session.nextIndex];
  const events = advanceTo(session, minute, rng);
  const episode = pickEpisode(session, episodes, rng);
  if (!episode) return null;
  return { episode, minute, events };
}

// ——— применение исхода ————————————————————————————————————————————

/** Возвращает true, только если гол соперника пришёл из контратаки после этого решения:
 *  прямой пропущенный уже описан текстом исхода, дублировать его в пересказе незачем. */
function applyEffects(session: MatchSession, apply: ApplyEffect | undefined, minute: number, rng: Rng): boolean {
  if (!apply) return false;
  const state = session.state;
  let fromCounter = false;

  if (apply.stamina) state.stamina = clamp(state.stamina + apply.stamina, 0, 100);
  if (apply.coachTrust) addTrust(state, apply.coachTrust);
  if (apply.fanHype) state.fanHype = clamp(state.fanHype + apply.fanHype, 0, 100);
  if (apply.composure) state.composureNow = clamp(state.composureNow + apply.composure, 0, 100);
  if (apply.momentum) state.momentum = clamp(state.momentum + apply.momentum, -3, 3);

  if (apply.losses) state.stats.losses += apply.losses;
  if (apply.keyPass) state.stats.keyPasses += 1;
  if (apply.duelWon) state.stats.duelsWon += 1;
  if (apply.foul) state.stats.fouls += 1;

  if (apply.goal) { state.stats.goals += 1; pushGoal(session, 'us', minute, rng, 'Гол! ' + (state.scoreUs + 1) + ':' + state.scoreThem + '.'); }
  if (apply.assist) { state.stats.assists += 1; pushGoal(session, 'us', minute, rng); }
  if (apply.teamGoal) pushGoal(session, 'us', minute, rng);

  if (apply.concede) pushGoal(session, 'them', minute, rng);
  if (apply.counterAttack && !apply.concede && rng.chance(BALANCE.counterAttackConcede)) {
    pushGoal(session, 'them', minute + 1, rng,
      'Контратаку доводять до удару — ' + scorer(session.roster, 'them', rng) + ' не промахується. '
      + state.scoreUs + ':' + (state.scoreThem + 1) + '.');
    fromCounter = true;
  }

  if (apply.addFlags) for (const f of apply.addFlags) if (!state.flags.includes(f)) state.flags.push(f);
  if (apply.removeFlags) state.flags = state.flags.filter((f) => !apply.removeFlags!.includes(f));

  return fromCounter;
}

/** Полная цена варианта по силам: базовая плюс надбавка за физику. */
export function optionCost(option: EpisodeOption): number {
  const physical = option.attribute === 'pace' || option.attribute === 'strength';
  return option.staminaCost + (physical ? BALANCE.physicalExtraCost : 0);
}

export function applyChoice(
  session: MatchSession,
  episode: Episode,
  option: EpisodeOption,
  res: Resolution,
  rng: Rng,
  flavorRules: FlavorRule[] = [],
): { events: TimelineEvent[]; conceded: boolean } {
  const state = session.state;
  const minute = session.schedule[session.nextIndex];
  const before = state.log.length;
  const outcome = option.outcomes[res.tier];

  state.minute = minute;
  state.stamina = clamp(state.stamina - optionCost(option), 0, 100);
  state.momentum = clamp(state.momentum + MOMENTUM_BY_TIER[res.tier], -3, 3);

  // Трибуны реагируют на смелость сами по себе, до того как ясен результат.
  state.fanHype = clamp(state.fanHype + BALANCE.systemic.boldnessHype[res.position], 0, 100);

  // Провалившееся эгоистичное решение стоит доверия сверх того, что записано в контенте.
  if (res.tier === 'fail' || res.tier === 'badFail') {
    const selfish = option.goals.personal - option.goals.team;
    if (selfish > 0) {
      addTrust(state, -selfish * BALANCE.systemic.selfishFailTrustPenalty);
    }
  }

  const conceded = applyEffects(session, outcome.apply, minute, rng);   // true только для контратаки
  syncTired(state);

  state.log.push({
    minute,
    kind: 'episode',
    text: outcome.text,
    episodeId: episode.id,
    optionId: option.id,
    optionLabel: option.label,
    past: option.past,
    recap: outcome.recap,
    tier: res.tier,
    effect: res.effect,
    causedConcede: conceded,
    flavor: pickFlavor(flavorRules, state, res.tier, rng),
  });

  session.usedEpisodeIds.push(episode.id);
  session.nextIndex += 1;

  return { events: state.log.slice(before), conceded };
}

// ——— финал ————————————————————————————————————————————————————————

export type MatchSummary = {
  scoreUs: number;
  scoreThem: number;
  stats: MatchState['stats'];
  staminaLeft: number;
  coachRating: number;
  fanRating: number;
  recap: string[];
  points: number;   // 3/1/0 — нужны балансному прогону, игроку не показываются
};

const rate = (value: number) => Math.round(clamp(value, 1, 10) * 10) / 10;

export function computeRatings(state: MatchState): { coachRating: number; fanRating: number } {
  const r = BALANCE.rating;
  const st = state.stats;
  const coach = r.coach.base + (state.coachTrust / 100) * r.coach.trustWeight
    + st.goals * r.coach.goal + st.assists * r.coach.assist + st.keyPasses * r.coach.keyPass
    + st.duelsWon * r.coach.duel + st.losses * r.coach.loss + st.fouls * r.coach.foul;
  const fan = r.fan.base + (state.fanHype / 100) * r.fan.hypeWeight
    + st.goals * r.fan.goal + st.assists * r.fan.assist + st.duelsWon * r.fan.duel
    + st.losses * r.fan.loss;
  return { coachRating: rate(coach), fanRating: rate(fan) };
}

export function finishMatch(session: MatchSession, rng: Rng): { events: TimelineEvent[]; summary: MatchSummary } {
  const state = session.state;
  const before = state.log.length;
  advanceTo(session, 90, rng);
  state.log.push({
    minute: 90,
    kind: 'fulltime',
    text: 'Фінальний свисток. «' + session.roster.us.name.nom + '» — «' + session.roster.them.name.nom + '» '
      + state.scoreUs + ':' + state.scoreThem + '.',
  });
  session.finished = true;

  const { coachRating, fanRating } = computeRatings(state);
  const points = state.scoreUs > state.scoreThem ? 3 : state.scoreUs === state.scoreThem ? 1 : 0;

  const summary: MatchSummary = {
    scoreUs: state.scoreUs,
    scoreThem: state.scoreThem,
    stats: { ...state.stats },
    staminaLeft: Math.round(state.stamina),
    coachRating,
    fanRating,
    recap: buildRecap(state, coachRating, fanRating),
    points,
  };
  return { events: state.log.slice(before), summary };
}

// ——— пересказ ————————————————————————————————————————————————————
// Главный проверяемый артефакт: если это читается как история, механика работает.

const TIER_WEIGHT: Record<Tier, number> = { clean: 3, badFail: 3, cost: 2, fail: 1 };

function importance(e: TimelineEvent): number {
  let w = TIER_WEIGHT[e.tier ?? 'fail'];
  if (e.effect === 'great') w += 1;
  if (e.effect === 'limited') w -= 0.5;
  if (e.causedConcede) w += 2;
  if (e.minute >= 85) w += 1;      // концовка запоминается независимо от исхода
  return w;
}

function connective(index: number, minute: number, prevMinute: number): string {
  if (index === 0) return 'На ' + minute + '-й';
  if (minute >= 85) return 'На ' + minute + '-й, уже в кінцівці,';
  if (minute - prevMinute <= 8) return 'Майже одразу, на ' + minute + '-й,';
  if (index % 2 === 0) return 'Ближче до ' + minute + '-ї';
  return 'Потім, на ' + minute + '-й,';
}

export function buildRecap(state: MatchState, coachRating: number, fanRating: number): string[] {
  const episodes = state.log.filter((e) => e.kind === 'episode' && e.recap);
  const ranked = [...episodes].sort((a, b) => importance(b) - importance(a) || a.minute - b.minute);
  const chosen = ranked.slice(0, 5).sort((a, b) => a.minute - b.minute);

  const lines: string[] = [];
  let prev = 0;
  chosen.forEach((e, i) => {
    let line = connective(i, e.minute, prev) + ' ' + e.past + ' — ' + e.recap;
    if (e.causedConcede) line += ' За хвилину гості цим скористалися.';
    lines.push(line);
    prev = e.minute;
  });

  const verdict = state.scoreUs > state.scoreThem ? 'Перемога' : state.scoreUs === state.scoreThem ? 'Нічия' : 'Поразка';
  lines.push(
    verdict + ', ' + state.scoreUs + ':' + state.scoreThem
    + '. Тренер поставив ' + coachRating.toFixed(1) + ', трибуни — ' + fanRating.toFixed(1) + '.',
  );
  return lines;
}
