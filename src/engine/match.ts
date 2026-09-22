// Машина состояний матча: расписание эпизодов, лента между ними, применение
// исходов и сборка итога. React сюда не заглядывает — UI только вызывает функции.

import { BALANCE, COMPOSURE_CALM, MOMENTUM_BY_BOLDNESS, MOMENTUM_BY_TIER, MOMENTUM_SPEND } from './balance';
import { attrMod } from './context';
import { fillNames, fillNamesDeep, opponentTraits, type Roster } from './names';
import { pickFeedLine, type FeedKind } from './feed';
import { hypeScale, neutralConditions, startResources, type MatchConditions } from './conditions';
import { dominantVoice, initVoiceTrace, recordVoice, VOICE_LABEL, voiceSeesNow } from './voices';
import { matchesSituation, pickFlavorLine, pickFresh, scoreState, type FlavorRule } from './flavor';
import { pickOutcome, resultBadges } from './resolve';
import type { Rng } from './rng';
import type {
  ApplyEffect, Episode, EpisodeMemory, EpisodeOption, FlagRule, Mark, MatchState, Player, Resolution,
  TimelineEvent, Tier, Voice, VoiceKey,
} from './types';

export type MatchSession = {
  matchId: string;
  seed: number;
  player: Player;
  roster: Roster;
  conditions: MatchConditions;
  /** Эпизоды с подставленными именами этого соперника. */
  episodes: Episode[];
  /** Флаги-последствия: какие строки модификаторов дают. */
  flagRules: FlagRule[];
  /** Сколько реактивных эпизодов уже всплыло. */
  reactiveUsed: number;
  /** Память сезона (id → возраст в матчах) — для реактивных эпизодов, которые всплывают
   *  по флагу, а не из плана: без неё «долг партнёра» выпадал три матча подряд. */
  memory: EpisodeMemory;
  /** Цепочка в текущем слоте: следующее звено, число звеньев, сколько цепочек уже было. */
  pendingFollowUp: string | null;
  chainLinks: number;
  chainsUsed: number;
  /** След предыдущего звена — для {trigger.past} в тексте следующего. */
  chainMark: { minute: number; past: string } | null;
  state: MatchState;
  schedule: number[];
  /** Эпизод на каждый слот, подобранный заранее. См. planEpisodes. */
  plan: string[];
  usedEpisodeIds: string[];
  nextIndex: number;
  finished: boolean;
  /** Реплики второго голоса, уже прочитанные в этом матче — flavor.ts не повторяет их, пока есть свежие. */
  flavorSeen: Set<string>;
  /** Сетапи (вступи сцен), прочитані в цьому й останніх матчах: серед підхожих варіантів береться невиданий (21.09). */
  setupSeen: Set<string>;
  setupSeenNow: Set<string>;
  /** Строки ленты, прочитанные в этом и прошлых матчах (feed.ts) — свежие в приоритете. */
  feedSeen: Set<string>;
  /** Прочитанное только в этом матче — вторая ступень свежести (flavor.ts:pickFresh). */
  feedSeenNow: Set<string>;
  flavorSeenNow: Set<string>;
  injuriesSeason?: number;
  /** На лаві до bench.entryMinute: сили не витрачаються, стоїть флаг on_bench; на виході — свіжі ноги і рядок «виходиш». */
  onBench?: boolean;
  /** Матч почато з лави: `onBench` гасне, щойно движок дійшов до виходу, а стрічка ще дочитує перший тайм —
   *  екран рахує «сидить/вийшов» від показаної хвилини, не від стану движка (плейтест 21.09, Б-3). */
  fromBench?: boolean;
  /** Перший матч кар’єри (M12): чотири фіксовані сцени-туторіал замість плану, підказка оповідача на кожну
   *  (епізод → рядок), реактивні сцени не спливають — кожна сцена вводить одну річ. */
  tutorial?: Tutorial;
};

export type Tutorial = { plan: string[]; hints: Record<string, TutorialHint> };
/** Підказка-прожектор: яку деталь висвітлити (ui/Spotlight.tsx) і що сказати. */
export type TutorialHint = { target: 'choices' | 'formula' | 'voices' | 'verdict'; title: string; text: string };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Доверие тренера двигается через общий множитель — см. BALANCE.systemic.trustDeltaScale. */
function addTrust(state: MatchState, delta: number) {
  state.coachTrust = clamp(state.coachTrust + delta * BALANCE.systemic.trustDeltaScale, 0, 100);
}

const isReactive = (e: Episode) => (e.requires?.flags?.length ?? 0) > 0;

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
/** Множитель веса по возрасту в памяти: 1 матч назад — floor, дальше растёт по кривой
 *  до 1 на горизонте. Возраст ≤ 0 или отсутствие в памяти — свежий эпизод. */
export function memoryWeight(age: number | undefined): number {
  const { recent, recentFloor, horizon, floor, curve } = BALANCE.match.memory;
  if (age === undefined || age <= 0) return 1;
  if (age <= recent) return recentFloor;
  if (age > horizon) return 1;
  return floor + (1 - floor) * Math.pow((age - recent - 1) / (horizon - recent - 1), curve);
}

/** Список id — старая форма памяти «всё это было в прошлом матче»; для тестов и прогона. */
function toMemory(recent: string[] | EpisodeMemory): EpisodeMemory {
  if (!Array.isArray(recent)) return recent;
  const memory: EpisodeMemory = {};
  for (const id of recent) memory[id] = 1;
  return memory;
}

/** Возраст семьи в памяти: самый свежий из эпизодов этой семьи. */
function familyAges(memory: EpisodeMemory, episodes: Episode[]): Record<string, number> {
  const ages: Record<string, number> = {};
  for (const e of episodes) {
    const age = memory[e.id];
    if (!e.family || age === undefined) continue;
    ages[e.family] = Math.min(ages[e.family] ?? age, age);
  }
  return ages;
}

function planEpisodes(schedule: number[], episodes: Episode[], rng: Rng, recent: string[] | EpisodeMemory = []): string[] {
  const m = BALANCE.match;
  const memory = toMemory(recent);
  const families = familyAges(memory, episodes);
  // Память на сезон: сыгранное недавно почти не выпадает, пока есть свежее, и медленно возвращается.
  // Семья давит слабее: пенальті вчора — сегодня другой пенальті возможен, но реже.
  const weightOf = (e: Episode) => e.weight * memoryWeight(memory[e.id])
    * (e.family ? m.familyFloor + (1 - m.familyFloor) * memoryWeight(families[e.family]) : 1);

  // Квота обороны: заранее выбираем слоты, в которых будет только защитный эпизод.
  // Плейтест показал, что без квоты матч — сплошные атаки и переходы.
  const defenseSlots = new Set<number>();
  const order = schedule.map((_, i) => i).sort(() => rng.next() - 0.5);
  for (const i of order) {
    if (defenseSlots.size >= m.minDefense) break;
    if (episodes.some((e) => e.phase === 'defense' && fitsMinute(e, schedule[i]))) defenseSlots.add(i);
  }
  // Квота атаки — симметрично: слоты, где будет только атакующий эпизод (BALANCE.match.minAttack).
  const attackSlots = new Set<number>();
  for (const i of order) {
    if (attackSlots.size >= m.minAttack) break;
    if (defenseSlots.has(i)) continue;
    if (episodes.some((e) => e.phase === 'attack' && !e.followUpOnly && fitsMinute(e, schedule[i]))) attackSlots.add(i);
  }
  const phaseOk = (e: Episode, index: number) =>
    defenseSlots.has(index) ? e.phase === 'defense' : attackSlots.has(index) ? e.phase === 'attack' : true;

  // Реактивные эпизоды заранее не планируются — они всплывают по флагам (см. pickEpisode).
  const slots = schedule
    .map((minute, index) => ({
      index,
      candidates: episodes.filter((e) => !isReactive(e) && !e.followUpOnly && fitsMinute(e, minute) && phaseOk(e, index)),
    }))
    .sort((a, b) => a.candidates.length - b.candidates.length);

  const plan: (string | null)[] = schedule.map(() => null);
  const used = new Set<string>();

  const assign = (k: number): boolean => {
    if (k >= slots.length) return true;
    const pool = slots[k].candidates.filter((e) => !used.has(e.id));
    const rest = [...pool];
    const order: Episode[] = [];
    while (rest.length) {
      const picked = rng.weighted(rest, weightOf);
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

/** Перенос из карьеры (M2): доверие тренера продолжается, а не сбрасывается на старте
 *  каждого матча, и травма/карточка прошлого матча начинают следующий с недостачей.
 *  См. engine/career.ts:consumeStartPenalty — там же и обоснование чисел. */
export type Carryover = {
  coachTrust?: number; staminaPenalty?: number; coachTrustPenalty?: number;
  /** Флаги-последствия из прошлого матча (career.ts:carriedFlags) — партнёр помнит пас,
   *  тренер — фланг. Реактивный эпизод скажет «ще минулого матчу», см. fillTrigger. */
  flags?: { flag: string; mark: Mark; opponentKey?: string }[];
  /** Реплики второго голоса из последних матчей (telemetry/history.ts:recentFlavor) —
   *  считаются уже прочитанными, чтобы сезон не повторял одни и те же строки. */
  flavorSeen?: string[];
  setupSeen?: string[];
  /** То же для строк ленты (telemetry/history.ts:recentFeed). */
  feedSeen?: string[];
  /** Канвові епізоди, які не можна лишати на вагу (M18.0): id ставиться в останній підхожий слот плану.
   *  Так гарантуються «тебе міняють на Марена» і «агент на трибуні» — за прохождение тестера вони не випали. */
  forceEpisodes?: string[];
  /** Сдвиг стартовых ресурсов от недели між матчами (career.ts:NextMatchPrep.start). */
  startDelta?: { stamina?: number; composure?: number; fanHype?: number; momentum?: number };
  /** Неделя сделала Его/Команду гучнішими: матч начинается с их серии (voices.ts:listenedTwice). */
  voiceStreak?: { who: VoiceKey; count: number };
  /** …или тихішими: голос замовк на N эпизодов. */
  voiceMute?: Partial<Record<VoiceKey, number>>;
  /** Травм уже было в этом сезоне: при лимите «пошкодження» в исходе становится мікротравмою. */
  injuriesSeason?: number;
  /** Настрій трибун з минулого матчу (career.fanHype) — замість старту 45; поле додає своє. */
  fanHype?: number;
  /** Матч з лави (career.benched): перший тайм команда грає без тебе, епізоди — після bench.entryMinute. */
  fromBench?: boolean;
  /** Стан арки персонажа (career.ts:arcStage) — у state.arc для when.arcMin/arcMax. */
  arc?: number;
  /** Перший матч кар’єри — фіксований план і підказки (content/firstmatch.json). Довжина плану має
   *  збігатися з кількістю слотів (з лави — чотири), інакше план ігнорується. */
  tutorial?: Tutorial;
};

export function createMatch(
  matchId: string, seed: number, player: Player, rng: Rng, rawEpisodes: Episode[], roster: Roster,
  conditions: MatchConditions = neutralConditions(),
  recentEpisodeIds: string[] | EpisodeMemory = [],
  flagRules: FlagRule[] = [],
  carryover: Carryover = {},
): MatchSession {
  // Ліга (M17): епізоди «тільки вища ліга» в другій не існують — інакше сим і тести другої ліги їх би бачили.
  const league = conditions.league ?? 'second';
  const episodes = fillNamesDeep(rawEpisodes.filter((e) => !e.requires?.league || e.requires.league === league), roster);
  const rules = fillNamesDeep(flagRules, roster);
  const start = startResources(conditions);
  // Флаги про конкретного соперника (keeper_read) доживают только до матча с тем же клубом.
  const carried = (carryover.flags ?? []).filter((f) => !f.opponentKey || f.opponentKey === conditions.opponentKey);
  // Чтение воротаря до первого удара: сильное бачення поля или аналитик на брифинге.
  const visionReads = attrMod(player.attrs.vision) >= BALANCE.keeperRead.visionMod;
  const readsKeeper = !!roster.them.keeper && (visionReads || !!conditions.keeperTip)
    && !carried.some((f) => f.flag === 'keeper_read');
  const keeperReadPast = conditions.keeperTip ? 'вислухав аналітика про воротаря' : 'прочитав воротаря ще на розминці';
  const last = BALANCE.match.episodeMinutes.length - 1;
  const fieldSchedule = BALANCE.match.episodeMinutes.map((m, i) => {
    const j = BALANCE.match.minuteJitter;
    const minute = m + rng.int(-j, j);
    // последний эпизод обязан быть после 85-й — это требование ТЗ, а не случайность
    return i === last ? Math.max(86, minute) : minute;
    // З лави — лише слоти після виходу: чотири рішення замість дев'яти, і кожне на вагу золота.
  }).filter((minute) => !carryover.fromBench || minute >= BALANCE.bench.entryMinute);
  // З лави перед виходом — сцена «розминайся» (bench.callEpisode) на bench.callMinute: слот поза планувальником.
  const benchCall = carryover.fromBench && episodes.some((e) => e.id === BALANCE.bench.callEpisode) ? [BALANCE.bench.callMinute] : [];
  const schedule = [...benchCall, ...fieldSchedule];

  const state: MatchState = {
    minute: 0,
    scoreUs: 0,
    scoreThem: 0,
    stamina: clamp(start.stamina - (carryover.staminaPenalty ?? 0) + (carryover.startDelta?.stamina ?? 0), 0, 100),
    composureNow: clamp(start.composure + (carryover.startDelta?.composure ?? 0), 0, 100),
    ...(carryover.arc ? { arc: carryover.arc } : {}),
    coachTrust: clamp((carryover.coachTrust ?? BALANCE.coachTrustStart) - (carryover.coachTrustPenalty ?? 0), 0, 100),
    // Трибуни пам'ятають: база — настрій з минулого матчу, поле (дім/виїзд) додає своє поверх.
    fanHype: clamp(start.fanHype - BALANCE.fanHypeStart + (carryover.fanHype ?? BALANCE.fanHypeStart) + (carryover.startDelta?.fanHype ?? 0), 0, 100),
    momentum: clamp(start.momentum + (carryover.startDelta?.momentum ?? 0), -3, 3),
    stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 },
    // Характеристики соперника — флаги на матч: правила в flags.json (them_dribbler и т.п.),
    // варианты сетапа через when.flags. Механизм тот же, что у последствий решений.
    // Без дублей: флаг недели и флаг матча с одним id (partner_annoyed) — один флаг, одна поправка.
    flags: [...new Set([
      ...(benchCall.length ? ['on_bench'] : []),
      ...carried.map((f) => f.flag),
      ...opponentTraits(roster.them).map((t) => 'them_' + t),
      ...(roster.them.keeper ? ['keeper_' + roster.them.keeper.trait] : []),
      ...(readsKeeper ? ['keeper_read'] : []),
    ])],
    marks: {
      ...Object.fromEntries(carried.map((f) => [f.flag, { ...f.mark, previousMatch: true }])),
      ...(readsKeeper ? { keeper_read: { minute: 0, episodeId: 'briefing', optionId: 'read', past: keeperReadPast } } : {}),
    },
    voices: {
      ...initVoiceTrace(),
      ...(carryover.voiceStreak ? { streak: { ...carryover.voiceStreak } } : {}),
      ...(carryover.voiceMute ? { muted: { ...carryover.voiceMute } } : {}),
    },
    log: [],
  };

  const session: MatchSession = {
    matchId, seed, player, roster, conditions, episodes, flagRules: rules, reactiveUsed: 0, state, schedule,
    memory: toMemory(recentEpisodeIds),
    pendingFollowUp: null, chainLinks: 0, chainsUsed: 0, chainMark: null,
    plan: carryover.tutorial && carryover.tutorial.plan.length === schedule.length && carryover.tutorial.plan.every((id) => episodes.some((e) => e.id === id))
      ? [...carryover.tutorial.plan]
      : [...(benchCall.length ? [BALANCE.bench.callEpisode] : []), ...planEpisodes(fieldSchedule, episodes, rng, recentEpisodeIds)],
    ...(benchCall.length ? { onBench: true, fromBench: true } : {}),
    ...(carryover.tutorial ? { tutorial: carryover.tutorial } : {}),
    usedEpisodeIds: [], nextIndex: 0, finished: false, flavorSeen: new Set(carryover.flavorSeen ?? []),
    feedSeen: new Set(carryover.feedSeen ?? []), feedSeenNow: new Set(), flavorSeenNow: new Set(),
    setupSeen: new Set(carryover.setupSeen ?? []), setupSeenNow: new Set(),
    injuriesSeason: carryover.injuriesSeason,
  };
  state.log.push({
    minute: 0,
    kind: 'kickoff',
    text: '«' + roster.us.name.nom + '» — «' + roster.them.name.nom + '». ' + feedLine(session, 'kickoff', rng),
  });
  // Канвові епізоди (M18.0): ставимо в останній слот, чия хвилина підходить під requires, — вони не мусять
  // вигравати у ваги в планувальника. Якщо епізоду немає в пулі цієї ліги, просто пропускаємо.
  for (const id of carryover.forceEpisodes ?? []) {
    const ep = episodes.find((e) => e.id === id);
    if (!ep || session.plan.includes(id)) continue;
    const off = session.plan.length - fieldSchedule.length;   // перший слот — «розминайся» з лави, поля він не займає
    const slot = fieldSchedule.map((m, i) => ({ m, i })).reverse().find(({ m }) => fitsMinute(ep, m));
    if (slot) session.plan[slot.i + off] = id;
  }
  if (carryover.fromBench) benchWarmup(session, rng);
  // Флаги про партнера з тижня (whenText) — теж привід; ті, що приїхали з минулого матчу, вже пораховані там.
  for (const f of carried) if (f.mark.whenText) countPeople(state, f.flag);
  return session;
}

/** Перший тайм з лави: команда грає без тебе — лента й голи ленти по чвертях, як у звичайних
 *  проміжках, але без витрати сил і без мікротравм (ти сидиш). Далі — звичайна лента до сцени
 *  «розминайся» (якщо вона є в пулі) і до виходу; на виході (benchEnter) — свіжі ноги і рядок «виходиш».
 *  Без сцени в пулі — як раніше: одразу до entryMinute. */
function benchWarmup(session: MatchSession, rng: Rng) {
  const state = session.state;
  const entry = BALANCE.bench.entryMinute;
  const stops = session.onBench ? [15, 30, 45] : [15, 30, 45, entry];
  for (const until of stops) {
    const from = state.minute;
    const goal = rollFillerGoal(session, rng);
    const minute = rng.int(from + 2, until - 2);
    if (goal) pushGoal(session, goal, minute, rng);
    else state.log.push({ minute, kind: 'filler', text: feedLine(session, 'filler', rng) });
    if (until === 45) state.log.push({ minute: 45, kind: 'halftime', text: feedLine(session, 'halftime', rng, { score: state.scoreUs + ':' + state.scoreThem }) });
    state.minute = until;
  }
  if (!session.onBench) benchEnter(session, rng);
}

/** Вихід із лави: свіжі ноги, флаг on_bench знято, рядок «виходиш» у стрічці. */
function benchEnter(session: MatchSession, rng: Rng) {
  const state = session.state;
  state.stamina = clamp(state.stamina + BALANCE.bench.staminaBonus, 0, 100);
  syncTired(state);
  state.flags = state.flags.filter((f) => f !== 'on_bench');
  session.onBench = false;
  state.log.push({ minute: BALANCE.bench.entryMinute, kind: 'filler', text: feedLine(session, 'benchIn', rng) });
}

/** Партнер пам’ятає (M11): кожен привід довіряти чи образитися — у лічильник матчу, далі в кар’єру. */
function countPeople(state: MatchState, flag: string) {
  if (flag !== 'partner_trusts' && flag !== 'partner_annoyed') return;
  state.people = state.people ?? { partner: 0 };
  state.people.partner += flag === 'partner_trusts' ? 1 : -1;
}

// ——— лента между эпизодами ———————————————————————————————————————————

/** Строка ленты из feed.json: подставленные имена, отмечена как прочитанная. Пустой пул —
 *  ошибка контента (у каждого вида есть безусловное правило, тест это проверяет). */
function feedLine(session: MatchSession, kind: FeedKind, rng: Rng, extra: Record<string, string> = {}): string {
  const raw = pickFeedLine(kind, session.state, session.conditions, rng, session.feedSeen, undefined, session.feedSeenNow);
  if (!raw) throw new Error(`в feed.json нет строк вида ${kind}`);
  session.feedSeen.add(raw);
  session.feedSeenNow.add(raw);
  return fillNames(raw, session.roster, extra);
}

function scorer(roster: Roster, side: 'us' | 'them', rng: Rng): string {
  const team = roster[side];
  return team.players[rng.pick(team.scorers)].nom;
}

/** Конкретный игрок по ключу ростера (apply.scorer) — когда текст исхода уже назвал
 *  автора гола, лента должна называть того же, а не случайное имя из scorers.
 *  Неизвестный ключ — содержательная ошибка контента, а не тихий откат на случайное имя. */
function namedScorer(roster: Roster, side: 'us' | 'them', key: string): string {
  const player = roster[side].players[key];
  if (!player) throw new Error(`apply.scorer «${key}» не найден в ростере ${side}`);
  return player.nom;
}

/** Счёт между эпизодами меняется по простой таблице, а не по симуляции поля. */
function rollFillerGoal(session: MatchSession, rng: Rng): 'us' | 'them' | null {
  const m = BALANCE.match;
  const state = session.state;
  // Сильный соперник чаще забивает сам, слабый — чаще пропускает от партнёров.
  const edge = BALANCE.conditions.strongFillerGoal;
  const s = session.conditions.strength;
  // Меншість після червоної: команда дограє вдесятьох, і стрічка це знає.
  const short = state.flags.includes('sent_off');
  const pUs = clamp(m.fillerGoalUs + state.momentum * m.fillerGoalMomentum + (s === 'weak' ? edge : 0) + (short ? m.shorthandedUs : 0), 0.01, 0.2);
  const pThem = clamp(m.fillerGoalThem - state.momentum * m.fillerGoalMomentum + (s === 'strong' ? edge : s === 'weak' ? -edge : 0) + (short ? m.shorthandedThem : 0), 0.01, 0.2);
  const r = rng.next();
  if (r < pUs) return 'us';
  if (r < pUs + pThem) return 'them';
  return null;
}

/** Чи станеться мікротравма на цьому проміжку: рідко, частіше проти різкого суперника і на сілих ногах. */
function rollKnock(session: MatchSession, rng: Rng): boolean {
  const k = BALANCE.knock;
  const state = session.state;
  if (state.flags.includes('knock') || state.flags.includes('injured')) return false;
  let p = k.chancePerGap;
  if (state.flags.includes('them_hard')) p *= k.hardOpponentScale;
  if (state.stamina < k.tiredBelow) p *= k.tiredScale;
  return rng.chance(p);
}

function pushKnock(session: MatchSession, minute: number, rng: Rng) {
  const state = session.state;
  state.flags.push('knock');
  state.marks.knock = { minute, episodeId: 'feed', optionId: 'knock', past: 'відчув, як тягне нога після стику' };
  state.log.push({ minute, kind: 'filler', text: feedLine(session, 'knock', rng) + ' 🤕' });
}

/** Трибуны: дома громче, на выезде глуше. Все изменения fanHype идут через это. */
function addHype(session: MatchSession, delta: number) {
  session.state.fanHype = clamp(session.state.fanHype + delta * hypeScale(session.conditions), 0, 100);
}

function pushGoal(
  session: MatchSession, side: 'us' | 'them', minute: number, rng: Rng, text?: string, scorerKey?: string,
) {
  const state = session.state;
  // Если текст исхода уже назвал автора (apply.scorer) — лента называет того же игрока,
  // не случайное имя из scorers. Без ключа поведение прежнее: случайный игрок команды.
  const name = scorerKey ? namedScorer(session.roster, side, scorerKey) : scorer(session.roster, side, rng);
  if (side === 'us') {
    state.scoreUs += 1;
    state.momentum = clamp(state.momentum + 1, -3, 3);
    addHype(session, 6);
  } else {
    state.scoreThem += 1;
    state.momentum = clamp(state.momentum - 1, -3, 3);
    state.composureNow = clamp(state.composureNow - 6, 0, 100);
  }
  // Гол из исхода эпизода (scorerKey) — «эхо»: только кто и счёт, манеру уже описал исход.
  // Гол ленты — с манерой: она и есть событие.
  const kind: FeedKind = side === 'us' ? (scorerKey ? 'goalUsEcho' : 'goalUs') : (scorerKey ? 'goalThemEcho' : 'goalThem');
  state.log.push({
    minute,
    kind: side === 'us' ? 'goalUs' : 'goalThem',
    scorer: name,
    text: text ?? feedLine(session, kind, rng, { scorer: name }) + ' ' + state.scoreUs + ':' + state.scoreThem + '.',
  });
}

function syncTired(state: MatchState) {
  const tired = state.stamina < BALANCE.tiredBelow;
  if (tired && !state.flags.includes('tired')) state.flags.push('tired');
  if (!tired) state.flags = state.flags.filter((f) => f !== 'tired');
}

/** Прогон времени: расход сил + дрейф холоднокровності от трибун. Трибуни не заводят
 *  третий канал — они двигают composureNow, а он уже участвует и в пороговом моде
 *  после 80-й, и в слышимости голоса «Спокій» (voices.ts). */
function tickTime(session: MatchSession, minutes: number) {
  const state = session.state;
  if (!session.onBench) {   // на лаві сили не йдуть — ти сидиш
    const heat = session.conditions.weather === 'heat' ? BALANCE.conditions.heatDrainScale : 1;
    const knock = state.flags.includes('knock') ? BALANCE.knock.drainScale : 1;
    const endurance = 1 - attrMod(session.player.attrs.stamina) * BALANCE.staminaAttrDrainStep;
    state.stamina = clamp(state.stamina - minutes * BALANCE.staminaDrainPerMinute * heat * knock * endurance, 0, 100);
    syncTired(state);
  }

  const c = BALANCE.crowd;
  const dir = state.fanHype >= c.hypeHighAbove ? 1 : state.fanHype < c.hypeLowBelow ? -1 : 0;
  if (dir !== 0) state.composureNow = clamp(state.composureNow + dir * minutes * c.composureDriftPerMinute, 0, 100);
}

/** Прокручивает время до минуты `until`, наполняя ленту. Возвращает новые события. */
export function advanceTo(session: MatchSession, until: number, rng: Rng): TimelineEvent[] {
  const state = session.state;
  const from = state.minute;
  const before = state.log.length;
  if (until <= from) return [];
  // Вихід із лави посеред проміжку: спершу лента до хвилини виходу, потім «виходиш», потім решта.
  const entry = BALANCE.bench.entryMinute;
  if (session.onBench && from < entry && until > entry) {
    const a = advanceTo(session, entry, rng);
    const b = advanceTo(session, until, rng);
    return [...a, ...b];
  }

  if (from < 45 && until >= 45) {
    state.stamina = clamp(state.stamina + BALANCE.halftimeRecovery, 0, 100);
    syncTired(state);
    state.log.push({ minute: 45, kind: 'halftime', text: feedLine(session, 'halftime', rng, { score: state.scoreUs + ':' + state.scoreThem }) });
  }

  const gap = until - from;
  const beats = gap >= 16 ? 3 : gap >= 8 ? 2 : 1;
  // Гол разыгрывается один раз на промежуток, а не на каждую строку ленты:
  // иначе темп подачи текста начал бы менять счёт матча.
  const goal = rollFillerGoal(session, rng);
  const goalBeat = goal ? rng.int(1, beats) : -1;
  // Мікротравма — теж подія ленти: стик між епізодами, після якого нога не слухається.
  const knockBeat = !goal && rollKnock(session, rng) ? rng.int(1, beats) : -1;
  for (let i = 1; i <= beats; i++) {
    const minute = Math.round(from + (gap * i) / (beats + 1));
    tickTime(session, gap / (beats + 1));
    if (i === goalBeat) pushGoal(session, goal!, minute, rng);
    else if (i === knockBeat) pushKnock(session, minute, rng);
    else state.log.push({ minute, kind: 'filler', text: feedLine(session, 'filler', rng) });
  }
  tickTime(session, gap / (beats + 1));
  state.minute = until;
  if (session.onBench && until >= entry) benchEnter(session, rng);

  return state.log.slice(before);
}

// ——— выбор эпизода ————————————————————————————————————————————————

/** Подстановка следа решения в реактивный эпизод: {trigger.past}, {trigger.minute},
 *  {trigger.when} — «на 34-й» или «ще минулого матчу», если флаг принесён из прошлого
 *  матча; {trigger.When} — то же с большой буквы для начала предложения. */
export function fillTrigger<T>(value: T, mark: { minute: number; past: string; previousMatch?: boolean; whenText?: string }): T {
  if (typeof value === 'string') {
    const when = mark.whenText ?? (mark.previousMatch ? 'ще минулого матчу' : 'на ' + mark.minute + '-й');
    return value
      .replace(/\{trigger\.past\}/g, mark.past)
      .replace(/\{trigger\.minute\}/g, String(mark.minute))
      .replace(/\{trigger\.when\}/g, when)
      .replace(/\{trigger\.When\}/g, when.charAt(0).toUpperCase() + when.slice(1)) as T;
  }
  if (Array.isArray(value)) return value.map((v) => fillTrigger(v, mark)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = fillTrigger(v, mark);
    return out as T;
  }
  return value;
}

/** Реактивный эпизод для текущего слота, если флаги стоят. Всплывает вместо запланированного:
 *  последствие решения важнее ровной раскладки. */
function pickReactive(session: MatchSession, rng: Rng): Episode | null {
  const m = BALANCE.match;
  const i = session.nextIndex;
  if (session.tutorial) return null;   // перший матч: сцени фіксовані, дублер із прологу зачекає до другого
  if (i < m.reactiveFromSlot || session.reactiveUsed >= m.maxReactive) return null;
  const state = session.state;
  const minute = session.schedule[i];
  const pool = session.episodes.filter((e) =>
    isReactive(e) && !e.followUpOnly && fitsMinute(e, minute) && !session.usedEpisodeIds.includes(e.id)
    && e.requires!.flags!.every((f) => state.flags.includes(f))
    && !(e.requires?.notFlags?.some((f) => state.flags.includes(f)) ?? false));
  if (pool.length === 0) return null;
  const chosen = rng.weighted(pool, (e) => e.weight);
  // Память сезона для реактивных: шаблон, который всплывал в прошлом матче, почти не всплывает
  // снова — флаг при этом остаётся и продолжает давать модификаторы. Вес по флагу тут не помогает
  // (на один флаг обычно один шаблон), поэтому бросок «всплыть или нет».
  const familiarity = memoryWeight(session.memory[chosen.id]);
  if (familiarity < 1 && !rng.chance(familiarity)) return null;
  // Слот квоты обороны реактивный эпизод занимает только оборонительным.
  const planned = session.episodes.find((e) => e.id === session.plan[i]);
  if (planned?.phase === 'defense' && chosen.phase !== 'defense') return null;
  const mark = state.marks[chosen.requires!.flags![0]] ?? { minute: state.minute, past: 'зробив свій хід' };
  session.reactiveUsed += 1;
  return withSetup(fillTrigger(chosen, mark), session, rng);
}

/** Вариант сетапа под ситуацию. Було «найконкретніше правило»: у дощ завжди дощовий текст, і та сама сцена
 *  вдруге читалась тим самим вступом, хоча три інші варіанти гравець ще не бачив (21.09: до 20-го туру повторів
 *  тексту 21%). Тепер — як репліки й стрічка (pickFresh): серед усіх підхожих варіантів (плюс базовий) береться
 *  непрочитаний, вага 3^ключів тримає конкретніший попереду, поки він свіжий; прочитані повертаються, коли
 *  свіжих не лишилось. Пам’ять — session.setupSeen, між матчами через history.allSetups (уся кар’єра, не горизонт:
 *  епізод повертається пізніше, ніж горизонт його забуває). Безумовні варіанти (`when: {}`) — у 28 найчастіших сцен
 *  по два запасних вступи (22.09): без них сим на 20 турів давав повтор тексту 18% — у типовій ситуації підходив лише базовий. */
function withSetup(episode: Episode, session: MatchSession, rng: Rng): Episode {
  if (!episode.setups?.length) return episode;
  const fitting = episode.setups.filter((v) => matchesSituation(v.when, session.state, session.conditions));
  const pool = [{ text: episode.setup, weight: 1 }, ...fitting.map((v) => ({ text: v.text, weight: 3 ** Object.keys(v.when).length }))];
  const pick = pickFresh(pool, session.setupSeen, rng, session.setupSeenNow) ?? pool[0];
  session.setupSeen.add(pick.text); session.setupSeenNow.add(pick.text);
  return { ...episode, setup: pick.text };
}

/** Закрыт ли эпизод динамическим условием — флагом или счётом. Планировщик их не знает. */
function blockedNow(e: Episode, state: MatchState, conditions: MatchConditions): boolean {
  if (e.requires?.notFlags?.some((f) => state.flags.includes(f))) return true;
  if (e.requires?.score && e.requires.score !== scoreState(state)) return true;
  if (e.requires?.instruction && e.requires.instruction !== conditions.instruction) return true;
  return false;
}

export function pickEpisode(session: MatchSession, rng: Rng): Episode | null {
  const reactive = pickReactive(session, rng);
  if (reactive) return reactive;

  const episodes = session.episodes;
  const i = session.nextIndex;
  const byId = (id: string) => episodes.find((e) => e.id === id) ?? null;
  // Уже сыгранный — тоже закрыт: цепочка могла забрать плановый эпизод раньше его слота
  // (фол → штрафний, а штрафний стоял в плане на 62-ю).
  const blocked = (e: Episode) => blockedNow(e, session.state, session.conditions) || session.usedEpisodeIds.includes(e.id);

  const planned = byId(session.plan[i]);
  if (!planned) return null;
  if (!blocked(planned)) return withSetup(planned, session, rng);

  // Эпизод закрыт флагом или счётом (угловой при повреждении, затяжка времени при 0:1) —
  // меняем его местами с более поздним, который сейчас доступен и влезает по времени.
  for (let j = i + 1; j < session.plan.length; j++) {
    const other = byId(session.plan[j]);
    if (!other || blocked(other)) continue;
    if (!fitsMinute(other, session.schedule[i]) || !fitsMinute(planned, session.schedule[j])) continue;
    session.plan[j] = planned.id;
    session.plan[i] = other.id;
    return withSetup(other, session, rng);
  }
  // Менять не с чем — берём свежий эпизод вне плана. Играть «тягнути час» при 0:1
  // хуже, чем нарушить раскладку; квоту обороны при этом сохраняем.
  const fresh = episodes.filter((e) =>
    !isReactive(e) && !e.followUpOnly && e.weight > 0 && !blocked(e) && fitsMinute(e, session.schedule[i])
    && !session.plan.includes(e.id) && !session.usedEpisodeIds.includes(e.id)
    && (planned.phase !== 'defense' || e.phase === 'defense'));
  if (fresh.length > 0) {
    const pick = rng.weighted(fresh, (e) => e.weight);
    session.plan[i] = pick.id;
    return withSetup(pick, session, rng);
  }
  return withSetup(planned, session, rng);   // совсем нечем — играем как есть, матч важнее чистоты условия
}

/** Следующий эпизод: сначала лента до его минуты, потом сам эпизод. */
export function nextEpisode(
  session: MatchSession, rng: Rng,
): { episode: Episode; minute: number; events: TimelineEvent[] } | null {
  if (session.nextIndex >= session.schedule.length) return null;
  // Вилучення і заміна (22.09): рішень більше немає — finishMatch дограє стрічку до 90-ї без тебе,
  // свисток знає, звідки ти це дивився (whistle: sentOff / subbedOff).
  if (!session.pendingFollowUp && (session.state.flags.includes('sent_off') || session.state.flags.includes('subbed_off'))) return null;
  const minute = session.schedule[session.nextIndex];
  // Звено цепочки: тот же слот, без ленты между решениями — сцена продолжается.
  if (session.pendingFollowUp) {
    const link = session.episodes.find((e) => e.id === session.pendingFollowUp)!;
    session.pendingFollowUp = null;
    const filled = session.chainMark ? fillTrigger(link, session.chainMark) : link;
    return { episode: withSetup(filled, session, rng), minute, events: [] };
  }
  const events = advanceTo(session, minute, rng);
  // Тренер знімає: довіра нижче порога, у матчі ні гола, ні асиста, друга половина, і ти не щойно з лави.
  const sub = subOffNow(session);
  if (sub) return { episode: withSetup(sub, session, rng), minute, events };
  const episode = pickEpisode(session, rng);
  if (!episode) return null;
  return { episode, minute, events };
}

/** Заміна по ходу матчу (M18): епізод «тебе міняють» замість планового слоту. Рішення там одне й не про м’яч,
 *  а його ісход ставить `subbed_off` — далі nextEpisode віддає null, і стрічка дограє без тебе. */
function subOffNow(session: MatchSession): Episode | null {
  const b = BALANCE.bench;
  const s = session.state;
  if (session.fromBench || session.onBench || session.tutorial) return null;
  if (s.flags.includes('subbed_off') || s.flags.includes('sent_off')) return null;
  if (s.minute < b.subOffMinute || s.coachTrust >= b.subOffTrust) return null;
  if (s.stats.goals + s.stats.assists > 0) return null;
  return session.episodes.find((e) => e.id === b.subOffEpisode) ?? null;
}

/** Варианты, доступные сейчас: условные («по підказці») — только при флагах. */
/** Варианты, которые игрок видит: условные — по флагам, «голос бачить» — по силе атрибута.
 *  Без player варианты с insight скрыты: кто не передал игрока, тот не видит и подсказок. */
export function availableOptions(episode: Episode, state: MatchState, player?: Player): EpisodeOption[] {
  return episode.options.filter((o) => {
    if (o.insight && !(player && voiceSeesNow(o.insight.who, state, player))) return false;
    const r = o.requires;
    if (!r) return true;
    if (r.flags && !r.flags.every((f) => state.flags.includes(f))) return false;
    if (r.notFlags && r.notFlags.some((f) => state.flags.includes(f))) return false;
    return true;
  });
}

/** Что сильные голоса заметили в сцене — строки над вариантами (см. EpisodeOption.insight). */
export function sceneInsights(episode: Episode, state: MatchState, player: Player): Voice[] {
  return availableOptions(episode, state, player).flatMap((o) => (o.insight ? [o.insight] : []));
}

/** Сработает ли цепочка из этого исхода: звено существует, лимиты не выбраны, звено ещё не играли. */
function chainTarget(session: MatchSession, apply: ApplyEffect | undefined): Episode | null {
  if (!apply?.followUp) return null;
  const c = BALANCE.match.chain;
  const target = session.episodes.find((e) => e.id === apply.followUp);
  if (!target) throw new Error('followUp «' + apply.followUp + '» не найден в пуле');
  if (session.chainLinks >= c.maxLinksPerSlot) return null;
  if (session.chainLinks === 0 && session.chainsUsed >= c.maxChainsPerMatch) return null;
  if (session.usedEpisodeIds.includes(target.id)) return null;
  return target;
}

// ——— применение исхода ————————————————————————————————————————————

/** Возвращает true, только если гол соперника пришёл из контратаки после этого решения:
 *  прямой пропущенный уже описан текстом исхода, дублировать его в пересказе незачем. */
function applyEffects(
  session: MatchSession, apply: ApplyEffect | undefined, minute: number, rng: Rng,
  mark?: { episodeId: string; optionId: string; past: string },
): boolean {
  if (!apply) return false;
  const state = session.state;
  let fromCounter = false;

  if (apply.stamina) state.stamina = clamp(state.stamina + apply.stamina, 0, 100);
  if (apply.coachTrust) addTrust(state, apply.coachTrust);
  if (apply.fanHype) addHype(session, apply.fanHype);
  if (apply.composure) state.composureNow = clamp(state.composureNow + apply.composure, 0, 100);
  if (apply.momentum) state.momentum = clamp(state.momentum + apply.momentum, -3, 3);

  if (apply.losses) state.stats.losses += apply.losses;
  if (apply.keyPass) state.stats.keyPasses += 1;
  if (apply.duelWon) state.stats.duelsWon += 1;
  if (apply.foul) state.stats.fouls += 1;

  // Свой гол — по фамилии, как у партнёров: иначе персонаж в ленте безымянный (плейтест 17.09).
  if (apply.goal) { state.stats.goals += 1; pushGoal(session, 'us', minute, rng, namedScorer(session.roster, 'us', 'self') + ' забиває — гол! ' + (state.scoreUs + 1) + ':' + state.scoreThem + '.', 'self'); }
  if (apply.assist) { state.stats.assists += 1; pushGoal(session, 'us', minute, rng, undefined, apply.scorer); }
  if (apply.teamGoal) pushGoal(session, 'us', minute, rng, undefined, apply.scorer);

  if (apply.concede) pushGoal(session, 'them', minute, rng, undefined, apply.scorer);
  if (apply.counterAttack && !apply.concede && rng.chance(BALANCE.counterAttackConcede)) {
    pushGoal(session, 'them', minute + 1, rng,
      'Контратаку доводять до удару — ' + scorer(session.roster, 'them', rng) + ' не промахується. '
      + state.scoreUs + ':' + (state.scoreThem + 1) + '.');
    fromCounter = true;
  }

  if (apply.addFlags) {
    for (let f of apply.addFlags) {
      // Не больше maxPerSeason травм за сезон: дальше исход даёт мікротравму, а не пошкодження.
      if (f === 'injured' && (session.injuriesSeason ?? 0) >= BALANCE.injury.maxPerSeason) f = 'knock';
      // Червона — не просто прапор: команда лишається вдесятьох, і кураж падає разово (M18.0).
      if (f === 'sent_off' && !state.flags.includes(f)) state.momentum = clamp(state.momentum - 2, -3, 3);
      if (!state.flags.includes(f)) state.flags.push(f);
      if (mark) state.marks[f] = { minute, ...mark };   // след решения — для реактивных эпизодов
      countPeople(state, f);
    }
  }
  if (apply.removeFlags) state.flags = state.flags.filter((f) => !apply.removeFlags!.includes(f));

  return fromCounter;
}

/** Полная цена варианта по силам: базовая плюс надбавка за физику. Витривалість — тоже физика (M9.7):
 *  бег назад через всё поле выжигает не меньше рывка; без этого критерий стамины уезжал за 75-ю. */
export function optionCost(option: EpisodeOption): number {
  const physical = option.attribute === 'pace' || option.attribute === 'strength' || option.attribute === 'stamina';
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
  // Критический успех: свой текст, если он написан, иначе clean с системным бонусом.
  const crit = res.critical === 'success';
  const outcome = pickOutcome(option, res);

  state.minute = minute;
  state.stamina = clamp(state.stamina - optionCost(option), 0, 100);
  // Кураж витрачається на кидок, у який він щось дав (MOMENTUM_SPEND): крок до нуля з будь-якого боку.
  const cm = BALANCE.contextMod;
  const used = Math.max(cm.momentumMin, Math.min(cm.momentumMax, state.momentum));   // скільки кураж дав саме цьому кидку
  const spend = MOMENTUM_SPEND ? used : 0;
  // Кураж за ризик: чистий ісход на ризику заводить сильніше, ніж чистий на «упевнено» (MOMENTUM_BY_BOLDNESS).
  const boldness = res.tier === 'clean' ? MOMENTUM_BY_BOLDNESS[res.position] : 0;
  // Провал Спокою не збиває кураж — спокійний не панікує (COMPOSURE_CALM); катастрофа — як у всіх.
  const byTier = res.tier === 'fail' && option.attribute === 'composure' ? COMPOSURE_CALM.momentumOnFail : MOMENTUM_BY_TIER[res.tier];
  state.momentum = clamp(state.momentum - spend + byTier + boldness, -3, 3);

  // Трибуны реагируют на смелость сами по себе, до того как ясен результат.
  addHype(session, BALANCE.systemic.boldnessHype[res.position]);

  // Установка тренера: он оценивает не бросок, а послушание.
  const k = BALANCE.conditions;
  const bold = res.position !== 'controlled';
  const good = res.tier === 'clean';
  const bad = res.tier === 'fail' || res.tier === 'badFail';
  if (session.conditions.instruction === 'hold') {
    if (!bold && good) addTrust(state, k.holdObeyTrust);
    if (bold && bad) addTrust(state, k.holdDisobeyTrust);
  }
  if (session.conditions.instruction === 'press') {
    if (bold && good) addTrust(state, k.pressBoldTrust);
    if (!bold) addTrust(state, k.pressTimidTrust);
  }

  // Провалившееся эгоистичное решение стоит доверия сверх того, что записано в контенте.
  if (res.tier === 'fail' || res.tier === 'badFail') {
    const selfish = option.goals.personal - option.goals.team;
    if (selfish > 0) {
      addTrust(state, -selfish * BALANCE.systemic.selfishFailTrustPenalty);
    }
  }

  if (option.voice) recordVoice(state.voices, option.voice.who);
  // Замовклі голоси возвращаются по эпизодам, не по минутам.
  if (state.voices.muted) {
    for (const k of Object.keys(state.voices.muted) as VoiceKey[]) {
      state.voices.muted[k] = Math.max(0, (state.voices.muted[k] ?? 0) - 1);
    }
  }
  const link = chainTarget(session, outcome.apply);
  const conceded = applyEffects(session, outcome.apply, minute, rng, { episodeId: episode.id, optionId: option.id, past: option.past });
  // Цепочка не сработала — исход достраивается запасным apply (пенальті б’є {striker}).
  if (!link && outcome.apply?.followUpElse) {
    applyEffects(session, outcome.apply.followUpElse, minute, rng, { episodeId: episode.id, optionId: option.id, past: option.past });
  }
  if (crit) {
    state.momentum = clamp(state.momentum + BALANCE.crit.momentum, -3, 3);
    addHype(session, BALANCE.crit.fanHype);
    state.composureNow = clamp(state.composureNow + BALANCE.crit.composure, 0, 100);
  }
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
    // Реплика знает семью сцены (пенальті, а не «удар») и, как и эпизоды, говорит именами ростера.
    ...(() => {
      const f = pickFlavorLine(flavorRules, state, res.tier, rng, { family: episode.family, phase: episode.phase }, session.flavorSeen, session.flavorSeenNow);
      if (!f) return {};
      session.flavorSeen.add(f.text);
      session.flavorSeenNow.add(f.text);
      return { flavor: fillNames(f.text, session.roster), flavorVoice: f.voice };
    })(),
    badges: resultBadges(outcome.apply),
  });

  session.usedEpisodeIds.push(episode.id);
  if (link) {
    if (session.chainLinks === 0) session.chainsUsed += 1;
    session.chainLinks += 1;
    session.pendingFollowUp = link.id;
    session.chainMark = { minute, past: option.past };
  } else {
    session.chainLinks = 0;
    session.chainMark = null;
    session.nextIndex += 1;
  }

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
  /** Протокол: кто и когда забил, с обеих сторон — для итогового экрана и бомбардиров сезона. */
  goals: { minute: number; side: 'us' | 'them'; scorer: string }[];
  /** Лучший и худший момент матча — чтобы стрічка цитировала именно то, что игрок выбрал
   *  («62га хвилина. він реально пішов в обведення?»). Имена в past уже подставлены. */
  moments?: { best?: Moment; worst?: Moment };
};

export type Moment = { minute: number; past: string; recap: string; tier: Tier; episodeId: string; optionId: string };

/** Худший — катастрофа, потом решение, после которого пропустили, потом провал; лучший — гол,
 *  ассист, чистый «вирішити», чистый. Если матч ровный, момента может не быть. */
export function pickMoments(state: MatchState): { best?: Moment; worst?: Moment } {
  const episodes = state.log.filter((e) => e.kind === 'episode' && e.past && e.recap);
  const toMoment = (e: TimelineEvent): Moment => ({ minute: e.minute, past: e.past!, recap: e.recap!, tier: e.tier ?? 'fail', episodeId: e.episodeId ?? '', optionId: e.optionId ?? '' });
  const worstScore = (e: TimelineEvent) => (e.tier === 'badFail' ? 3 : 0) + (e.causedConcede ? 2 : 0) + (e.tier === 'fail' ? 1 : 0);
  const goalMinutes = new Set(state.log.filter((e) => e.kind === 'goalUs').map((e) => e.minute));
  const bestScore = (e: TimelineEvent) => (e.tier !== 'clean' ? 0 : 1 + (goalMinutes.has(e.minute) ? 3 : 0) + (e.effect === 'great' ? 1 : 0));
  const worst = [...episodes].sort((a, b) => worstScore(b) - worstScore(a))[0];
  const best = [...episodes].sort((a, b) => bestScore(b) - bestScore(a))[0];
  return {
    ...(worst && worstScore(worst) > 0 ? { worst: toMoment(worst) } : {}),
    ...(best && bestScore(best) > 0 ? { best: toMoment(best) } : {}),
  };
}

const rate = (value: number) => Math.round(clamp(value, 1, 10) * 10) / 10;

export function computeRatings(
  state: MatchState, conditions: MatchConditions = neutralConditions(),
): { coachRating: number; fanRating: number } {
  const r = BALANCE.rating;
  const st = state.stats;
  // «Вільна роль»: тренер отпустил — значит, ждёт голов и передач.
  const free = conditions.instruction === 'free';
  const goalW = r.coach.goal + (free ? BALANCE.conditions.freeGoalWeight : 0);
  const assistW = r.coach.assist + (free ? BALANCE.conditions.freeAssistWeight : 0);
  const coach = r.coach.base + (state.coachTrust / 100) * r.coach.trustWeight
    + st.goals * goalW + st.assists * assistW + st.keyPasses * r.coach.keyPass
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

  const { coachRating, fanRating } = computeRatings(state, session.conditions);
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
    goals: state.log
      .filter((e) => (e.kind === 'goalUs' || e.kind === 'goalThem') && e.scorer)
      .map((e) => ({ minute: e.minute, side: e.kind === 'goalUs' ? 'us' as const : 'them' as const, scorer: e.scorer! })),
    moments: pickMoments(state),
  };
  return { events: state.log.slice(before), summary };
}

// ——— пересказ ————————————————————————————————————————————————————
// Главный проверяемый артефакт: если это читается как история, механика работает.

function pluralSuffix(n: number): string {
  // 1 раз, 2-4 рази, 5+ разів — украинская плюрализация для маленьких чисел (n <= ~9 за матч).
  if (n % 10 === 1 && n % 100 !== 11) return '';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'и';
  return 'ів';
}

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
  const dominant = dominantVoice(state.voices);
  const voiceNote = dominant ? ` Цього матчу найгучніше звучав ${VOICE_LABEL[dominant.who]} — ти слухав його ${dominant.count} раз${pluralSuffix(dominant.count)}.` : '';
  lines.push(
    verdict + ', ' + state.scoreUs + ':' + state.scoreThem
    + '. Тренер поставив ' + coachRating.toFixed(1) + ', трибуни — ' + fanRating.toFixed(1) + '.' + voiceNote,
  );
  return lines;
}
