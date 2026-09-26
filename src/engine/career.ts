// Рост между матчами (M2): опыт → уровень → +1 атрибут, тренировка, перенос доверия
// тренера и последствий карточек/травм. Чистая логика без React и без localStorage —
// хранилище отдельно (telemetry/career-storage.ts), здесь только правила.

import { ATTR_MOD, BALANCE } from './balance';
import { attrMod } from './attr';
import type { Attribute, Mark, MatchState, Player, VoiceKey } from './types';
import type { MatchSummary } from './match';
import type { AgentLogEntry } from './agent';
import { voiceSees, VOICE_LABEL } from './voices';

export type Career = {
  xp: number;
  level: number;
  /** Очки прокачки поверх стартовых атрибутов (лист персонажа = attrs + attrPoints). */
  attrPoints: Partial<Record<Attribute, number>>;
  /** Доверие тренера на конец последнего матча — стартовая точка для следующего
   *  (с регрессией к среднему, см. nextMatchCoachTrust), не сбрасывается на 55 каждый раз. */
  coachTrust: number;
  /** Настрій трибун на кінець останнього матчу — стартова точка наступного (з регресією, як довіра).
   *  Без поля (старі збереження) — старт 45. Трибуни пам'ятають (M9): ресурс сезону, не ефект матчу. */
  fanHype?: number;
  /** Лава запасних (M9): наступний матч починаєш на лаві — виходиш у другому таймі (match.ts:benchWarmup).
   *  Садить вердикт сезону або тренер по ходу сезону (довіра < bench.demoteTrust без захисту трибун);
   *  виходиш — довірою, голом/асистом або оцінкою трибун (benchAfterMatch). */
  benched?: boolean;
  /** Як піднялися у вищу лігу (M14): чесно або за скандалом — тексти другого сезону й холодніші трибуни на старті. */
  promotion?: 'earned' | 'scandal';
  /** Фінал (M16): розворот → обраний стікер (як прощався). */
  ending?: Record<string, string>;
  /** Відпустка (M15): розворот → обраний стікер; є — відпустку прожито. */
  vacation?: Record<string, string>;
  /** Дублер пішов після першого сезону (M15) — ім’я в ростері підміняється (content:syncRoster); клуб, куди пішов. */
  subLeft?: boolean;
  subClub?: string;
  /** Минулий сезон (M14): рахунки з кожним суперником — «зустрічалися торік» у програмці, постах і сетапах. */
  lastSeason?: { number: number; position: number; results: Record<string, { scoreUs: number; scoreThem: number; venue: 'home' | 'away' }[]> };
  /** Несгоревшие жёлтые за карьеру; на третьей — тренер начинает следующий матч настороже. */
  careerYellows: number;
  /** Сколько ближайших матчей ещё аукается травма (сниженный старт сил). */
  injuredMatches: number;
  /** Правда только на один следующий матч после травмы/картки — потребляется при старте. */
  pendingSentOff: boolean;
  /** Накопленный профиль голосов за карьеру — материал для будущих черт (M4). */
  voiceCounts: Record<VoiceKey, number>;
  matchesPlayed: number;
  /** Очки уровня, ещё не потраченные на атрибут. Хранятся в карьере, а не в состоянии экрана:
   *  плейтест 17.09 — перезагрузка на экране выбора теряла очко навсегда («не засчитывается»). */
  unspentPoints: number;
  /** Флаги-последствия, дожившие до конца матча и уходящие в следующий: партнёр помнит,
   *  что ты ему отдал (или не отдал), тренер — что фланг твой. Реактивный эпизод
   *  всплывёт «ще минулого матчу». Потребляются при старте (consumeStartPenalty). */
  carriedFlags?: CarriedFlag[];
  /** Тиждень між матчами (week.ts): что выбрано по турам — для once/cooldown/памяти и телеметрии. */
  weekLog?: WeekLogEntry[];
  /** Что неделя приготовила к следующему матчу — потребляется в consumeStartPenalty. */
  nextMatch?: NextMatchPrep;
  /** Партнер з пам’яттю (M11, 20.09): сума приводів довіряти (+1) і ображатися (−1) за кар’єру — з ісходів матчу
   *  і флагів тижня (MatchState.people). Пороги BALANCE.people відкривають флаги partner_bonded / partner_cold
   *  на матч, тиждень і стрічку (peopleFlags). Раніше партнер жив два матчі як флаг і забувався. */
  partnerBond?: number;
  /** Прогресс тренировок по атрибутам: BALANCE.week.trainToPoint тренировок = +1 очко навсегда. */
  training?: Partial<Record<Attribute, number>>;
  /** Ріст від матчу (M18.4): скільки чистих ісходів зроблено кожним атрибутом за кар’єру.
   *  Кожні BALANCE.growth.useToPoint дають +1 очко назавжди — лічильник не обнуляється,
   *  щоб «ще два до пункту» можна було показати на картці. */
  useCounts?: Partial<Record<Attribute, number>>;
  /** «Тебе вивчили» (M27.1): скільки чистих ісходів дав кожен варіант за кар'єру, ключ
   *  `<episodeId>/<optionId>`. Кожні STUDIED.perStep піднімають його складність (balance.ts:studiedStep);
   *  між сезонами не обнуляється — суперники змінюються, звички ні. */
  optionCleans?: Record<string, number>;
  /** Лист травня (M19.2) вже показано — щоб не повторювався при поверненні в меню. */
  mayDone?: boolean;
  /** Розділювачі глав (M24), які вже показано: 'prologue' | 'season1' | 'season2' | 'epilogue'.
   *  Глава відкривається раз — при поверненні в меню розворот не повторюється. */
  chaptersSeen?: string[];
  /** Травм за текущий сезон — не больше BALANCE.injury.maxPerSeason (match.ts понижает до knock). */
  injuriesSeason?: number;
  /** Сколько недель подряд голос предлагал дела, а игрок не брал (week.ts:neglect). На третьей
   *  голос замовкає на матч: выбор голоса — ставка, а не вкус. */
  voiceNeglect?: Partial<Record<VoiceKey, number>>;
  /** Пролог (M12, 20.09): які стікери обрано на трьох розворотах тижня нуль (engine/prologue.ts) — характер
   *  на старт. Є в збереженні — пролог пройдено; base читають репліки Тібо про мафію. */
  prologue?: Partial<Record<'scout' | 'call' | 'base', string>>;
  /** Сцена агента (M12, engine/agent.ts): що відповів узимку і чому не пішов — для стрічки й сцен тижня. */
  agentLog?: AgentLogEntry[];
  /** Кар’єру завершено (M13): улітку сказав агенту «так» — епілог, далі тільки нова кар’єра. */
  ended?: { season: number };
  /** Луна зимового дзвінка на один матч (agentFlags, програмка); знімає applyMatchToCareer. */
  agentEcho?: 'leave' | 'stay' | 'wait';
};

/** Стан арки (M13, 20.09): невпевнений → помітили → свій → не помітив, коли. Не сюжетні глави, а стани, в які
 *  персонаж входить накопиченням; тексти (репліки Тібо, свисток, програмка, дорога на базу, стрічка) обирають
 *  варіант за станом, як сетапи за флагами. Ціль не декларується — стан ніде не показується як шкала. */
export type ArcStage = 1 | 2 | 3 | 4;

export function arcStage(career: Career): ArcStage {
  const a = BALANCE.arc;
  if ((career.agentLog ?? []).length > 0 && career.matchesPlayed >= a.settledFrom) return 4;
  const warm = (career.fanHype ?? 0) >= a.ownHype || (career.partnerBond ?? 0) >= a.ownBond;
  if (career.matchesPlayed >= a.ownFrom && warm) return 3;
  if (career.matchesPlayed >= a.noticedFrom) return 2;
  return 1;
}

/** Суперник був у минулому сезоні (M14): для програмки, постів і флагу матчу `met_last_year`. */
export function metLastYear(career: Career, opponentKey: string): { scoreUs: number; scoreThem: number; venue: 'home' | 'away' }[] | null {
  const r = career.lastSeason?.results[opponentKey];
  return r && r.length ? r : null;
}

export type CarriedFlag = {
  flag: string; mark: Mark; opponentKey?: string;
  /** Отложенное следствие: сколько матчей флаг едет молча, прежде чем сработать (0 — в следующем). */
  after?: number;
};

export type WeekLogEntry = {
  season: number; round: number; chosen: string[]; offered: string[];
  /** Тиждень v3 (19.09): какие исходы выпали и что выбрано в сцене-продолжении. */
  outcomes?: string[]; scene?: { id: string; option: string };
};

/** Подготовка к одному матчу от недели: временные +/−1 к модификаторам (в единицах значения,
 *  POINT_VALUE за мод), сдвиг стартовых ресурсов, строки в брифинг. Живёт один матч. */
export type NextMatchPrep = {
  attrBonus?: Partial<Record<Attribute, number>>;
  start?: { stamina?: number; composure?: number; fanHype?: number; momentum?: number };
  /** Его/Команда гучніші — стартовая серия; тихіші — замовкли на N эпизодов (voices.ts). */
  voiceStreak?: { who: VoiceKey; count: number };
  voiceMute?: Partial<Record<VoiceKey, number>>;
  notes?: string[];
  /** Травма/мікротравма вылечены неделей: injuredMatches обнуляется, knock не переносится. */
  healed?: boolean;
};

/** Что переживает финальный свисток. Обида/долг партнёра и доверенный фланг — про людей,
 *  они помнят; злой защитник и жёлтая — про этот матч и этого соперника, их не несём. */
export const CARRIED_FLAGS = ['partner_trusts', 'partner_annoyed', 'coach_flank', 'sub_threat', 'keeper_read'];
/** Флаги про конкретного соперника: переживают свисток только до матча с тем же клубом. */
export const OPPONENT_BOUND_FLAGS = ['keeper_read'];

/** Доверие тренера живёт в 0..100 — и в матче, и между матчами (week.ts). */
export function clampTrust(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function defaultCareer(): Career {
  return {
    xp: 0,
    level: 1,
    attrPoints: {},
    coachTrust: BALANCE.coachTrustStart,
    careerYellows: 0,
    injuredMatches: 0,
    pendingSentOff: false,
    voiceCounts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 },
    matchesPlayed: 0,
    unspentPoints: 0,
  };
}

/** Опыт за матч: база + оценки + бонус за чёткий характер (доминирующий голос —
 *  тот же порог BALANCE.voiceDominantMin, что и в пересказе, — один критерий на игру). */
export function xpForMatch(summary: MatchSummary, hadDominantVoice: boolean): number {
  const base = 8;
  const ratings = Math.round(summary.coachRating) + Math.round(summary.fanRating);
  const character = hadDominantVoice ? 3 : 0;
  return base + ratings + character;
}

/** Кумулятивный порог опыта для каждого уровня: первые уровни быстро, дальше — реже.
 *  LEVEL_THRESHOLDS[i] — сколько опыта нужно для уровня i+2 (уровень 1 — старт без опыта).
 *  Удвоены 17.09 вместе с ценой очка (+1 к модификатору): при ~23 опыта за матч — 2-й уровень
 *  после второго матча, 5-й к концу сезона из десяти; было 6–7-й, и персонаж уезжал от баланса. */
export const LEVEL_THRESHOLDS = [40, 90, 150, 220, 300, 390, 490, 600, 720, 850];

export function levelForXp(xp: number): number {
  let level = 1;
  for (const threshold of LEVEL_THRESHOLDS) {
    if (xp < threshold) break;
    level += 1;
  }
  return level;
}

export function xpToNextLevel(xp: number): { xpIntoLevel: number; xpForLevel: number } | null {
  const level = levelForXp(xp);
  if (level - 2 >= LEVEL_THRESHOLDS.length) return null; // потолок таблицы — дальше уровни не считаем
  const prevThreshold = level === 1 ? 0 : LEVEL_THRESHOLDS[level - 2];
  const nextThreshold = LEVEL_THRESHOLDS[level - 1];
  if (nextThreshold === undefined) return null;
  return { xpIntoLevel: xp - prevThreshold, xpForLevel: nextThreshold - prevThreshold };
}

/** Одно очко уровня = +1 к модификатору броска, то есть +ATTR_MOD.step к значению (решение
 *  17.09: очко «+1 к значению» три раза из четырёх ничего не меняло в матче — модификатор
 *  растёт ступенями по 4, и уровень ощущался пустым). Старые сохранения с attrPoints в
 *  «единицах значения» становятся щедрее задним числом — для прототипа допустимо. */
export const POINT_VALUE = ATTR_MOD.step;

/** Игрок для этого матча: базовые атрибуты + очки прокачки × POINT_VALUE, зажато в 1..99.
 *  attrMod() сам ограничивает модификатор потолком +12 — раскачать бросок до абсурда
 *  прокачкой нельзя, даже если атрибут дойдёт до 99. */
export function effectivePlayer(base: Player, career: Career, matchBonus?: Partial<Record<Attribute, number>>): Player {
  const attrs = { ...base.attrs };
  for (const [attr, bonus] of Object.entries(career.attrPoints) as [Attribute, number][]) {
    attrs[attr] = Math.max(1, Math.min(99, attrs[attr] + bonus * POINT_VALUE));
  }
  // Временный сдвиг от недели (week.ts): голос гучніший/тихіший на один матч.
  for (const [attr, bonus] of Object.entries(matchBonus ?? {}) as [Attribute, number][]) {
    attrs[attr] = Math.max(1, Math.min(99, attrs[attr] + bonus));
  }
  return { ...base, attrs };
}

/** Голоса, которые питает атрибут (зеркало voices.ts:voiceSees / voiceAudible). */
const VOICE_OF: Partial<Record<Attribute, VoiceKey>> = {
  vision: 'vision', positioning: 'vision', dribbling: 'instinct', first_touch: 'instinct',
  pace: 'body', strength: 'body', composure: 'composure',
};

export type PointEffect = {
  from: number; to: number; modFrom: number; modTo: number;
  /** Что очко сделает с голосом этого атрибута: разбудит, даст зрение — или ничего. */
  voice?: { who: VoiceKey; label: string; change: 'hears' | 'sees' | null };
};

/** Что даст очко в этот атрибут — для экрана уровня и карточки: не «+1», а «Тіло почне бачити».
 *  Голос слышно с BALANCE.voiceMinMod, видит — с insightMinMod; считаем по атрибуту, который
 *  прокачивается, поэтому «уже бачить через другой атрибут» здесь не change, а null. */
export function pointEffect(base: Player, career: Career, attr: Attribute): PointEffect {
  const now = effectivePlayer(base, career);
  const next = effectivePlayer(base, spendPoint({ ...career, unspentPoints: 1 }, attr));
  const from = now.attrs[attr];
  const to = next.attrs[attr];
  const modFrom = attrMod(from);
  const modTo = attrMod(to);
  const who = VOICE_OF[attr];
  if (!who) return { from, to, modFrom, modTo };
  let change: 'hears' | 'sees' | null = null;
  if (!voiceSees(who, now) && voiceSees(who, next)) change = 'sees';
  else if (modFrom < BALANCE.voiceMinMod && modTo >= BALANCE.voiceMinMod) change = 'hears';
  return { from, to, modFrom, modTo, voice: { who, label: VOICE_LABEL[who], change } };
}

/** Доверие тренера между матчами: тянется к базовому значению, а не сохраняется дословно —
 *  иначе один провальный матч навсегда портит карьеру, а один удачный — навсегда её решает. */
export function nextMatchCoachTrust(endingTrust: number): number {
  const reversion = BALANCE.coachTrustReversion;
  return Math.round(endingTrust * (1 - reversion) + BALANCE.coachTrustStart * reversion);
}

/** Люди з пам’яттю: флаги-пороги з кар’єри на матч, тиждень і стрічку. Не ставляться ісходами — це зведення
 *  кар’єри, тому в тесті «правило ніхто не ставить» вони системні. Мітка — для {trigger.when} у сценах. */
export function peopleFlags(career: Career): CarriedFlag[] {
  const p = BALANCE.people;
  const bond = career.partnerBond ?? 0;
  const mark = (past: string): Mark => ({ minute: 0, episodeId: 'career', optionId: 'partner', past, whenText: 'за ці місяці' });
  if (bond >= p.partnerBonded) return [{ flag: 'partner_bonded', mark: mark('грав із партнером в одне торкання, поки це не стало звичкою') }];
  if (bond <= p.partnerCold) return [{ flag: 'partner_cold', mark: mark('раз за разом не віддавав партнеру, і він перестав просити') }];
  return [];
}

/** Тон відповіді тренеру в пролозі (21.09) — маркер на перший матч: «лава — це ненадовго» тренер пам’ятає на розминці. */
export function prologueFlags(career: Career): CarriedFlag[] {
  const tone: Record<string, string> = { call_ego: 'call_tone_ego', call_team: 'call_tone_team', call_vision: 'call_tone_vision' };
  const flag = career.prologue?.call ? tone[career.prologue.call] : undefined;
  if (!flag || career.matchesPlayed > 0) return [];
  return [{ flag, mark: { minute: 0, episodeId: 'prologue', optionId: 'call', past: 'відповів тренеру по телефону', whenText: 'ще до сезону' } }];
}

/** Луна сцени агента (21.09): що Реєс відповів узимку, тренер і Тібо пам’ятають перший матч нового сезону —
 *  маркер на матч (agent_left / agent_stayed / agent_waited) і рядок у програмці; знімається після матчу. */
export function agentFlags(career: Career): CarriedFlag[] {
  const echo = career.agentEcho;
  if (!echo) return [];
  const flag = echo === 'leave' ? 'agent_left' : echo === 'stay' ? 'agent_stayed' : 'agent_waited';
  return [{ flag, mark: { minute: 0, episodeId: 'agent', optionId: echo, past: 'говорив з агентом узимку', whenText: 'ще взимку' } }];
}

/** Жарт Тібо (M12/M13): перепитав у пролозі, чи це жарт, — Тібо нагнітає сильніше. Маркер для реплік і сетапів,
 *  без модифікатора; системний, як partner_bonded. Живе, поки арка не дійде до «свій» — далі жарт уже спільний. */
export function tiboFlags(career: Career): CarriedFlag[] {
  if (career.prologue?.base !== 'base_vision' || arcStage(career) >= 3) return [];
  return [{ flag: 'tibo_asked', mark: { minute: 0, episodeId: 'prologue', optionId: 'base', past: 'перепитав у Тібо, чи мафія — це жарт', whenText: 'ще до сезону' } }];
}

/** Трибуни між матчами — та сама регресія, що й довіра: пам'ятають, але не навіки. */
export function nextMatchFanHype(endingHype: number): number {
  const reversion = BALANCE.fanHypeReversion;
  return Math.round(endingHype * (1 - reversion) + BALANCE.fanHypeStart * reversion);
}

/** Чи сидить Реєс на лаві наступного матчу. З лави виходять довірою, результативною дією або трибунами;
 *  в основі сідають, коли довіра на свисток впала нижче demoteTrust і в матчі не було гола чи асиста.
 *  Довіра — до регресії: тренер вирішує по гарячих слідах, а поки сидиш, вона відходить до середнього —
 *  тренер остигає, і лава не стає вироком. */
export function benchAfterMatch(benched: boolean, endingTrust: number, summary: MatchSummary): boolean {
  const b = BALANCE.bench;
  // Тести передають порожній підсумок — без статистики дій немає, трибуни мовчать.
  const actions = (summary.stats?.goals ?? 0) + (summary.stats?.assists ?? 0);
  if (benched) return !(endingTrust >= b.exitTrust || actions >= 1 || (summary.fanRating ?? 0) >= b.exitFan);
  return endingTrust < b.demoteTrust && actions === 0;
}

/** Що переноситься в матч із минулого — для програмки (прес-служба скаже це своїми словами, без «тренер не забув»). */
export type CarryFacts = { sentOff: boolean; yellows: boolean; injured: boolean; /** Літо без передсезонки (M15): маркер out_of_form на цей матч. */ outOfForm?: boolean };

export type StartPenalty = {
  /** Факти для програмки (programme.ts:carryLine); note нижче — службовий рядок, на екран не йде (21.09). */
  facts: CarryFacts;
  /** Стан арки на цей матч (M13) — репліки, сетапи й свисток читають його через state.arc. */
  arc?: ArcStage;
  /** «Тебе вивчили» (M27.1) — лічильники з career.optionCleans у state.studied. */
  studied?: Record<string, number>;
  staminaPenalty: number; coachTrustPenalty: number; note?: string;
  /** Матч з лави: епізоди лише після bench.entryMinute, ноги свіжі. */
  fromBench?: boolean;
  flags: CarriedFlag[];
  /** От недели: временные модификаторы и сдвиг старта (career.nextMatch), уже потреблённые. */
  attrBonus?: Partial<Record<Attribute, number>>;
  startDelta?: NextMatchPrep['start'];
  voiceStreak?: NextMatchPrep['voiceStreak'];
  voiceMute?: NextMatchPrep['voiceMute'];
};

/** Штрафы старта следующего матча от травмы/картки прошлого — и одновременно их
 *  потребление (счётчики уменьшаются). Вызывается один раз при старте матча. */
export function consumeStartPenalty(career: Career): { career: Career; penalty: StartPenalty } {
  let staminaPenalty = 0;
  let coachTrustPenalty = 0;
  let note: string | undefined;
  const next = { ...career };

  if (career.pendingSentOff) {
    coachTrustPenalty = 25;
    note = 'Тренер не забув червону картку з минулого матчу — починаєш із меншою довірою.';
    next.pendingSentOff = false;
  } else if (career.careerYellows >= 3) {
    coachTrustPenalty = 15;
    note = 'Тренер пам’ятає про жовті картки — починаєш під пильнішим наглядом.';
    next.careerYellows = 0;
  }

  const prep = career.nextMatch;
  if (career.injuredMatches > 0 && !prep?.healed) {
    staminaPenalty = 20;
    note = note ? note + ' Ще й тіло не до кінця відновилося.' : 'Ти граєш після травми — сили менше з першої хвилини.';
    next.injuredMatches = career.injuredMatches - 1;
  } else if (prep?.healed) {
    next.injuredMatches = 0;
  }

  // Отложенные флаги недели едут дальше с уменьшенным счётчиком; остальные — в этот матч.
  const flags = (career.carriedFlags ?? []).filter((f) => !(f.after && f.after > 0));
  next.carriedFlags = (career.carriedFlags ?? [])
    .filter((f) => f.after && f.after > 0)
    .map((f) => ({ ...f, after: f.after! - 1 }));
  if (career.benched) note = [note, 'Починаєш на лаві: тренер випустить у другому таймі. Вийти з неї — довірою, голом або трибунами.'].filter(Boolean).join(' ');
  if (prep?.notes?.length) note = [note, ...prep.notes].filter(Boolean).join(' ');
  next.nextMatch = undefined;
  return {
    career: next,
    penalty: {
      facts: { sentOff: career.pendingSentOff, yellows: !career.pendingSentOff && career.careerYellows >= 3, injured: staminaPenalty > 0, outOfForm: flags.some((f) => f.flag === 'out_of_form') },
      staminaPenalty, coachTrustPenalty, note, flags: [...flags, ...peopleFlags(career), ...tiboFlags(career), ...prologueFlags(career), ...agentFlags(career)], fromBench: !!career.benched,
      arc: arcStage(career),
      studied: career.optionCleans,
      attrBonus: prep?.attrBonus, startDelta: prep?.start, voiceStreak: prep?.voiceStreak, voiceMute: prep?.voiceMute,
    },
  };
}

/** Обновление карьеры по итогам матча: опыт, уровень (без авто-траты очка — это отдельный
 *  экран выбора), доверие тренера, счётчик жёлтых/травм, профиль голосов. */
/** Очки, які вже видані за використання атрибута: ціла частина від лічильника чистих. */
const usePoints = (n: number) => Math.floor(n / BALANCE.growth.useToPoint);

/** Ріст від матчу (M18.4): чисті ісходи цього матчу додаються до лічильників кар’єри, і кожен перехід
 *  через поріг дає +1 очко назавжди. Повертає нові лічильники, очки і те, що саме виросло (для дошки). */
export function growthFromMatch(career: Career, state: MatchState): {
  useCounts: Partial<Record<Attribute, number>>; attrPoints: Partial<Record<Attribute, number>>; grew: { attr: Attribute; total: number }[];
} {
  const useCounts = { ...(career.useCounts ?? {}) };
  const attrPoints = { ...career.attrPoints };
  const grew: { attr: Attribute; total: number }[] = [];
  for (const [a, n] of Object.entries(state.cleanBy ?? {}) as [Attribute, number][]) {
    const was = useCounts[a] ?? 0;
    const now = was + n;
    useCounts[a] = now;
    const gained = usePoints(now) - usePoints(was);
    if (gained > 0) {
      attrPoints[a] = (attrPoints[a] ?? 0) + gained;
      grew.push({ attr: a, total: now });
    }
  }
  return { useCounts, attrPoints, grew };
}

export function applyMatchToCareer(
  career: Career, state: MatchState, summary: MatchSummary, hadDominantVoice: boolean, opponentKey?: string,
): Career {
  const growth = growthFromMatch(career, state);
  const xp = career.xp + xpForMatch(summary, hadDominantVoice);
  // Уровень не откатывается: после удвоения порогов (17.09) сохранённый уровень тестера может
  // быть выше, чем даёт таблица, — он остаётся, а следующий придёт по новой таблице.
  const level = Math.max(career.level, levelForXp(xp));
  const next: Career = {
    ...career,
    xp,
    level,
    useCounts: growth.useCounts,
    // «Тебе вивчили» (M27.1): чисті ісходи цього матчу за варіантами лягають у лічильник кар'єри.
    optionCleans: Object.entries(state.cleanOptions ?? {}).reduce<Record<string, number>>(
      (acc, [k, n]) => ({ ...acc, [k]: (acc[k] ?? 0) + n }), { ...(career.optionCleans ?? {}) }),
    attrPoints: growth.attrPoints,
    // Уровни выключены (BALANCE.growth.levels): опыт и уровень считаются, очков не дают.
    unspentPoints: (career.unspentPoints ?? 0) + (BALANCE.growth.levels ? level - career.level : 0),
    injuriesSeason: (career.injuriesSeason ?? 0) + (state.flags.includes('injured') ? 1 : 0),
    coachTrust: nextMatchCoachTrust(state.coachTrust),
    fanHype: nextMatchFanHype(state.fanHype),
    benched: benchAfterMatch(!!career.benched, state.coachTrust, summary),
    partnerBond: (career.partnerBond ?? 0) + (state.people?.partner ?? 0),
    matchesPlayed: career.matchesPlayed + 1,
    agentEcho: undefined,
    voiceCounts: { ...career.voiceCounts },
  };
  for (const [voice, count] of Object.entries(state.voices.counts) as [VoiceKey, number][]) {
    next.voiceCounts[voice] += count;
  }
  if (state.flags.includes('sent_off')) next.pendingSentOff = true;
  else if (state.flags.includes('booked')) next.careerYellows = career.careerYellows + 1;
  if (state.flags.includes('injured')) next.injuredMatches = Math.max(career.injuredMatches, 1);
  // К началу матча consumeStartPenalty оставляет в carriedFlags только отложенные флаги недели;
  // к ним добавляются флаги, дожившие до свистка этого матча.
  const fromMatch = CARRIED_FLAGS
    .filter((f) => state.flags.includes(f) && state.marks[f])
    .map((f) => ({ flag: f, mark: state.marks[f], ...(OPPONENT_BOUND_FLAGS.includes(f) ? { opponentKey } : {}) }));
  // Флаг из матча свежее отложенного с тем же id — отложенный выбрасываем, дублей не бывает.
  next.carriedFlags = [
    ...(career.carriedFlags ?? []).filter((f) => !fromMatch.some((m) => m.flag === f.flag)),
    ...fromMatch,
  ];
  return next;
}


/** Потратить очко уровня на атрибут. Без очков — карьера не меняется. */
export function spendPoint(career: Career, attr: Attribute): Career {
  if ((career.unspentPoints ?? 0) <= 0) return career;
  return {
    ...career,
    unspentPoints: career.unspentPoints - 1,
    attrPoints: { ...career.attrPoints, [attr]: (career.attrPoints[attr] ?? 0) + 1 },
  };
}
