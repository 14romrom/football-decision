// Програмка матчу (19.09): брифинг в форме клубного вкладыша. Здесь — тексты, которые собираются из
// данных прозой, без чисел, кроме счёта и круглых вех: заметка о Реєсе «під прицілом» и фраза про
// черту соперника голосом клуба. Ирония сюда не заходит — програмку пишет пресс-служба.

export type ProgrammeInput = {
  /** Тур, который предстоит (1-based). */
  round: number;
  /** Прошлый матч: счёт и соперник в родительном («проти «Ольвара»»). */
  last?: { scoreUs: number; scoreThem: number; opponentGen: string } | null;
  /** Тонус из условий матча: −2…+2. */
  confidence: number;
  /** Сколько матчей подряд с результативной дией / без неё (0 — нет серии). */
  scoringStreak: number;
  dryStreak: number;
  /** Названия дел прошлого тижня, в порядке дней. */
  weekActivities: string[];
  coachTrust: number;
  /** Матчей за клуб до этого; веха — если этот матч круглый. */
  matchesPlayed: number;
  /** На лаві (M9): у заявці, але не в основі — виходить у другому таймі. */
  benched?: boolean;
  /** Стан арки (M13): «улюбленець трибун» — тільки з уст прес-служби, і тільки коли місто вже своє. */
  arc?: number;
};

const ORD = ['', 'перший', 'другий', 'третій', 'четвертий', 'п’ятий', 'шостий', 'сьомий', 'восьмий', 'дев’ятий', 'десятий'];
const MILESTONE: Record<number, string> = { 10: 'Десятий матч за клуб.', 25: 'Двадцять п’ятий матч за клуб.', 50: 'П’ятдесятий матч за клуб.', 100: 'Сотий матч за клуб.' };

function lastLine(i: ProgrammeInput): string {
  if (!i.last) return i.round === 1 ? 'Дебютує в сезоні.' : '';
  const { scoreUs: a, scoreThem: b, opponentGen } = i.last;
  const score = `${a}:${b}`;
  const kind = a > b ? 'перемоги' : a < b ? 'поразки' : 'нічиєї';
  const tail = a < b ? (b - a >= 3 ? ' виходить із бажанням реабілітуватися' : ' хоче відповісти') : a > b ? ' — на підйомі' : '';
  return `Після ${kind} ${score} проти «${opponentGen}»${tail}.`;
}

function formLine(i: ProgrammeInput): string {
  if (i.scoringStreak >= 2 && i.scoringStreak <= 10) return `${ORD[i.scoringStreak].charAt(0).toUpperCase() + ORD[i.scoringStreak].slice(1)} матч поспіль із результативною дією.`;
  if (i.dryStreak >= 3) return 'Серія без результативних дій триває.';
  if (i.confidence >= 2) return 'Серія перемог за плечима.';
  if (i.confidence <= -2) return 'Серія поразок триває.';
  return '';
}

function weekLine(i: ProgrammeInput): string {
  const acts = i.weekActivities.filter(Boolean).slice(0, 2).map((t) => t.charAt(0).toLowerCase() + t.slice(1));
  if (acts.length === 0) return 'Тиждень провів на базі.';
  return `Тиждень — ${acts.join(' та ')}.`;
}

/** Ставлення прес-служби дрейфує зі станом: до «свій» — нічого, далі — «улюбленець трибун», після зими — і про агента. */
function arcLine(i: ProgrammeInput): string {
  if ((i.arc ?? 1) >= 4) return 'Улюбленець трибун. Узимку лишився.';
  if ((i.arc ?? 1) >= 3) return 'Улюбленець трибун.';
  return '';
}

function coachLine(i: ProgrammeInput): string {
  if (i.benched) return 'У заявці, але починає на лаві.';
  if (i.coachTrust >= 70) return 'Місце в основі беззаперечне.';
  if (i.coachTrust >= 45) return 'В основі, але тренер дивиться уважно.';
  return 'Виходить з останнім попередженням.';
}

/** Заметка «Реєс» — 2–4 короткие фразы; каждая часть опциональна, пустые не оставляют дыр. */
export function programmeNote(i: ProgrammeInput): string {
  const parts = [lastLine(i), formLine(i), MILESTONE[i.matchesPlayed + 1] ?? '', arcLine(i), weekLine(i), coachLine(i)].filter(Boolean);
  return parts.join(' ');
}

/** Черта соперника голосом клуба: одна фраза, без модификаторов; `side` — «гостей» или «господарів». */
export const TRAIT_NOTE: Record<string, (side: string) => string> = {
  star: (s) => `Лідера ${s} не відпускають ні на крок.`,
  dribbler: (s) => `Дриблер ${s}: за фінтами встигають не всі.`,
  playmaker: (s) => `Плеймейкер ${s} бачить кожну лінію.`,
  veteran: (s) => `Ветеран в обороні ${s} на фінти не купується.`,
  youngster: (s) => `Молодий захисник ${s} — перший сезон в основі.`,
  hard: (s) => `Опорник ${s} — сім карток за сезон.`,
  rookie: (s) => `Новачок в обороні ${s} ще шукає позицію.`,
  target: (s) => `Здоровань в атаці ${s} виграє повітря.`,
  captain: (s) => `Капітан ${s} говорить із суддями за двох.`,
  local: (s) => `Улюбленець трибун ${s} — стадіон за нього.`,
};

export function traitNote(traits: string[], venue: 'home' | 'away'): string | null {
  const side = venue === 'home' ? 'гостей' : 'господарів';
  for (const t of traits) if (TRAIT_NOTE[t]) return TRAIT_NOTE[t](side);
  return null;
}
