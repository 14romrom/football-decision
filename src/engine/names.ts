// Подстановка имён в тексты контента. Имена партнёров и соперников не зашиты
// в эпизоды: в карьере команда сменится, а эпизод должен остаться.
// Падежи хранятся в ростере, потому что «віддати {partner.dat}» иначе не собрать.

export type NameForms = { nom: string; gen: string; dat: string; ins: string };

export type TeamRoster = {
  name: { nom: string; gen: string };
  players: Record<string, NameForms>;
  /** Ключи игроков, чьи фамилии попадают в ленту как авторы голов. */
  scorers: string[];
};

export type Roster = { us: TeamRoster; them: TeamRoster };

const CASES = new Set(['nom', 'gen', 'dat', 'ins']);
const PLACEHOLDER = /\{([a-z]+(?:\.[a-z]+){0,2})\}/g;

/** `{partner}` → фамилия своего игрока; `{partner.dat}` — в дательном;
 *  `{them.striker.gen}` — игрок соперника; `{us}` / `{them.gen}` — названия команд.
 *  Неизвестный ключ — ошибка, а не пустая строка: опечатка в контенте должна валить тест. */
export function fillNames(text: string, roster: Roster): string {
  return text.replace(PLACEHOLDER, (whole: string, path: string) => {
    // {trigger.*} — след решения, подставляется реактивным эпизодом в момент показа.
    if (path.startsWith('trigger.')) return whole;
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
      throw new Error('неизвестный плейсхолдер {' + path + '}');
    }
    return player[kase as keyof NameForms];
  });
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
