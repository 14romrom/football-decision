// Програмка матчу (19.09): брифинг в форме клубного вкладыша. Здесь — тексты, которые собираются из
// данных прозой, без чисел, кроме счёта и круглых вех: заметка о Реєсе «під прицілом» и фраза про
// черту соперника голосом клуба. Ирония сюда не заходит — програмку пишет пресс-служба.

export type ProgrammeInput = {
  /** Тур, который предстоит (1-based). */
  round: number;
  /** Номер сезону (M14): другий — вища ліга. */
  seasonNumber?: number;
  /** Прошлый матч: счёт и соперник в родительном («проти «Ольвара»»). */
  last?: { scoreUs: number; scoreThem: number; opponentGen: string } | null;
  /** Тонус из условий матча: −2…+2. */
  confidence: number;
  /** Сколько матчей подряд с результативной дией / без неё (0 — нет серии). */
  scoringStreak: number;
  dryStreak: number;
  /** Дела прошлого тижня, в порядке дней; в програмку попадают только публичные (PUBLIC_ACTIVITIES). */
  weekActivities: { id: string; title: string }[];
  coachTrust: number;
  /** Матчей за клуб до этого; веха — если этот матч круглый. */
  matchesPlayed: number;
  /** На лаві (M9): у заявці, але не в основі — виходить у другому таймі. */
  benched?: boolean;
  /** Стан арки (M13): «улюбленець трибун» — тільки з уст прес-служби, і тільки коли місто вже своє. */
  arc?: number;
  /** Луна зимового дзвінка (career.agentEcho) — перший матч нового сезону: тренер знає. */
  agentEcho?: 'leave' | 'stay' | 'wait';
  /** Перенесене з минулого туру (career.ts:CarryFacts): вилучення, картки, травма — фразою прес-служби. Службова
   *  сводка в підвалі програмки прибрана (21.09, пользователь: недоречно для формату, ніхто не читає). */
  carry?: { sentOff: boolean; yellows: boolean; injured: boolean; outOfForm?: boolean };
};

const ORD = ['', 'перший', 'другий', 'третій', 'четвертий', 'п’ятий', 'шостий', 'сьомий', 'восьмий', 'дев’ятий', 'десятий'];
const MILESTONE: Record<number, string> = { 10: 'Десятий матч за клуб.', 25: 'Двадцять п’ятий матч за клуб.', 50: 'П’ятдесятий матч за клуб.', 100: 'Сотий матч за клуб.' };

function lastLine(i: ProgrammeInput): string {
  if (!i.last) return i.round === 1 ? ((i.seasonNumber ?? 1) >= 2 ? 'Перший матч у вищій лізі.' : 'Дебютує в сезоні.') : '';
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

/** Дела недели, о которых прес-служба может знать: публичные. Зал, собака и сварка з партнером — не её дело
 *  (21.09, пользователь: програмка звучала как внутренняя сводка персонажа). */
const PUBLIC_ACTIVITIES = new Set(['academy_kids', 'school_masterclass', 'press_conf_proper', 'charity_team', 'autographs', 'podcast', 'big_interview', 'presser_before_them', 'fan_podcast', 'interview']);

function weekLine(i: ProgrammeInput): string {
  const acts = i.weekActivities.filter((a) => PUBLIC_ACTIVITIES.has(a.id)).slice(0, 1).map((a) => a.title.charAt(0).toLowerCase() + a.title.slice(1));
  if (acts.length === 0) return '';
  return `Цього тижня — ${acts[0]}.`;
}

/** Ставлення прес-служби дрейфує зі станом: до «свій» — нічого, далі — «улюбленець трибун», після зими — і про агента. */
function arcLine(i: ProgrammeInput): string {
  // Луна дзвінка (M15 — у відпустці): «улюбленець» — тільки зі стану 3, прес-служба не поспішає.
  const own = (i.arc ?? 1) >= 3 ? 'Улюбленець трибун. ' : '';
  if (i.agentEcho === 'leave') return `${own}Тренер: «Кажуть, улітку мало не пішов». Не питання.`;
  if (i.agentEcho === 'stay') return `${own}Про літо тренер не сказав ні слова — це його спосіб сказати «дякую».`;
  if (i.agentEcho === 'wait') return `${own}«До зими», — сказав тренер. Він теж чув.`;
  if ((i.arc ?? 1) >= 4) return 'Улюбленець трибун. Улітку лишився.';
  if ((i.arc ?? 1) >= 3) return 'Улюбленець трибун.';
  return '';
}

function carryLine(i: ProgrammeInput): string {
  const c = i.carry;
  if (!c) return '';
  const bits = [c.sentOff ? 'Після вилучення в минулому турі' : c.yellows ? 'Три жовті за сезон — під наглядом' : '', c.injured ? 'грає після травми' : c.outOfForm ? 'літо минуло без передсезонки — форма не та' : ''].filter(Boolean);
  if (bits.length === 0) return '';
  const line = bits.join(', ');
  return line.charAt(0).toUpperCase() + line.slice(1) + '.';
}

// Довіра тренера — словами прес-служби про тренера, не оцінкою стану гравця.
function coachLine(i: ProgrammeInput): string {
  if (i.benched) return 'У заявці, починає на лаві.';
  if (i.coachTrust >= 70) return 'Тренер сумнівів не має.';
  if (i.coachTrust >= 45) return 'Тренер придивляється.';
  return 'Тренер, кажуть, дав останнє попередження.';
}

/** Заметка «Реєс» — 2–4 короткие фразы; каждая часть опциональна, пустые не оставляют дыр. */
export function programmeNote(i: ProgrammeInput): string {
  const parts = [lastLine(i), carryLine(i), formLine(i), MILESTONE[i.matchesPlayed + 1] ?? '', arcLine(i), weekLine(i), coachLine(i)].filter(Boolean);
  return parts.join(' ');
}

/** Мета клубу словами тренера (M14, після звірки з STORY.md: «Мендонса говорив „трійка“ так, ніби це прізвище»).
 *  Друга ліга, з 7-го туру: у трійці — одне, поза нею — інше; далі за кількістю турів. Null — нічого не додаємо. */
export function coachGoalWord(seasonNumber: number, round: number, position: number, rounds: number): string | null {
  if (seasonNumber !== 1 || round < 7) return null;
  const left = rounds - round + 1;
  if (position <= 3) return left <= 1 ? 'І ще: «Ми в трійці. До свистка це нічого не означає».' : 'І ще: «Ми в трійці. Це нічого не означає до травня».';
  if (left <= 1) return 'І ще: «Трійка. Один матч. Я не прошу — я кажу».';
  return `І ще: «Трійка. Це не побажання, це завдання. ${left === 2 ? 'Два тури' : `${left} тури`} — і всі мають значення».`;
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

/** Пасхалка (21.09, идея пользователя): у соперника 2-го туру першого сезону — Алекс Хантер, № 29, як у FIFA «The Journey»;
 *  йому вже 32, і після Прем’єр-ліги, Лос-Анджелеса й Мадрида він у другій лізі. Прес-служба пише суху довідку —
 *  сміх у фактах; зошит не пояснює, звідки обличчя знайоме: гравець знає, Реєс — ні, Тібо — тим паче (сіль: персонаж забутий). Єдиний суперник з ім’ям —
 *  саме тому й помітний. Один раз за кар’єру, без сцени і без кубика. */
export const HUNTER = {
  programme: 'У їхньому складі — № 29 Алекс Хантер, 32 роки. У біографії — Прем’єр-ліга, Лос-Анджелес, Мадрид.',
  notebook: 'Їхній двадцять дев’ятий — Алекс Хантер, тридцять два. У програмці — Мадрид і Лос-Анджелес, на полі — друга ліга й номер із кінця заявки: життя його добряче поносило. Обличчя знайоме до дрібниць, і жодної гадки, звідки — наче бачив сотню разів і жодного разу наживо. Спитав Тібо. Тібо знизав плечима: «Хто?»',
};

/** Тур Хантера: програмка перед 2-м туром першого сезону й зошит того ж тижня (після 2-го туру). */
export function hunterRound(seasonNumber: number, round: number): boolean {
  return seasonNumber === 1 && round === 2;
}
