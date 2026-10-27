import { readSettings } from '../telemetry/settings';
import type { Tier } from '../engine/types';

// Звуки гри (17.10, макет «Звуки», затверджено: кидок, катастрофа, критичний успіх, листи й тиждень).
// Кидок, штамп, папір і олівець синтезуються Web Audio прямо тут, без файлів. Матч — записами
// (public/sounds/*.ogg, 850 КБ, джерела й ліцензії — public/sounds/SOURCES.txt): свисток, удар,
// сітка, рев на гол (друга / вища ліга), «у-у», свист трибун і гул стадіону. Рева на чужий гол немає
// навмисно (рішення користувача 17.10): тоді треба розводити дім і виїзд, а запис був слабкий.
// Де тиша навмисно: ESPM, «Y» і дошка аналітика — чужі екрани; прожектори першого матчу.
// «Менше руху» звуків не вимикає — це окремий перемикач «Звуки» в налаштуваннях.
// Тема меню (17.10, «Hired Hand», вибір користувача) — безперервна петля поза матчем, свій перемикач «Музика».

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const noiseBuf: Record<string, AudioBuffer> = {};
const files: Record<string, Promise<AudioBuffer | null>> = {};
let amb: { s: AudioBufferSourceNode; g: GainNode } | null = null;

/** Контекст створюється ліниво на першому звуці: браузер дозволяє звук лише після дотику гравця. */
function ac(): AudioContext | null {
  if (!readSettings().sound) return null;
  return context();
}
/** Сам контекст — без перевірки «Звуків»: музика вмикається своїм перемикачем. */
function context(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function noise(c: AudioContext, kind: 'white' | 'brown' | 'pink', sec = 2): AudioBuffer {
  const key = kind + sec;
  if (noiseBuf[key]) return noiseBuf[key];
  const n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  let last = 0, p0 = 0, p1 = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (kind === 'pink') { p0 = 0.99765 * p0 + w * 0.099; p1 = 0.963 * p1 + w * 0.2965; p2 = 0.57 * p2 + w * 1.0527; d[i] = (p0 + p1 + p2 + w * 0.1848) * 0.2; }
    else d[i] = w;
  }
  return (noiseBuf[key] = b);
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

type Burst = { kind?: 'white' | 'brown' | 'pink'; type?: BiquadFilterType; f?: number; q?: number; a?: number; d?: number; peak?: number };
function burst(c: AudioContext, t: number, { kind = 'white', type = 'bandpass', f = 2000, q = 1, a = 0.002, d = 0.05, peak = 0.3 }: Burst = {}) {
  const s = c.createBufferSource(); s.buffer = noise(c, kind, 2);
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = c.createGain(); env(g, t, a, peak, d);
  s.connect(fl).connect(g).connect(master!);
  s.start(t, Math.random() * 1.5); s.stop(t + a + d + 0.05);
}

type Tone = { f?: number; f2?: number; type?: OscillatorType; a?: number; d?: number; peak?: number };
function tone(c: AudioContext, t: number, { f = 440, f2, type = 'sine', a = 0.003, d = 0.2, peak = 0.3 }: Tone = {}) {
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  const g = c.createGain(); env(g, t, a, peak, d);
  o.connect(g).connect(master!); o.start(t); o.stop(t + a + d + 0.05);
}

const at = (c: AudioContext, delaySec = 0) => c.currentTime + 0.02 + delaySec;

/** Зведення гучності (18.10, замір кожного звуку офлайн-рендером через цей самий модуль: найгучніші
 *  0,4 с, дБ повної шкали). До зведення розкид був 43 дБ: барабан −56, клац −54, тема меню −51 —
 *  майже не чути; свистки й рев вищої ліги −12…−14 — перекрикували все. Рівні за роллю звуку:
 *  події матчу (свисток, гол, «у-у», штанга, штамп) ≈ −20; кубики й удари ≈ −26…−28; інтерфейс
 *  (лист, клац, олівець) ≈ −34…−36; фон (тема й гул) ≈ −30…−32, на 10–12 дБ під подіями.
 *  Синтез зводиться множником шини: `burst`/`tone` беруть `master` у мить виклику. */
function scaled(c: AudioContext, k: number, fn: () => void) {
  const prev = master; if (!prev) return;
  const g = c.createGain(); g.gain.value = k; g.connect(prev);
  master = g;
  try { fn(); } finally { master = prev; }
}

/** Барабан: сухий тріск, як у колеса лотереї, поки грані перебираються. */
export function sfxReel(durSec: number) {
  const c = ac(); if (!c) return;
  const t = at(c);
  scaled(c, 12, () => { for (let x = 0; x < durSec; x += 0.06) burst(c, t + x + Math.random() * 0.006, { f: 2600 + Math.random() * 1400, q: 6, d: 0.012, peak: 0.12 }); });
}

/** Кубик ліг — у момент зупинки, кожен окремо. */
export function sfxDie() {
  const c = ac(); if (!c) return;
  const t = at(c);
  scaled(c, 1.6, () => {
    tone(c, t, { f: 210, f2: 95, d: 0.09, peak: 0.45 });
    burst(c, t, { f: 1300, q: 1.5, d: 0.04, peak: 0.35 });
    burst(c, t + 0.05, { f: 2200, q: 4, d: 0.02, peak: 0.08 });
    burst(c, t + 0.09, { f: 2400, q: 4, d: 0.015, peak: 0.04 });
  });
}

/** Затримка повного удару штампа після легкого дотику — картинка штампа лягає під неї (RollView). */
export const STAMP_LEAD = 0.15;

/** Монета лягає в суму (27.10, жетони «на кубик»). Метал — негармонійні обертони з коротким згасанням:
 *  плюс вище й дзвінкіше, мінус нижче, глухіше і з легким спадом висоти, навичка — повніша, з низьким ударом.
 *  Рівень — як у кубиків (−26…−28 дБ): це подія кидка, не інтерфейс. Відлік числа по одиниці мовчить. */
export function sfxCoin(kind: 'plus' | 'minus' | 'skill') {
  const c = ac(); if (!c) return;
  const t = at(c);
  scaled(c, 0.9, () => {
    if (kind === 'plus') {
      [1, 2.32, 4.25, 6.8].forEach((m, i) => tone(c, t, { f: 1760 * m, d: 0.22 / (1 + i * 0.6), peak: 0.16 / (1 + i * 0.7) }));
      burst(c, t, { f: 6500, q: 2, d: 0.012, peak: 0.12 });
    } else if (kind === 'minus') {
      [1, 2.32, 4.25].forEach((m, i) => tone(c, t, { f: 980 * m, f2: 900 * m, d: 0.13 / (1 + i * 0.8), peak: 0.17 / (1 + i * 1.1) }));
      burst(c, t, { type: 'lowpass', f: 1800, q: 0.7, d: 0.03, peak: 0.16 });
    } else {
      tone(c, t, { f: 180, f2: 120, d: 0.08, peak: 0.25 });
      [1, 2.32, 4.25, 6.8].forEach((m, i) => tone(c, t + 0.005, { f: 1320 * m, d: 0.4 / (1 + i * 0.5), peak: 0.15 / (1 + i * 0.6) }));
      burst(c, t, { f: 5200, q: 2, d: 0.015, peak: 0.12 });
    }
  });
}

function thump(c: AudioContext, t: number, low: number, peak: number, len: number) {
  tone(c, t, { f: low * 2, f2: low, d: len, peak });
  burst(c, t, { type: 'lowpass', f: 900, q: 0.7, d: 0.06, peak: peak * 0.8 });
  burst(c, t + 0.004, { f: 3200, q: 0.8, d: 0.03, peak: peak * 0.25 });
}
function bell(c: AudioContext, t: number, freqs: number[], peak: number, d: number) {
  freqs.forEach((f, i) => tone(c, t + i * 0.012, { f, d, peak: peak / (1 + i * 0.4), a: 0.004 }));
}
/** Трибуна видихає — тільки під катастрофу, як у сцені «Катастрофа» макета. */
function groan(c: AudioContext, t: number) {
  const s = c.createBufferSource(); s.buffer = noise(c, 'pink', 4); s.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.6;
  bp.frequency.setValueAtTime(1100, t); bp.frequency.linearRampToValueAtTime(380, t + 2.05);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.15);
  g.gain.setValueAtTime(0.35, t + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.05);
  const trem = c.createGain(); trem.gain.value = 0.75;
  const lfo = c.createOscillator(); lfo.frequency.value = 5.5; const lg = c.createGain(); lg.gain.value = 0.25; lfo.connect(lg).connect(trem.gain);
  s.connect(bp).connect(trem).connect(g).connect(master!); s.start(t); lfo.start(t);
  s.stop(t + 2.15); lfo.stop(t + 2.15);
}

/** Штамп ісходу: чотири ваги, як чотири ісходи, і золотий дзвін на криті.
 *  «Ту-ду» (27.10, макет «Жетони на кубик», рішення користувача — для всіх ісходів): легкий дотик
 *  штампа, за 150 мс — повний удар. Ісход чути вагою другої долі, характер штампа однаковий. */
export function sfxStamp(tier: Tier, crit: boolean) {
  const c = ac(); if (!c) return;
  const t0 = at(c);
  const t = t0 + STAMP_LEAD;
  const k = crit ? 1.4 : tier === 'badFail' ? 1.1 : 1.6;
  scaled(c, k, () => {
    tone(c, t0, { f: 150, f2: 96, d: 0.07, peak: 0.26 });
    burst(c, t0, { type: 'lowpass', f: 1300, q: 0.7, d: 0.035, peak: 0.2 });
    if (crit) { thump(c, t, 70, 0.6, 0.16); bell(c, t + 0.02, [880, 1318, 1760, 2637], 0.09, 1.6); return; }
    if (tier === 'clean') { thump(c, t, 70, 0.6, 0.16); bell(c, t + 0.01, [1318], 0.05, 0.35); }
    else if (tier === 'cost') thump(c, t, 62, 0.55, 0.16);
    else if (tier === 'fail') thump(c, t, 52, 0.5, 0.2);
    else { thump(c, t, 40, 0.75, 0.32); burst(c, t, { kind: 'brown', type: 'lowpass', f: 220, d: 0.6, peak: 0.5 }); groan(c, t + 0.35); }
  });
}

/** Лист: шерех паперу, ледве чутно. */
export function sfxPage() {
  const c = ac(); if (!c) return;
  const t = at(c);
  scaled(c, 3.2, () => {
    for (let i = 0; i < 5; i++) burst(c, t + i * 0.035 + Math.random() * 0.02, { type: 'highpass', f: 2500 + Math.random() * 2000, q: 0.7, a: 0.01, d: 0.05, peak: 0.05 });
    burst(c, t + 0.12, { f: 1200, q: 0.8, a: 0.03, d: 0.12, peak: 0.04 });
  });
}

/** Вибір варіанта — короткий клац, щоб було ясно: натиснуто. */
export function sfxClick() {
  const c = ac(); if (!c) return;
  const t = at(c);
  scaled(c, 10, () => {
    burst(c, t, { f: 3800, q: 2, d: 0.008, peak: 0.25 });
    tone(c, t, { f: 1600, d: 0.02, peak: 0.04 });
  });
}

/** Олівець у зошиті: справу обведено. */
export function sfxPencil() {
  const c = ac(); if (!c) return;
  const t = at(c);
  scaled(c, 5.5, () => { for (let x = 0; x < 0.42; x += 0.028) burst(c, t + x, { f: 4200 + Math.sin(x * 40) * 900, q: 3, a: 0.004, d: 0.025, peak: 0.05 + 0.03 * Math.sin(x * 22) ** 2 }); });
}

/** Клац, лист і олівець — одним делегованим слухачем, а не правками в кожному екрані: ті самі класи
 *  кнопок уже означають ті самі дії скрізь (варіант — `.choice`, «Далі» листа — `.nb-sheet-btn` /
 *  `.de-next`, справа тижня — `.nb-note`). Кнопки ESPM, «Y» і дошки цих класів не мають — там тиша. */
export function installUiSounds() {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    if (el.closest('.choice')) sfxClick();
    else if (el.closest('.nb-note')) sfxPencil();
    else if (el.closest('.nb-sheet-btn, .de-next')) sfxPage();
  }, { capture: true });
  // Браузер дає звук лише після дотику: перший дотик заодно запускає тему, якщо вона мала грати.
  document.addEventListener('pointerdown', () => {
    if (ctx?.state === 'suspended') void ctx.resume().then(refreshMusic); else refreshMusic();
  }, { capture: true });
  // Згорнули застосунок — тиша, гул не грає з кишені.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend(); else void ctx.resume();
  });
}

// ——— записи матчу ———————————————————————————————————————————————————————————
/** Файл вантажиться при першому звуці й кешується; немає файлу чи декодера — тиша, гра не падає. */
function buffer(c: AudioContext, name: string): Promise<AudioBuffer | null> {
  return (files[name] ??= fetch(`./sounds/${name}.ogg`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((b) => c.decodeAudioData(b)).catch(() => null));
}
function sfxFile(name: string, gain = 1, delaySec = 0) {
  const c = ac(); if (!c) return;
  void buffer(c, name).then((b) => {
    if (!b || !master) return;
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = b; g.gain.value = gain;
    s.connect(g).connect(master); s.start(c.currentTime + 0.02 + delaySec);
  });
}
const pick = (n: number) => 1 + Math.floor(Math.random() * n);

/** Удар по м'ячу — на кожну передачу поля; фоновий розіграш тихіше, щоб не заважав читати стрічку. */
export function sfxKick(gain = 0.8) { sfxFile(`ball_kick_${pick(3)}`, gain); }
/** Гол: сітка й рев трибун; вища ліга — великий стадіон. Чужий гол — тільки сітка. */
export function sfxGoal(ours: boolean, top: boolean) {
  sfxFile('net', 0.85);
  if (ours) sfxFile(top ? 'goal_us_top' : 'goal_us', top ? 0.47 : 0.67, 0.1);
}
/** Штанга чи поперечина — металевий удар у каркас воріт. */
export function sfxPost() { sfxFile('post', 1.2); }
/** «У-у» — удар мимо, сейв, блок. */
export function sfxOoh() { sfxFile(`crowd_ooh_${pick(2)}`, 0.55, 0.05); }
/** Свист трибун — рядки стрічки з поміткою `stands` (затягування, фол, аут на виїзді). */
export function sfxBoo() { sfxFile(`crowd_boo_${pick(2)}`, 0.5); }
export type Whistle = 'short' | 'start' | 'half' | 'final';
export function sfxWhistle(kind: Whistle) { sfxFile(`whistle_${kind}`, 0.35); }

/** Гул стадіону під матчем — окремий перемикач «Гул стадіону»: комусь він заважатиме читати. */
export function ambience(on: boolean) {
  const c = on && readSettings().crowd ? ac() : ctx;
  if (!c) return;
  if (!on || !readSettings().crowd || !readSettings().sound) {
    if (!amb) return;
    const a = amb; amb = null; const t = c.currentTime;
    a.g.gain.cancelScheduledValues(t); a.g.gain.setValueAtTime(a.g.gain.value, t); a.g.gain.linearRampToValueAtTime(0, t + 0.8);
    a.s.stop(t + 0.85);
    return;
  }
  if (amb) return;
  void buffer(c, 'stadium_ambience').then((b) => {
    if (!b || amb || !master) return;
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = b; s.loop = true;
    g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(0.47, c.currentTime + 1.5);
    s.connect(g).connect(master); s.start(); amb = { s, g };
  });
}

// ——— заставка ——————————————————————————————————————————————————————————————
/** Дочекатися, поки звук прокинеться (19.10, плейтест: «на заставці немає кубиків і шуму поля»). На
 *  холодному старті Android контекст створюється призупиненим, `resume()` асинхронний, а `sfxLaunch`
 *  перевіряв стан одразу — і заставка щоразу йшла в беззвучну версію. Чекаємо до `ms`; браузер без
 *  дотику так і не дасть грати — тоді false, як і раніше. */
export function audioReady(ms = 400): Promise<boolean> {
  const c = ac();
  if (!c) return Promise.resolve(false);
  if (c.state === 'running') return Promise.resolve(true);
  return new Promise((res) => {
    const t = window.setTimeout(() => res(c.state === 'running'), ms);
    c.resume().then(() => { window.clearTimeout(t); res(c.state === 'running'); }).catch(() => { window.clearTimeout(t); res(false); });
  });
}

/** Звук заставки за тим самим розкладом, що й `LaunchScreen`: гул трибуни здалеку (фільтр
 *  відкривається, поки підходиш ближче), барабан 1,6–2,6 с, стуки на 2,6 і 2,9 с, штамп на 3,3 с,
 *  трибуна коротко вскидається й за дві секунди гасне — у меню тиша. Повертає false, якщо звуку
 *  не буде (вимкнено в налаштуваннях або браузер не дав грати без дотику): тоді заставка показує
 *  беззвучну версію. `calm` («менше руху») — тільки штамп. */
export function sfxLaunch(calm: boolean): boolean {
  const c = ac();
  if (!c || c.state !== 'running') return false;
  const t0 = c.currentTime + 0.02;
  const stampAt = (t: number) => {
    tone(c, t, { f: 120, f2: 55, d: 0.2, peak: 0.7 });
    burst(c, t, { type: 'lowpass', f: 900, q: 0.7, d: 0.07, peak: 0.55 });
    burst(c, t + 0.004, { f: 3200, q: 0.8, d: 0.03, peak: 0.18 });
    tone(c, t + 0.015, { f: 1318, d: 0.5, peak: 0.05 });
  };
  // Ті самі множники зведення, що в матчі: барабан ×12, кубик ×1,6, штамп ×1,6.
  if (calm) { scaled(c, 1.6, () => stampAt(t0 + 0.3)); return true; }
  void buffer(c, 'stadium_ambience').then((b) => {
    if (!b || !master) return;
    const t = Math.max(c.currentTime, t0);
    const s = c.createBufferSource(), g = c.createGain(), lp = c.createBiquadFilter(); s.buffer = b; s.loop = true; lp.type = 'lowpass';
    lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(900, t0 + 3.1); lp.frequency.linearRampToValueAtTime(4000, t0 + 3.4); lp.frequency.linearRampToValueAtTime(1600, t0 + 4.8);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t0 + 1.6); g.gain.linearRampToValueAtTime(0.55, t0 + 3.4); g.gain.linearRampToValueAtTime(0.3, t0 + 4.7); g.gain.linearRampToValueAtTime(0, t0 + 6.8);
    s.connect(lp).connect(g).connect(master); s.start(t, 3); s.stop(t0 + 7);
  });
  scaled(c, 12, () => { for (let x = 0; x < 1.0; x += 0.06) burst(c, t0 + 1.6 + x + Math.random() * 0.006, { f: 2600 + Math.random() * 1400, q: 6, d: 0.012, peak: 0.12 }); });
  scaled(c, 1.6, () => {
    for (const at of [2.6, 2.9]) {
      tone(c, t0 + at, { f: 210, f2: 95, d: 0.09, peak: 0.45 });
      burst(c, t0 + at, { f: 1300, q: 1.5, d: 0.04, peak: 0.35 });
      burst(c, t0 + at + 0.05, { f: 2200, q: 4, d: 0.02, peak: 0.08 });
    }
  });
  // Штамп заставки збігається з підйомом трибуни — трохи тихіше, щоб пік не впирався в стелю.
  scaled(c, 1.25, () => stampAt(t0 + 3.3));
  return true;
}

// ——— тема меню ———————————————————————————————————————————————————————————————
/** Петля теми: файл починається з гітари — вступний стук трека (дев'ять ударів раз на секунду,
 *  1,2–9,1 с оригіналу) зрізано (18.10, користувач: «звук стуку м'яча в темі»). Перший раз тема
 *  грає з початку файла, далі — від LOOP_START до LOOP_END; шов (3 с перехресного згасання) вшито
 *  в кінець файла (scratchpad sfx/theme.py: S=9,3, a=9,5, b=170,5 — найдовша петля після стуку,
 *  тембр на шві 0,97). Повтор раз на 2 хв 28 с.
 *  18.10, вдруге: під гітарою лишалася ще одна серія стуку — низький удар раз на секунду з 14-ї секунди.
 *  Шматок 13,3–24,6 с вирізано зі склейкою 1,5 с (вибір користувача на слух із трьох варіантів), а все
 *  нижче 140 Гц прибрано: гітарі ця смуга майже не потрібна, а динаміки телефона її не відтворюють. */
/** Гучність теми (18.10, вдруге, «щоб не доводилося весь час крутити звук»): міряно інтегровано (LUFS,
 *  ffmpeg ebur128) — так, як вухо чує тривале звучання. Було 1.2: тема ≈ −16,8 LUFS, тобто гучна, як
 *  рев трибун на голі, але безперервно; гул матчу ≈ −25,7. Стало 0.65: тема ≈ −22 — на 3–4 дБ над гулом
 *  матчу й на 5–6 дБ під сплесками трибун. Перше зведення міряло найгучніші 0,4 с і через хвилі теми
 *  (тихі місця −31, наростання −14) недооцінило її середню гучність. */
// 18.10, втретє: тема тепер грає лише на моментах історії (`sceneMusic`), і тихий вступ без гітари
// (перші 12 с) з'їдав більшу частину кожного виходу. Файл — петля «від вступу гітари до вступу гітари»:
// 10,8 → 91,3 с попереднього файла (тембр на шві 0,91), склейка 1,5 с вшита на початок; 80,5 с.
const LOOP_START = 0, LOOP_END = 80.5, MUSIC_GAIN = 0.65;
let musicWanted = false;
/** Чи грає тема на цьому екрані (18.10, рішення користувача — «музика як подія, а не фон»; макет
 *  «Звукова карта кар'єри»). Тема лишається на титулі й моментах історії — пролог, глави, лист травня,
 *  відпустка, агент, фінал, — а в рутині (екран перед матчем, афіша, дошка, ESPM, «Y», зошит тижня)
 *  тиша й звуки самої гри. Було ≈ 167 хв теми за кар'єру, стало ≈ 31: тема більше не заважає читати
 *  й не встигає набриднути. Перехід — згасання за 2 с, повернення — наростання 2,5 с. */
let sceneMusic = true;
/** Відкрито матч: теми немає, хто б її не вмикав (порядок ефектів React тут не має значення). */
let inMatch = false;
let mus: { s: AudioBufferSourceNode; g: GainNode } | null = null;

/** Тема грає скрізь, крім матчу: титул, пролог, зошит, ESPM, «Y», дошка. Матч — гул стадіону. */
export function music(on: boolean) { musicWanted = on; refreshMusic(); }

/** Екран каже, чи потрібна на ньому тема (`sceneMusic`). */
export function musicScene(on: boolean) { if (sceneMusic === on) return; sceneMusic = on; refreshMusic(); }

/** Матч на екрані: тема поступається гулу стадіону; після матчу повертається лише там, де екран її хоче. */
export function matchAudio(on: boolean) { inMatch = on; ambience(on); refreshMusic(); }

/** Звести тему до бажаного стану: перемикач «Музика», чи має вона зараз грати, чи дозволив браузер. */
export function refreshMusic() {
  const want = musicWanted && sceneMusic && !inMatch && readSettings().music;
  const c = want ? context() : ctx;
  if (!want) {
    if (!mus || !c) return;
    const m = mus; mus = null; const t = c.currentTime;
    m.g.gain.cancelScheduledValues(t); m.g.gain.setValueAtTime(m.g.gain.value, t); m.g.gain.linearRampToValueAtTime(0, t + 2);
    m.s.stop(t + 2.1);
    return;
  }
  if (mus || !c || c.state !== 'running' || !master) return;
  void buffer(c, 'menu_theme').then((b) => {
    if (!b || mus || !master || !(musicWanted && sceneMusic && !inMatch && readSettings().music)) return;
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = b; s.loop = true; s.loopStart = LOOP_START; s.loopEnd = LOOP_END;
    g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(MUSIC_GAIN, c.currentTime + 2.5);
    s.connect(g).connect(master); s.start(); mus = { s, g };
  });
}
