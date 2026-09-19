// Настройки устройства (19.09, экран «Налаштування») — один ключ на устройство, не по слоту:
// барабан кубика, вибрация на штампе, меньше движения, размер текста. Применяются классами на
// <html> (applySettings), чтобы CSS и RollView читали одно и то же место. Здесь же память реплик
// титула — она тоже общая для всех карьер.

export type Settings = {
  /** «барабан» — цифры бегут и замедляются; «одразу» — кубики стоят сразу, паузы драматургии остаются. */
  dice: 'reel' | 'instant';
  /** Вибрация на штампе вердикта (navigator.vibrate — есть в Android WebView, на iOS молчит). */
  haptics: boolean;
  /** Дублирует системный prefers-reduced-motion: на Android его мало кто находит. */
  reduceMotion: boolean;
  textSize: 'normal' | 'large';
};

const KEY = 'football-decision.settings.v1';
const TITLE_SEEN_KEY = 'football-decision.title-seen.v1';
const TITLE_SEEN_KEEP = 24;

export const DEFAULT_SETTINGS: Settings = { dice: 'reel', haptics: true, reduceMotion: false, textSize: 'normal' };

export function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* приватный режим */ }
  applySettings(s);
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
