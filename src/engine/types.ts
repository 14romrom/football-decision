// Модель данных прототипа. Здесь нет React и нет случайности —
// всё, что ниже, должно одинаково работать в браузере и в балансном прогоне.

export type Attribute =
  | 'finishing' | 'passing' | 'dribbling' | 'pace'
  | 'strength' | 'defending' | 'composure';

export type Player = {
  name: string;
  position: 'CM' | 'AM' | 'ST' | 'LW';
  attrs: Record<Attribute, number>;   // 1..99, старт 45..65
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
  /** Ироничная реплика по ситуации после исхода (см. engine/flavor.ts). */
  flavor?: string;
};

export type MatchStats = {
  goals: number; assists: number; keyPasses: number;
  losses: number; duelsWon: number; fouls: number;
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
  stamina?: number;          // дополнительный расход/экономия сверх staminaCost
  coachTrust?: number;
  fanHype?: number;
  composure?: number;
  momentum?: number;         // сверх автоматического сдвига по tier
  addFlags?: string[];
  removeFlags?: string[];
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
  outcomes: Record<Tier, Outcome>;
};

export type Episode = {
  id: string;
  phase: 'attack' | 'defense' | 'transition' | 'setpiece';
  weight: number;
  requires?: { minMinute?: number; maxMinute?: number; notFlags?: string[]; flags?: string[] };
  setup: string;
  options: EpisodeOption[];
};

/** Одна строка «почему бросок вышел таким» — показывается игроку после броска. */
export type ModLine = { label: string; value: number };

export type Resolution = {
  rawRoll: number;          // что выпало на кубике
  roll: number;             // после планки формы риска (DIE_FLOOR); это и показываем
  attrMod: number;
  mods: ModLine[];          // контекстные модификаторы, включая attrMod-строку
  totalScore: number;
  position: Position;       // итоговая, после сдвигов
  basePosition: Position;
  effect: Effect;           // итоговый, после сдвигов
  tier: Tier;
};
