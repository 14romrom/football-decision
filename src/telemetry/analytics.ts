// Аналітика (M49, план 17.10, старт 20.10 — під закритий тест: 15+ тестерів за два тижні дають перші дані
// з живих людей, а не з ботів `sim`). Один модуль подій, які відповідають на питання з DESIGN.md M49:
// де кидають гру (воронка й останній екран), чи працює баланс у живій грі (вибори в сценах), чи не
// перевантажене читання (час до вибору), що вимикають у налаштуваннях, чи не женуть паузи з гри, які
// помилки JS бачить лише WebView.
//
// **Модуль не знає, куди йдуть події.** Виклики стоять у грі вже зараз, а приймач підключається один раз
// (`setSink`): на телефоні — Firebase (ui/firebase.ts), у dev — консоль. Поки приймача немає, подія
// просто губиться: гра не тримає черги й не пише аналітику в localStorage — локальний лог рішень для
// тестерів (`telemetry/log.ts`) лишається окремим і повнішим.
//
// **Не збираємо:** імена, вільний текст, відповіді в «Y» дослівно, геолокацію. Параметри — ідентифікатори
// й числа; рядок довший за 100 знаків Firebase усе одно обріже, тому обрізаємо самі й одноманітно.

export type Params = Record<string, string | number | boolean | undefined>;
export type Sink = {
  event: (name: string, params: Record<string, string | number>) => void;
  screen: (name: string) => void;
  user: (props: Record<string, string>) => void;
};

let sink: Sink | null = null;
const userProps: Record<string, string> = {};

/** Приймач подій. Властивості гравця, задані раніше, йому віддаються одразу. */
export function setSink(s: Sink | null) {
  sink = s;
  if (s && Object.keys(userProps).length) s.user({ ...userProps });
}

/** Firebase: імена подій і параметрів — латиниця, цифри, `_`, до 40 знаків; значення-рядки — до 100. */
const NAME = /^[a-z][a-z0-9_]{0,39}$/;
function clean(params: Params): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || !NAME.test(k)) continue;
    out[k] = typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? Math.round(v * 100) / 100 : v.slice(0, 100);
  }
  return out;
}

export function track(name: string, params: Params = {}) {
  if (!NAME.test(name)) return;
  const p = clean(params);
  if (import.meta.env.DEV) console.debug('[analytics]', name, p);
  try { sink?.event(name, p); } catch { /* аналітика ніколи не валить гру */ }
}

/** Екран гри — наші назви, не роути: «останній екран перед виходом» читається тільки ними. */
let lastScreen = '';
export function screen(name: string) {
  if (name === lastScreen) return;
  lastScreen = name;
  if (import.meta.env.DEV) console.debug('[analytics] screen', name);
  try { sink?.screen(name); } catch { /* див. track */ }
}
export const currentScreen = () => lastScreen;

/** Властивості гравця (мова, збірка, канал, номер кар'єри): розріз для всіх подій. */
export function setUser(props: Record<string, string | number>) {
  for (const [k, v] of Object.entries(props)) if (NAME.test(k)) userProps[k] = String(v).slice(0, 36);
  try { sink?.user({ ...userProps }); } catch { /* див. track */ }
}

/** Хеш повідомлення помилки: текст може містити шлях чи дані, а групувати треба однакові. */
export function hashText(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Помилки JS усередині WebView: Android vitals їх не бачить (гра падає, а процес живий).
 *  Одна й та сама помилка — раз за сесію, інакше цикл рендеру заллє квоту подій. */
export function watchErrors() {
  const seen = new Set<string>();
  const report = (msg: string, where: string) => {
    const h = hashText(msg);
    if (seen.has(h)) return;
    seen.add(h);
    track('js_error', { hash: h, where, screen: lastScreen, head: msg.slice(0, 60) });
  };
  window.addEventListener('error', (e) => report(String(e.message ?? e.error ?? 'error'), 'error'));
  window.addEventListener('unhandledrejection', (e) => report(String((e.reason as Error)?.message ?? e.reason ?? 'rejection'), 'promise'));
}
