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

export type Roster = { us: TeamRoster; them: TeamRoster };

const CASES = new Set(['nom', 'gen', 'dat', 'ins']);
// Ключи с цифрой (cb2) — тоже плейсхолдеры: плейтест 17.09 показал в ленте сырой «{cb2.gen}».
const PLACEHOLDER = /\{([a-z0-9]+(?:\.[a-z]+){0,2})\}/g;

/** `{partner}` → фамилия своего игрока; `{partner.dat}` — в дательном;
 *  `{them.striker.gen}` — игрок соперника; `{us}` / `{them.gen}` — названия команд.
 *  Неизвестный ключ — ошибка, а не пустая строка: опечатка в контенте должна валить тест. */
/** Начало предложения: пусто перед плейсхолдером, или точка/знак и пробел, или открывающая лапка. */
const SENTENCE_START = /(^|[.!?…]\s+|«|\n\s*)$/;

export function fillNames(text: string, roster: Roster): string {
  return text.replace(PLACEHOLDER, (whole: string, path: string, offset: number) => {
    // {trigger.*} — след решения, подставляется реактивным эпизодом в момент показа.
    if (path.startsWith('trigger.')) return whole;
    const value = resolveName(path, roster, whole);
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
      throw new Error('неизвестный плейсхолдер ' + whole);
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
