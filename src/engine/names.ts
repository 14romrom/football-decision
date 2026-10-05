import { BASE_LANG, LANG, isBaseText, t, type Lang } from '../content/i18n';
// Подстановка имён в тексты контента. Имена партнёров и соперников не зашиты
// в эпизоды: в карьере команда сменится, а эпизод должен остаться.
// Падежи хранятся в ростере, потому что «віддати {partner.dat}» иначе не собрать.

/** Формы падежей. У соперников это не фамилия, а характеристика («їхній ветеран»,
 *  «молодий вінгер») — тестеры просили не запоминать чужих; своих — наоборот, больше.
 *  trait — механика и текст под характеристику: флаг them_<trait> на матч, см. match.ts. */
export type NameForms = {
  nom: string; gen: string; dat: string; ins: string; trait?: string;
  /** Другие имена той же роли (характеристика та же, слова другие): «їхній чорнороб» / «їхній
   *  опорник» / «їхній шостий». Выбирается раз на матч (rosterFor с rng) — плейтест 17.09:
   *  одна характеристика на ~90 упоминаний в текстах повторяется до тошноты. */
  variants?: NameForms[];
};

export type TeamRoster = {
  name: { nom: string; gen: string };
  players: Record<string, NameForms>;
  /** Ключи игроков, чьи фамилии попадают в ленту как авторы голов. */
  scorers: string[];
  /** Воротарь соперника — без имени, но со скрытой звичкою: divesEarly / staysBig / nearPost / comesOut.
   *  Флаг keeper_<trait> на матч; игрок узнаёт её только через чтение (keeper_read). */
  keeper?: { trait: string };
};

export type Roster = {
  us: TeamRoster; them: TeamRoster;
  /** Той самий ростер базовою мовою контенту. Його чіпляє мовний шар (`content/index.ts`) і
   *  **тільки** коли збірка не базова: у базовій мові поля немає, і код іде тим самим шляхом, що
   *  до M47. Навіщо: переклад частковий, і в неперекладене речення треба підставити ім'я його ж
   *  мовою, інакше виходить «Their dribbler б'є з-за штрафного» — переклад змінив уже написаний
   *  текст. Рішення «яким ростером» ухвалює `langOf`, а не рушій: мов рушій не знає. */
  base?: Roster;
};

const CASES = new Set(['nom', 'gen', 'dat', 'ins']);
// Ключи с цифрой (cb2) — тоже плейсхолдеры: плейтест 17.09 показал в ленте сырой «{cb2.gen}».
const PLACEHOLDER = /\{([a-z0-9]+(?:\.[a-z]+){0,2})\}/g;

/** `{partner}` → фамилия своего игрока; `{partner.dat}` — в дательном;
 *  `{them.striker.gen}` — игрок соперника; `{us}` / `{them.gen}` — названия команд.
 *  Неизвестный ключ — ошибка, а не пустая строка: опечатка в контенте должна валить тест. */
/** Начало предложения: пусто перед плейсхолдером, или точка/знак и пробел, или открывающая лапка. */
const SENTENCE_START = /(^|[.!?…]\s+|«|\n\s*)$/;

/** `extra` — плейсхолдеры вне ростера ({scorer}, {score} в ленте): подставляются раньше имён
 *  и по тем же правилам заглавной буквы. */
/** Ростер мовою цього рядка. Потрібен там, де **код сам складає фразу навколо контенту** (рядок
 *  стартового свистка обертає репліку з `feed.json`): обгортка і начинка мусять бути однією мовою,
 *  інакше виходить «\"Valmara\" — \"Rio Seco\". Свисток.» — половина речення перекладена, половина ні. */
export const rosterIn = (text: string, roster: Roster): Roster =>
  (roster.base && isBaseText(text) ? roster.base : roster);

/** `extra` — плейсхолдери поза ростером. Якщо вставки залежать від мови (назви клубів у стрічці),
 *  передається **функція мови**: так викликач не знає про мови нічого, а вибір робить `langOf`. */
export type Extra = Record<string, string> | ((lang: Lang, roster: Roster) => Record<string, string>);

export function fillNames(text: string, roster: Roster, extra: Extra = {}): string {
  // Одна умова на весь проєкт: рядок базовою мовою отримує базові імена. Жодної назви мови тут
  // немає — її знає `langOf`, тому третя мова цього файлу не торкається.
  const useBase = !!roster.base && isBaseText(text);
  const r = useBase ? roster.base! : roster;
  const ex = typeof extra === 'function' ? extra(useBase ? BASE_LANG : LANG, r) : extra;
  return text.replace(PLACEHOLDER, (whole: string, path: string, offset: number) => {
    // {trigger.*} — след решения, подставляется реактивным эпизодом в момент показа.
    if (path.startsWith('trigger.')) return whole;
    const value = ex[path] ?? resolveName(path, r, whole);
    // Характеристики соперника пишутся с маленькой («їхній ветеран»), но в начале
    // предложения — с большой, как и фамилии. Фамилиям это ничего не меняет.
    return SENTENCE_START.test(text.slice(0, offset)) ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  });
}

function resolveName(path: string, roster: Roster, whole: string): string {
    const all = path.split('.');
    const side = all[0] === 'us' || all[0] === 'them' ? all[0] : null;
    const team = side ? roster[side] : roster.us;
    const parts = side ? all.slice(1) : all;

    if (side && parts.length === 0) return team.name.nom;
    if (side && parts.length === 1 && CASES.has(parts[0])) {
      return parts[0] === 'gen' ? team.name.gen : team.name.nom;
    }

    const player = team.players[parts[0]];
    const kase = parts[1] ?? 'nom';
    if (!player || !CASES.has(kase) || parts.length > 2) {
      throw new Error(t('неизвестный плейсхолдер ') + whole);
    }
    return player[kase as keyof NameForms] as string;
}

/** Характеристики игроков соперника (без дублей) — становятся флагами them_<trait> на матч. */
export function opponentTraits(team: TeamRoster): string[] {
  return [...new Set(Object.values(team.players).map((p) => p.trait).filter((t): t is string => !!t))];
}

/** Рекурсивно проходит по объекту контента и подставляет имена во все строки. */
export function fillNamesDeep<T>(value: T, roster: Roster): T {
  if (typeof value === 'string') return fillNames(value, roster) as T;
  if (Array.isArray(value)) return value.map((v) => fillNamesDeep(v, roster)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = fillNamesDeep(v, roster);
    return out as T;
  }
  return value;
}
