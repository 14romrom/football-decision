// Настройки устройства (19.09, экран «Налаштування») — один ключ на устройство, не по слоту:
// барабан кубика, вибрация на штампе, меньше движения, размер текста. Применяются классами на
// <html> (applySettings), чтобы CSS и RollView читали одно и то же место. Здесь же память реплик
// титула — она тоже общая для всех карьер.

import { track } from './analytics';

export type Settings = {
  /** «барабан» — цифры бегут и замедляются; «одразу» — кубики стоят сразу, паузы драматургии остаются. */
  dice: 'reel' | 'instant';
  /** Вибрация на штампе вердикта (navigator.vibrate — есть в Android WebView, на iOS молчит). */
  haptics: boolean;
  /** Звуки кидка, штампа, листів і зошита (ui/sound.ts, 17.10). Окремо від «менше руху». */
  sound: boolean;
  /** Гул стадіону під матчем (17.10) — окремо від «Звуків»: комусь він заважає читати. */
  crowd: boolean;
  /** Тема меню поза матчем (17.10) — окремо від «Звуків»: музику часто вимикають, звуки лишають. */
  music: boolean;
  /** Дублирует системный prefers-reduced-motion: на Android его мало кто находит. */
  reduceMotion: boolean;
  textSize: 'normal' | 'large';
  /** Підказки-прожектори першого матчу (M12); тестерам, що знають гру, — вимкнути. */
  hints: boolean;
  /** Мова контенту (M47). Головної версії немає: українська й англійська рівні. Читається один
   *  раз при завантаженні (content/i18n.ts), тому зміна вимагає перезавантаження сторінки. */
  lang: 'uk' | 'en';
  /** Сповіщення від людей з гри, поки гравця немає (M51). Діє лише з дозволом Android. */
  notify: boolean;
  /** Лист-прохання про дозвіл уже показано (після першого матчу) — більше не питаємо. */
  notifyAsked: boolean;
  /** Прохання про відгук (M51): `reviewDone` — натиснуто «Залишити відгук», більше ніколи;
   *  `reviewLaterAt` — коли натиснуто «Пізніше» (мс), знову не раніше ніж за 30 днів. */
  reviewDone: boolean;
  reviewLaterAt: number;
  /** Куплено «Без реклами» (M48). Правда — у Google Play; тут копія, яку `ui/ads.ts` звіряє на старті. */
  noAds: boolean;
};

const KEY = 'football-decision.settings.v1';
const TITLE_SEEN_KEY = 'football-decision.title-seen.v1';
const TITLE_SEEN_KEEP = 24;

// Мова за умовчанням — українська; на першому запуску її замінює мова пристрою (`deviceLang`).
export const DEFAULT_SETTINGS: Settings = { dice: 'reel', haptics: true, sound: true, crowd: true, music: true, reduceMotion: false, textSize: 'normal', hints: true, lang: 'uk', notify: true, notifyAsked: false, reviewDone: false, reviewLaterAt: 0, noAds: false };

export function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    if (typeof document === 'undefined') return DEFAULT_SETTINGS;   // тести й сим: мова не залежить від машини
    // Перший запуск: мова з пристрою, і одразу в сховище — далі вона не «пливе» за налаштуваннями телефона.
    const first = { ...DEFAULT_SETTINGS, lang: deviceLang() };
    localStorage.setItem(KEY, JSON.stringify(first));
    return first;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Мова пристрою для першого запуску (рішення користувача 18.10): українська й російська → українська,
 *  будь-яка інша → англійська. Дивимося лише першу мову системи — ту, якою людина читає телефон.
 *  До цього гра завжди стартувала українською, і гравець з англійської сторінки Play бачив незнайому
 *  мову в першу ж хвилину. Екрана вибору мови немає навмисно: зайвий крок перед заставкою. */
export function deviceLang(): Settings['lang'] {
  try {
    const first = ((navigator.languages && navigator.languages[0]) || navigator.language || '').toLowerCase();
    return /^(uk|ru)([-_]|$)/.test(first) ? 'uk' : 'en';
  } catch {
    return 'uk';
  }
}

/** Налаштування, які гравець міняє сам (M49): частка вимкненої музики — пряма відповідь, чи тема
 *  набридає. Службові поля (прохання, покупка) сюди не входять — у них свої події. */
const TRACKED: (keyof Settings)[] = ['dice', 'haptics', 'sound', 'crowd', 'music', 'reduceMotion', 'textSize', 'hints', 'lang', 'notify'];

export function writeSettings(s: Settings) {
  const prev = readSettings();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* приватный режим */ }
  applySettings(s);
  for (const k of TRACKED) if (prev[k] !== s[k]) track('settings_change', { key: k, value: String(s[k]) });
}

/** Классы на <html>: `reduce-motion` (CSS дублирует медиазапрос), `text-large` (zoom). */
export function applySettings(s: Settings = readSettings()) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
  document.documentElement.classList.toggle('text-large', s.textSize === 'large');
}

/** Движение выключено — настройкой или системой. */
export function motionReduced(): boolean {
  if (readSettings().reduceMotion) return true;
  return typeof window !== 'undefined' && 'matchMedia' in window && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Вибрация по вердикту: чистый — короткий, «але» — двойной, провал — длинный, катастрофа — в ладонь. */
export function vibrate(pattern: number | number[]) {
  if (!readSettings().haptics) return;
  try { navigator.vibrate?.(pattern); } catch { /* нет вибромотора */ }
}

export function titleSeen(): string[] {
  try {
    const raw = localStorage.getItem(TITLE_SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function rememberTitleLine(text: string) {
  try { localStorage.setItem(TITLE_SEEN_KEY, JSON.stringify([...titleSeen(), text].slice(-TITLE_SEEN_KEEP))); } catch { /* приватный режим */ }
}
