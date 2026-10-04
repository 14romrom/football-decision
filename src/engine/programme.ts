// Програмка матчу (19.09): брифинг в форме клубного вкладыша. Здесь — тексты, которые собираются из
// данных прозой, без чисел, кроме счёта и круглых вех: заметка о Реєсе «під прицілом» и фраза про
// черту соперника голосом клуба. Ирония сюда не заходит — програмку пишет пресс-служба.

import { FORMATION_BY_STRENGTH, type Strength } from './conditions';
import { coachGrip } from './career';
import { t, tf } from '../content/i18n';

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

const ORD = ['', t('перший'), t('другий'), t('третій'), t('четвертий'), t('п’ятий'), t('шостий'), t('сьомий'), t('восьмий'), t('дев’ятий'), t('десятий')];
const MILESTONE: Record<number, string> = { 10: t('Десятий матч за клуб.'), 25: t('Двадцять п’ятий матч за клуб.'), 50: t('П’ятдесятий матч за клуб.'), 100: t('Сотий матч за клуб.') };

function lastLine(i: ProgrammeInput): string {
  if (!i.last) return i.round === 1 ? ((i.seasonNumber ?? 1) >= 2 ? t('Перший матч у вищій лізі.') : t('Дебютує в сезоні.')) : '';
  const { scoreUs: a, scoreThem: b, opponentGen } = i.last;
  const score = tf('{0}:{1}', a, b);
  const kind = a > b ? t('перемоги') : a < b ? t('поразки') : t('нічиєї');
  const tail = a < b ? (b - a >= 3 ? t(' виходить із бажанням реабілітуватися') : t(' хоче відповісти')) : a > b ? t(' — на підйомі') : '';
  return tf('Після {0} {1} проти «{2}»{3}.', kind, score, opponentGen, tail);
}

function formLine(i: ProgrammeInput): string {
  if (i.scoringStreak >= 2 && i.scoringStreak <= 10) return tf('{0} матч поспіль із результативною дією.', ORD[i.scoringStreak].charAt(0).toUpperCase() + ORD[i.scoringStreak].slice(1));
  if (i.dryStreak >= 3) return t('Серія без результативних дій триває.');
  if (i.confidence >= 2) return t('Серія перемог за плечима.');
  if (i.confidence <= -2) return t('Серія поразок триває.');
  return '';
}

/** Дела недели, о которых прес-служба может знать: публичные. Зал, собака и сварка з партнером — не её дело
 *  (21.09, пользователь: програмка звучала как внутренняя сводка персонажа). */
const PUBLIC_ACTIVITIES = new Set(['academy_kids', 'school_masterclass', 'press_conf_proper', 'charity_team', 'autographs', 'podcast', 'big_interview', 'presser_before_them', 'fan_podcast', 'interview']);

function weekLine(i: ProgrammeInput): string {
  const acts = i.weekActivities.filter((a) => PUBLIC_ACTIVITIES.has(a.id)).slice(0, 1).map((a) => a.title.charAt(0).toLowerCase() + a.title.slice(1));
  if (acts.length === 0) return '';
  return tf('Цього тижня — {0}.', acts[0]);
}

/** Ставлення прес-служби дрейфує зі станом: до «свій» — нічого, далі — «улюбленець трибун», після зими — і про агента. */
function arcLine(i: ProgrammeInput): string {
  // Луна дзвінка (M15 — у відпустці): «улюбленець» — тільки зі стану 3, прес-служба не поспішає.
  const own = (i.arc ?? 1) >= 3 ? t('Улюбленець трибун. ') : '';
  if (i.agentEcho === 'leave') return own + t('Тренер: «Кажуть, улітку мало не пішов». Не питання.');
  if (i.agentEcho === 'stay') return own + t('Про літо тренер не сказав ні слова — це його спосіб сказати «дякую».');
  if (i.agentEcho === 'wait') return own + t('«До зими», — сказав тренер. Він теж чув.');
  if ((i.arc ?? 1) >= 4) return t('Улюбленець трибун. Улітку лишився.');
  if ((i.arc ?? 1) >= 3) return t('Улюбленець трибун.');
  return '';
}

function carryLine(i: ProgrammeInput): string {
  const c = i.carry;
  if (!c) return '';
  const bits = [c.sentOff ? t('Після вилучення в минулому турі') : c.yellows ? t('Три жовті за сезон — під наглядом') : '', c.injured ? t('грає після травми') : c.outOfForm ? t('літо минуло без передсезонки — форма не та') : ''].filter(Boolean);
  if (bits.length === 0) return '';
  const line = bits.join(', ');
  return line.charAt(0).toUpperCase() + line.slice(1) + '.';
}

// Довіра тренера — словами прес-служби про тренера, не оцінкою стану гравця.
function coachLine(i: ProgrammeInput): string {
  if (i.benched) return t('У заявці, починає на лаві.');
  if (i.coachTrust >= 70) return t('Тренер сумнівів не має.');
  if (i.coachTrust >= 45) return t('Тренер придивляється.');
  // Хватка тренера (26.09): гравець має бачити, що саме змінилося і чому — інакше «автобус» і чужі
  // стандарти читаються як випадковість. Голос той самий, прес-служби: факт, без оцінки.
  const grip = coachGrip(i.coachTrust);
  if (grip.noSetPieces) return t('Тренер, кажуть, дав останнє попередження: стандарти цього разу б’є інший.');
  if (grip.hold) return t('Тренер придивляється пильніше, ніж хотілося б: установка на матч — від оборони.');
  return t('Тренер, кажуть, дав останнє попередження.');
}

/** Заметка «Реєс» — 2–4 короткие фразы; каждая часть опциональна, пустые не оставляют дыр. */
export function programmeNote(i: ProgrammeInput): string {
  const parts = [lastLine(i), carryLine(i), formLine(i), MILESTONE[i.matchesPlayed + 1] ?? '', arcLine(i), weekLine(i), coachLine(i)].filter(Boolean);
  return parts.join(' ');
}

/** Мета клубу словами тренера (M14; регламент M19: двоє нагору, третє — стикові). Друга ліга, з 7-го туру:
 *  у двійці — «не відпускати», третє-четверте — «стики нікому не потрібні», нижче — «треба одне місце».
 *  Null — нічого не додаємо. */
export function coachGoalWord(seasonNumber: number, round: number, position: number, rounds: number): string | null {
  if (seasonNumber !== 1 || round < 7) return null;
  // Стикові (M19): тур поза кругом — тренер говорить не про таблицю, а про один матч.
  if (round > rounds) return t('І ще: «Таблиця закінчилася. Лишився один матч, і в ньому немає другого шансу».');
  const left = rounds - round + 1;
  const tail = left <= 1 ? t('Один матч.') : left === 2 ? t('Два тури.') : tf('{0} тури.', left);
  if (position <= 2) return left <= 1 ? t('І ще: «Ми в перших двох. До свистка це нічого не означає».') : tf('І ще: «Ми в перших двох. {0} Не відпускати».', tail);
  if (position <= 4) return tf('І ще: «Стики нікому не потрібні — ні їм, ні нам. {0} Перші двоє поруч».', tail);
  return tf('І ще: «Нам треба одне місце. Одне. {0} Я не прошу — я кажу».', tail);
}

/** Черта соперника голосом клуба: одна фраза, без модификаторов; `side` — «гостей» или «господарів». */
export const TRAIT_NOTE: Record<string, (side: string) => string> = {
  star: (s) => tf('Лідера {0} не відпускають ні на крок.', s),
  dribbler: (s) => tf('Дриблер {0}: за фінтами встигають не всі.', s),
  playmaker: (s) => tf('Плеймейкер {0} бачить кожну лінію.', s),
  veteran: (s) => tf('Ветеран в обороні {0} на фінти не купується.', s),
  youngster: (s) => tf('Молодий захисник {0} — перший сезон в основі.', s),
  hard: (s) => tf('Опорник {0} — сім карток за сезон.', s),
  rookie: (s) => tf('Новачок в обороні {0} ще шукає позицію.', s),
  target: (s) => tf('Здоровань в атаці {0} виграє повітря.', s),
  captain: (s) => tf('Капітан {0} говорить із суддями за двох.', s),
  local: (s) => tf('Улюбленець трибун {0} — стадіон за нього.', s),
};

/** Схема соперника в рубрике «Суперник» (M23, 26.09): на поле она рисовалась и ни на что не влияла, а для
 *  болельщика перед матчем это обычная строка программки. Голосом пресс-службы, без подсказок игроку:
 *  что означает схема, читатель знает сам. */
const FORMATION_NOTE: Record<string, string> = {
  '4-4-2': t('два форварди, дві лінії по чотири'),
  '4-2-3-1': t('два опорних, трійка за форвардом'),
  '4-3-3': t('трійка в центрі, вінгери високо'),
};
export function formationNote(strength: Strength): string {
  const f = FORMATION_BY_STRENGTH[strength];
  return tf('Схема — {0}: {1}.', f, FORMATION_NOTE[f]);
}

export function traitNote(traits: string[], venue: 'home' | 'away'): string | null {
  const side = venue === 'home' ? t('гостей') : t('господарів');
  for (const t of traits) if (TRAIT_NOTE[t]) return TRAIT_NOTE[t](side);
  return null;
}

/** Пасхалка (21.09, идея пользователя): у соперника 2-го туру першого сезону — Алекс Хантер, № 29, як у FIFA «The Journey»
 *  (номер у нього такий і на піку був — жартів про номер не робити); йому вже 32, і після Прем’єр-ліги, Лос-Анджелеса й
 *  Мадрида він у другій лізі. Прес-служба пише суху довідку — сміх у фактах. Сіль — персонаж забутий: лист-якір того ж
 *  тижня (`sc_hunter` у weekscenes.json) не пояснює, звідки обличчя знайоме; гравець знає, Реєс — ні, Тібо — «Хто?».
 *  Єдиний суперник з ім’ям — саме тому й помітний. Один раз за кар’єру. */
export const HUNTER = {
  programme: t('У їхньому складі — № 29 Алекс Хантер, 32 роки. У біографії — Прем’єр-ліга, Лос-Анджелес, Мадрид.'),
};

/** Тур Хантера: програмка перед 2-м туром першого сезону; лист того ж тижня — week.ts:ANCHOR_SCENES. */
export function hunterRound(seasonNumber: number, round: number): boolean {
  return seasonNumber === 1 && round === 2;
}
