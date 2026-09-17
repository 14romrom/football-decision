// Модель данных прототипа. Здесь нет React и нет случайности —
// всё, что ниже, должно одинаково работать в браузере и в балансном прогоне.

/** Десять атрибутов в трёх группах — техника, физика, голова (схема Football Manager,
 *  игроки её узнают). Модификатор к броску считается из значения, см. ATTR_MOD. */
export type Attribute =
  | 'finishing' | 'passing' | 'dribbling' | 'first_touch'
  | 'pace' | 'strength' | 'stamina'
  | 'composure' | 'vision' | 'positioning';

export const ATTRIBUTE_GROUPS: { title: string; attrs: Attribute[] }[] = [
  { title: 'Техніка', attrs: ['finishing', 'passing', 'dribbling', 'first_touch'] },
  { title: 'Фізика', attrs: ['pace', 'strength', 'stamina'] },
  { title: 'Голова', attrs: ['composure', 'vision', 'positioning'] },
];

export const ATTRIBUTE_LABEL: Record<Attribute, string> = {
  finishing: 'удар', passing: 'пас', dribbling: 'дриблінг', first_touch: 'перший дотик',
  pace: 'швидкість', strength: 'корпус', stamina: 'витривалість',
  composure: 'холоднокровність', vision: 'бачення поля', positioning: 'позиція',
};

export type Player = {
  name: string;
  position: 'CM' | 'AM' | 'ST' | 'LW';
  attrs: Record<Attribute, number>;   // 1..99, старт 45..65; модификатор — attrMod()
};

/** Форма риска: то, что игрок видит как ярлык, а движок — как таблицу порогов. */
export type Position = 'controlled' | 'risky' | 'desperate';
/** Масштаб результата: чем обернётся clean и чем обойдётся cost. */
export type Effect = 'limited' | 'standard' | 'great';
export type Tier = 'badFail' | 'fail' | 'cost' | 'clean';

export type TimelineEvent = {
  minute: number;
  kind: 'filler' | 'episode' | 'goalUs' | 'goalThem' | 'kickoff' | 'halftime' | 'fulltime';
  text: string;
  /** Заполняется только для kind==='episode' — по этим полям собирается пересказ. */
  episodeId?: string;
  optionId?: string;
  optionLabel?: string;
  tier?: Tier;
  effect?: Effect;
  recap?: string;
  past?: string;
  /** Этот эпизод напрямую привёл к голу соперника. */
  causedConcede?: boolean;
  /** Автор гола (kind goalUs/goalThem) — для протокола и бомбардиров сезона. */
  scorer?: string;
  /** Ироничная реплика по ситуации после исхода (см. engine/flavor.ts). */
  flavor?: string;
  /** Чей это голос — по условию реплики: КУРАЖ, ТІЛО, ТРЕНЕР, ТАБЛО, ГОДИННИК, СУДДЯ, ТРИБУНИ. */
  flavorVoice?: string;
  /** Чёткие теги результата («⚽ Гол!», «Втрата м'яча») — что конкретно произошло,
   *  отдельно от яруса броска (тот про качество попытки, не про итог). См. resolve.ts. */
  badges?: ResultBadge[];
};

export type ResultBadge = { icon: string; label: string; tone: 'good' | 'bad' | 'neutral' };

export type MatchStats = {
  goals: number; assists: number; keyPasses: number;
  losses: number; duelsWon: number; fouls: number;
};

/** След решения: какой поступок поставил флаг и когда. Реактивные эпизоды
 *  подставляют это в текст: «На {trigger.minute}-й ти {trigger.past}…». */
export type Mark = {
  minute: number; episodeId: string; optionId: string; past: string;
  /** Флаг принесён из прошлого матча (см. career.ts:carriedFlags) — текст говорит
   *  «ще минулого матчу», а не «на 34-й». */
  previousMatch?: boolean;
  /** Своя формулировка «когда»: флаг поставлен между матчами (week.ts) — «ще минулого тижня»,
   *  «ще три тури тому». Перекрывает previousMatch в {trigger.when}. */
  whenText?: string;
};

/** Память эпизодов на дистанции сезона: id → сколько матчей назад его играли (1 — прошлый).
 *  Вес в планировщике растёт с возрастом (см. balance.ts:memory), а не сбрасывается через два матча. */
export type EpisodeMemory = Record<string, number>;

/** Голос, который говорит с варианта. Его и Команда — из целей варианта,
 *  остальные — от атрибутов; громче говорит тот, кто сильнее (см. voiceAudible). */
export type VoiceKey = 'ego' | 'team' | 'composure' | 'vision' | 'instinct' | 'body';
export type Voice = { who: VoiceKey; line: string };

/** Флаг-последствие: строка модификатора, пока флаг стоит. Данные — content/flags.json. */
export type FlagRule = {
  id: string;
  label: string;
  value: number;
  attributes?: Attribute[];
  phases?: Episode['phase'][];
  /** Только на этих вариантах (id опции) — так свойство воротаря бьёт по манере удара,
   *  а не по атрибуту: «падає рано» помогает паненке, а не всем ударам. */
  options?: string[];
  /** Чья это поправка на экране броска; по умолчанию 'field' — флаги про других людей. */
  source?: 'player' | 'field';
};

/** Какие голоса слушали в этом матче: счётчик на recap и телеметрию,
 *  и текущая серия — сколько раз подряд слушали один и тот же голос
 *  (влияет на его громкость, см. voices.ts). */
export type VoiceTrace = {
  counts: Record<VoiceKey, number>;
  streak: { who: VoiceKey | null; count: number };
};

export type MatchState = {
  minute: number;
  scoreUs: number;
  scoreThem: number;
  stamina: number;        // 0..100, расходуется, не восстанавливается
  composureNow: number;   // 0..100, плавает по ходу матча
  coachTrust: number;     // 0..100, реакция тренера
  fanHype: number;        // 0..100, реакция трибун
  momentum: number;       // -3..+3, инерция последних эпизодов
  stats: MatchStats;
  flags: string[];        // 'tired', 'booked', 'hero_moment' и т.п.
  marks: Record<string, Mark>;   // flag → решение, которое его поставило
  voices: VoiceTrace;
  log: TimelineEvent[];
};

/** Что исход делает с состоянием. Все поля опциональны и складываются. */
export type ApplyEffect = {
  goal?: boolean;            // гол игрока
  teamGoal?: boolean;        // команда забила, но без твоей записи в протокол
  assist?: boolean;          // голевая передача игрока
  keyPass?: boolean;
  duelWon?: boolean;
  foul?: boolean;
  losses?: number;
  corner?: boolean;          // заработан стандарт, счёт не меняется
  counterAttack?: boolean;   // контратака соперника: шанс пропустить
  concede?: boolean;         // гол в ответ гарантированно
  /** Ключ игрока ростера (partner/striker/cb/dm/keeper — для assist/teamGoal;
   *  striker/winger/mid — для concede), который назван в тексте исхода. Без этого
   *  лента объявляет гол случайным именем из scorers — оно может не совпасть
   *  с тем, кого текст уже назвал. См. resolve.ts:resultBadges и match.ts:pushGoal. */
  scorer?: string;
  stamina?: number;          // дополнительный расход/экономия сверх staminaCost
  coachTrust?: number;
  fanHype?: number;
  composure?: number;
  momentum?: number;         // сверх автоматического сдвига по tier
  addFlags?: string[];
  removeFlags?: string[];
  /** Цепочка: этот исход сразу ведёт в следующее решение в том же слоте (id эпизода).
   *  Заробив пенальті → б’єш; обіграв → удар. Лимиты — BALANCE.match.chain. */
  followUp?: string;
  /** Что применить сверх основного apply, если цепочка не сработала (лимит или звено уже
   *  сыграно): исход обязан быть самодостаточным — «суддя свистить пенальті» без удара
   *  игрока означает, что б’є {striker}. */
  followUpElse?: ApplyEffect;
};

export type Outcome = {
  /** 1–2 предложения, второе лицо. Это то, что читает игрок сразу после броска. */
  text: string;
  /** Короткая клауза для пересказа: «и попал в перекладину». Без неё пересказ
   *  вырождается в список, а он — главный проверяемый артефакт прототипа. */
  recap: string;
  apply?: ApplyEffect;
};

export type EpisodeOption = {
  id: string;
  label: string;
  /** Тот же поступок в прошедшем времени: «пошёл в обводку». Для пересказа. */
  past: string;
  attribute: Attribute;
  basePosition: Position;
  effect: Effect;
  staminaCost: number;               // 2..12
  goals: { team: 0 | 1 | 2 | 3; personal: 0 | 1 | 2 | 3 };
  /** Кто и что говорит с этого варианта. Слышно, только если голос сильный. */
  voice?: Voice;
  /** Вариант виден только при флагах: «по підказці» — когда воротаря прочитали.
   *  Безусловных вариантов у эпизода всё равно 3–4 (тест). */
  requires?: { flags?: string[]; notFlags?: string[] };
  /** Голос бачить (Disco Elysium, пассивная проверка): сильный атрибут замечает в сцене
   *  деталь, которой нет в сетапе, — и только из-за неё появляется этот вариант. Игрок со
   *  слабым Баченням кнопки не увидит и не узнает, что она была. `line` — что голос увидел,
   *  факт, не совет; показывается над вариантами. Порог — BALANCE.insightMinMod, см. voices.ts:voiceSees. */
  insight?: Voice;
  /** Пятый исход — критический успех (20 на кубиках). Без него берётся clean с системным бонусом. */
  outcomes: Record<Tier, Outcome> & { crit?: Outcome };
};

/** Условие «по ситуации» — общее для реплик (flavor.json) и вариантов сетапа (Episode.setups).
 *  Проверяется в момент показа, см. flavor.ts:matchesSituation. */
export type SituationWhen = {
  tier?: Tier;
  score?: 'leading' | 'trailing' | 'level';
  minMinute?: number;
  maxMinute?: number;
  tired?: boolean;
  booked?: boolean;
  lowTrust?: boolean;
  momentumMin?: number;
  momentumMax?: number;
  venue?: 'home' | 'away' | 'neutral';
  weather?: 'clear' | 'rain' | 'heat' | 'wind';
  strength?: 'strong' | 'even' | 'weak';
  flags?: string[];
  /** Семья и фаза сцены — чтобы реплика после броска знала, что это был пенальті, а не
   *  «какой-то удар». Сетапы своей семьи не знают — ключи только для flavor.json. */
  family?: string;
  phase?: Episode['phase'];
};

/** Вариант вводного текста под ситуацию. Опции и исходы у эпизода одни, а читается
 *  он по-разному: та же механика на 88-й при 0:1 и на 7-й при 0:0 — разные сцены. */
export type SetupVariant = { when: SituationWhen; text: string };

export type Episode = {
  id: string;
  phase: 'attack' | 'defense' | 'transition' | 'setpiece';
  weight: number;
  /** flags — реактивный эпизод: не планируется заранее, всплывает, когда флаги стоят.
   *  score — эпизод имеет смысл только при таком счёте (затяжка времени — при преимуществе);
   *  проверяется в момент показа, как notFlags, планировщик счёта не знает. */
  requires?: {
    minMinute?: number; maxMinute?: number; notFlags?: string[]; flags?: string[];
    score?: 'leading' | 'trailing' | 'level';
  };
  setup: string;
  /** Вариации сетапа по ситуации; побеждает самое конкретное подходящее правило,
   *  иначе — `setup`. Имена подставляются так же, как в setup. */
  setups?: SetupVariant[];
  options: EpisodeOption[];
  /** Звено цепочки: не планируется и не всплывает, а только следует за исходом
   *  с apply.followUp (модуль завершения, удар пенальті). В тексте допустим {trigger.past}
   *  предыдущего звена. */
  followUpOnly?: boolean;
  /** Семья ситуаций (penalty, free_kick, corner_attack…) — память сезона давит семью
   *  слабее, чем id: два пенальти подряд в разных сценах — всё равно «опять пенальті». */
  family?: string;
};

/** Одна строка «почему бросок вышел таким» — показывается игроку после броска. */
/** Откуда поправка: 'player' — атрибут, голос, своё состояние; 'field' — соперник, погода,
 *  трибуны, партнёры, воротар. Экран броска красит их по-разному (плейтест 17.09:
 *  «показать роль кубика, игрока и ситуации на поле»). */
export type ModSource = 'player' | 'field';
export type ModLine = { label: string; value: number; source: ModSource };

export type Resolution = {
  rawRoll: number;          // что выпало на кубиках
  /** Две грани 2d10 — для экрана броска. Сумма всегда равна rawRoll. */
  dice: [number, number];
  roll: number;             // то же; поле оставлено для телеметрии
  attrMod: number;
  mods: ModLine[];          // контекстные модификаторы, включая attrMod-строку
  totalScore: number;
  position: Position;       // итоговая, после сдвигов
  basePosition: Position;
  effect: Effect;           // итоговый, после сдвигов
  tier: Tier;
  /** Катастрофа или критический успех по сырым кубикам — независимо от модификаторов. */
  critical: 'fail' | 'success' | null;
};
