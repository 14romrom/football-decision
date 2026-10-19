import type { Stage } from '../engine/feed';
import type { FinaleKind } from '../engine/finale';
import type { ActionBeat, ActionTemplate, ActionResult } from '../engine/action';
import type { Kit } from '../engine/names';
import { sfxBoo, sfxGoal, sfxKick, sfxOoh, sfxPost, sfxWhistle } from './sound';

// Режисер поля (17.10, макет «Постановка стрічки»). Поле — не схема на всі 105 метрів, а камера, що
// показує третину, де йде гра, і фішки у формах команд. Кожен рядок стрічки приходить із постановкою
// (engine/feed.ts:Stage: дія, зона, хто, чим скінчилось), і режисер розігрує саме її — інакше рядок
// «Тібо накриває розігруючого» і випадкові передачі на полі розходилися, і поле переставало читатися.
//
// Чому імперативно, а не станом React: камера — це viewBox, який CSS не анімує, а двадцять чотири
// фішки з м'ячем рухаються кадрами по кілька разів за рядок. React малює лише порожній <svg>, усе
// інше тут; перемальовування React до цих вузлів не торкається.
//
// Координати — метри: поле 105 × 68, ми атакуємо праворуч, лівий фланг — угорі (y = 0).
// Розіграш рядка вкладається в ~1,7 с: наступний рядок стрічки приходить за 1,9 с (App.delayFor).
// «Менше руху» — кінцеві положення одразу, без польоту м'яча й камери.

export type P = [number, number];
type View = { x: number; y: number; w: number; h: number };

export const PW = 105;
export const PH = 68;
/** Висота кадру до ширини — та сама, що `aspect-ratio` у `.pitch-cam`. */
export const ASPECT = 0.92;
const NS = 'http://www.w3.org/2000/svg';
const ZX = { ownBox: 9, own: 27, mid: 52.5, their: 78, theirBox: 96 } as const;
/** Зони сцен Реєса (engine/action.ts) — ті самі, що в стрічці, плюс дуга штрафного й стійки. */
const ZX_SCENE: Record<string, number> = { ...ZX, ownD: 21, theirD: 84 };
const ZY = { L: 12, C: 34, R: 56 } as const;
const OUR_GOAL: P = [0, 34];
const THEIR_GOAL: P = [PW, 34];
const BENCH: P = [50, -3.4];
/** Події кінцівки, що закінчують удар (engine/action.ts:ACTION_BEATS). */
const SHOT_END: ActionBeat[] = ['whiff', 'bar', 'post', 'over', 'wide', 'tip', 'held', 'parry', 'block', 'line'];

/** Зона з actions.json («theirD:C», «farPost») → точка на полі. Невідома — null. */
export function placePoint(zone: string | null | undefined): P | null {
  if (!zone) return null;
  if (zone === 'nearPost') return [PW - 5, 29];
  if (zone === 'farPost') return [PW - 5, 41];
  const [x, y] = zone.split(':');
  const px = ZX_SCENE[x]; const py = (ZY as Record<string, number>)[y ?? 'C'];
  return px === undefined || py === undefined ? null : [px, py];
}

/** Ролі ростера → фішки. Свої 4-3-3: Реєс — десятка між лініями; лівий фланг угорі. */
const ROLE_ID: Record<string, string> = {
  self: 'u10', keeper: 'u1', rb: 'u2', lb: 'u3', cb: 'u4', cb2: 'u5', dm: 'u6', partner: 'u7', striker: 'u9', winger: 'u11', sub: 'sub',
  'them.keeper': 't1', 'them.rb': 't2', 'them.lb': 't3', 'them.cb': 't4', 'them.cb2': 't5', 'them.mid': 't6', 'them.mid2': 't8',
  'them.winger': 't7', 'them.winger2': 't11', 'them.striker': 't9', ref: 'ref', medic: 'med',
};
const US_HOME: Record<string, P> = {
  u1: [4, 34], u2: [20, 57], u3: [20, 11], u4: [18, 41], u5: [18, 27], u6: [36, 34], u8: [43, 47],
  u10: [55, 34], u7: [62, 11], u9: [66, 36], u11: [62, 57],
};
type Formation = '4-4-2' | '4-2-3-1' | '4-3-3';
const THEM_HOME: Record<Formation, Record<string, P>> = {
  '4-2-3-1': { t1: [101, 34], t2: [85, 12], t4: [87, 28], t5: [87, 40], t3: [85, 56], t6: [72, 29], t8: [72, 40], t7: [60, 14], t10: [62, 34], t11: [60, 54], t9: [48, 34] },
  '4-4-2': { t1: [101, 34], t2: [85, 12], t4: [87, 28], t5: [87, 40], t3: [85, 56], t7: [66, 12], t6: [68, 28], t8: [68, 40], t11: [66, 56], t9: [50, 30], t10: [52, 40] },
  '4-3-3': { t1: [101, 34], t2: [85, 12], t4: [87, 28], t5: [87, 40], t3: [85, 56], t6: [70, 34], t8: [72, 24], t10: [72, 44], t7: [56, 14], t9: [52, 34], t11: [56, 54] },
};
const NUM: Record<string, string> = { sub: '14', ref: '', med: '+' };
const isUs = (id: string) => id.startsWith('u') || id === 'sub';

const FALLBACK_US: Kit = { pattern: 'solid', a: '#b8382a', b: '#b8382a', num: '#f3ead9', gk: '#1d1d22', gkNum: '#e6e1d6' };
const FALLBACK_THEM: Kit = { pattern: 'solid', a: '#5d6272', b: '#5d6272', num: '#f1eee6', gk: '#3d8a4c', gkNum: '#0d1f11' };

/** Що навколо гри (M52, 19.10): погода й час матчу, ліга — для газону, трибун і світла. */
export type PitchScene = {
  weather: 'clear' | 'rain' | 'heat' | 'wind';
  /** Під прожекторами: стартовий свисток з афіші пізніше, ніж за годину до заходу сонця в місяці туру
   *  (`prematch-text.ts:floodlit`) — поле показує той самий вечір, що надрукований на афіші. */
  night: boolean;
  /** Холод (грудень, лютий) без дощу: іній по краях. Під дощем інею немає — афіша каже «дощ». */
  cold: boolean;
  league: 'top' | 'second';
  /** Написи на рекламних щитах уздовж бровки — пародійна реклама ESPM. */
  boards: string[];
};

export type DirectorOptions = {
  scene?: PitchScene;
  usKit?: Kit; themKit?: Kit; formation: Formation;
  /** Підписи фішок: id → ім'я. Показуються лише тим, кого називає рядок, і Реєсу завжди. */
  names: Record<string, string>;
  reduced: boolean;
  /** Вища ліга — рев великого стадіону на гол (ui/sound.ts). */
  top?: boolean;
  /** Сід матчу: разом із хвилиною вирішує варіації рухів (M52). */
  seed?: number;
};

type Token = { g: SVGGElement; mv: SVGGElement; body: SVGGElement; label?: SVGTextElement; ring?: SVGCircleElement; glow?: SVGCircleElement; p: P };
/** Святкування гола (M52, 19.10, прохання користувача: «фішка якось реагує»): стрибки на місці,
 *  ковзання на колінах, біг до кутового прапорця, «літачок» дугою. */
export type Celebration = 'jump' | 'knees' | 'flag' | 'plane';
const CELEBRATIONS: Celebration[] = ['knees', 'flag', 'jump', 'plane'];
const DEFAULT_SCENE: PitchScene = { weather: 'clear', night: false, cold: false, league: 'second', boards: [] };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export class Director {
  private svg: SVGSVGElement;
  private t: Record<string, Token> = {};
  private ball!: SVGGElement;
  private ballP: P = [52.5, 34];
  private trail!: SVGPathElement;
  private view: View = { x: 26, y: 10, w: 52, h: 52 * ASPECT };
  private run = 0;
  private home: Record<string, P>;
  private reduced: boolean;
  private top: boolean;
  /** Фоновий розіграш — удари тихіші. */
  private idling = false;
  /** Поле знято (Pitch відмонтовано): більше ні руху, ні звуку — навіть від розіграшу, що вже йшов. */
  private dead = false;
  private nets: Record<'us' | 'them', SVGRectElement> = {} as Record<'us' | 'them', SVGRectElement>;
  private bars: Record<'us' | 'them', SVGLineElement> = {} as Record<'us' | 'them', SVGLineElement>;
  private flashRect!: SVGRectElement;
  private benchMarks!: SVGGElement;
  private flashes!: SVGGElement;
  private shout!: SVGTextElement;
  private pointer!: SVGGElement;
  private flag!: SVGGElement;
  private card!: SVGRectElement;
  private names: Record<string, string>;
  private scene: PitchScene;
  /** М'яч: малюнок угорі на висоті, тінь — на землі. `ballP` — точка на землі (під тінню). */
  private ballShadow!: SVGEllipseElement;
  /** Кільце владіння — під гравцем, біля ніг якого м'яч (M52). */
  private own!: SVGCircleElement;
  private onBench = false;
  /** Кутові прапорці — святкування біля прапорця смикає його (M52). */
  private corners: { g: SVGGElement; p: P }[] = [];
  /** Хвилина на табло: від неї (і від автора) залежить, як святкують, — без випадковості, перезавантаження
   *  покаже те саме, а наступний гол — інакше. */
  private clock = 0;
  private seed = 0;
  /** Лише лабораторія поля: зіграти конкретне святкування. */
  forceCelebration?: Celebration;
  /** Реєса вилучено: він поза полем, і на його місце ніхто не виходить — вдесятьох. */
  private tenMen = false;

  constructor(svg: SVGSVGElement, opt: DirectorOptions) {
    this.svg = svg;
    this.reduced = opt.reduced;
    this.top = !!opt.top;
    this.names = opt.names;
    this.seed = opt.seed ?? 0;
    this.scene = { ...DEFAULT_SCENE, league: opt.top ? 'top' : 'second', ...opt.scene };
    this.home = { ...US_HOME, ...THEM_HOME[opt.formation], ref: [52, 44], med: [44, -3.2], sub: BENCH };
    svg.textContent = '';
    this.drawPitch(opt.usKit ?? FALLBACK_US, opt.themKit ?? FALLBACK_THEM);
    this.reset();
  }

  // ——— малювання ———————————————————————————————————————————————————————
  private el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element = this.svg): SVGElementTagNameMap[K] {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    parent.appendChild(e);
    return e;
  }

  private pattern(defs: SVGDefsElement, id: string, kit: Kit) {
    const p = this.el('pattern', { id, patternUnits: 'objectBoundingBox', width: 1, height: 1, viewBox: '0 0 10 10', preserveAspectRatio: 'none' }, defs);
    this.el('rect', { x: 0, y: 0, width: 10, height: 10, fill: kit.a }, p);
    if (kit.pattern === 'stripes') for (let x = 1; x < 10; x += 3) this.el('rect', { x, y: 0, width: 1.5, height: 10, fill: kit.b }, p);
    if (kit.pattern === 'hoops') for (let y = 1.5; y < 10; y += 3) this.el('rect', { x: 0, y, width: 10, height: 1.5, fill: kit.b }, p);
    if (kit.pattern === 'sash') this.el('polygon', { points: '0,2 2,0 10,8 8,10', fill: kit.b }, p);
    if (kit.pattern === 'halves') this.el('rect', { x: 5, y: 0, width: 5, height: 10, fill: kit.b }, p);
    if (kit.pattern === 'trim') this.el('circle', { cx: 5, cy: 5, r: 4.4, fill: 'none', stroke: kit.b, 'stroke-width': 1.1 }, p);
  }

  private drawPitch(us: Kit, them: Kit) {
    const defs = this.el('defs', {});
    this.pattern(defs, 'kit-us', us);
    this.pattern(defs, 'kit-them', them);
    const sc = this.scene;
    this.svg.classList.toggle('pc-night', sc.night);
    this.svg.classList.toggle('pc-cold', sc.cold);
    this.svg.classList.toggle('pc-wind', sc.weather === 'wind');
    this.svg.classList.toggle('pc-rain', sc.weather === 'rain');
    this.svg.classList.toggle('pc-heat', sc.weather === 'heat');
    this.svg.classList.toggle('pc-top', sc.league === 'top');
    this.el('rect', { x: -12, y: -12, width: PW + 24, height: PH + 24, class: 'pc-surround' });
    this.stands(defs);
    this.boards();
    this.el('rect', { x: 0, y: 0, width: PW, height: PH, class: 'pc-grass' });
    // Смуги покосу (M52): ширші й помітніші, ніж були; у вищій лізі газон рівніший і світліший.
    for (let i = 1; i < 10; i += 2) this.el('rect', { x: i * 10.5, y: 0, width: 10.5, height: PH, class: 'pc-stripe' });
    this.wear(defs);
    if (sc.night) this.floodlights(defs);
    if (sc.weather === 'rain') this.puddles(defs);
    if (sc.cold) this.frost(defs);
    const g = this.el('g', { class: 'pc-lines' });
    this.el('rect', { x: 0, y: 0, width: PW, height: PH }, g);
    this.el('line', { x1: 52.5, y1: 0, x2: 52.5, y2: PH }, g);
    this.el('circle', { cx: 52.5, cy: 34, r: 9.15 }, g);
    this.el('circle', { cx: 52.5, cy: 34, r: .25, class: 'pc-spot' }, g);
    for (const left of [true, false]) {
      this.el('rect', { x: left ? 0 : PW - 16.5, y: 13.85, width: 16.5, height: 40.3 }, g);
      this.el('rect', { x: left ? 0 : PW - 5.5, y: 24.84, width: 5.5, height: 18.32 }, g);
      this.el('circle', { cx: left ? 11 : PW - 11, cy: 34, r: .25, class: 'pc-spot' }, g);
      this.el('path', { d: left ? 'M16.5,26.7 A9.15,9.15 0 0 1 16.5,41.3' : 'M88.5,26.7 A9.15,9.15 0 0 0 88.5,41.3' }, g);
      const side = left ? 'us' : 'them';
      const ng = this.el('g', { class: 'pc-netg' });
      this.nets[side] = this.el('rect', { x: left ? -2 : PW, y: 30.34, width: 2, height: 7.32, class: 'pc-net' }, ng);
      for (let y = 31.6; y < 37.6; y += 1.25) this.el('line', { x1: left ? -2 : PW, y1: y, x2: left ? 0 : PW + 2, y2: y, class: 'pc-mesh' }, ng);
      for (const x of left ? [-1.35, -.7] : [PW + .7, PW + 1.35]) this.el('line', { x1: x, y1: 30.34, x2: x, y2: 37.66, class: 'pc-mesh' }, ng);
      this.bars[side] = this.el('line', { x1: left ? 0 : PW, y1: 30.34, x2: left ? 0 : PW, y2: 37.66, class: 'pc-bar' });
    }
    for (const [x, y] of [[0, 0], [PW, 0], [0, PH], [PW, PH]] as P[]) {
      const cf = this.el('g', {});
      this.el('line', { x1: x, y1: y, x2: x, y2: y - 1.6, class: 'pc-flagpole' }, cf);
      this.el('polygon', { points: `${x},${y - 1.6} ${x + (x ? -1 : 1)},${y - 1.3} ${x},${y - 1}`, class: 'pc-flag' }, cf);
      this.corners.push({ g: cf, p: [x, y] });
    }
    // лави за верхньою бровкою, біля центру
    for (const x of [44, 61]) this.el('rect', { x: x - 5, y: -5.4, width: 10, height: 2.4, rx: .4, class: 'pc-bench' });
    this.benchMarks = this.el('g', { opacity: 0 });
    for (const x of [41, 47, 58, 64]) { const t = this.el('text', { x, y: -6.2, class: 'pc-shout' }, this.benchMarks); t.textContent = '!'; }
    this.flashRect = this.el('rect', { x: 0, y: 0, width: PW, height: PH, class: 'pc-flash', opacity: 0 });
    this.trail = this.el('path', { class: 'pc-trail', opacity: 0 });

    this.ballShadow = this.el('ellipse', { rx: .78, ry: .42, class: 'pc-ball-shadow' });
    this.own = this.el('circle', { r: 2.05, class: 'pc-own', opacity: 0 });
    const ids = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u11', 'sub', 'ref', 'med', 'u10'];
    for (const id of ids) this.token(id, us, them);
    // м'яч — класичний чорно-білий: білий круг, п'ятикутник і п'ять плям по краю
    this.ball = this.el('g', {});
    this.el('circle', { r: .78, class: 'pc-ball' }, this.ball);
    const pent = Array.from({ length: 5 }, (_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return `${(.3 * Math.cos(a)).toFixed(3)},${(.3 * Math.sin(a)).toFixed(3)}`; }).join(' ');
    this.el('polygon', { points: pent, class: 'pc-ball-patch' }, this.ball);
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + Math.PI / 5 + i * 2 * Math.PI / 5; this.el('circle', { cx: (.62 * Math.cos(a)).toFixed(3), cy: (.62 * Math.sin(a)).toFixed(3), r: .16, class: 'pc-ball-patch' }, this.ball); }
    this.pointer = this.el('g', { opacity: 0 });
    this.el('path', { d: 'M0,0 L3,0 M2,-.8 L3,0 L2,.8', class: 'pc-pointer' }, this.pointer);
    this.flag = this.el('g', { opacity: 0 });
    this.el('line', { x1: 0, y1: 0, x2: 0, y2: -2.4, class: 'pc-flagpole' }, this.flag);
    this.el('rect', { x: 0, y: -2.4, width: 1.4, height: 1, class: 'pc-linesman' }, this.flag);
    this.shout = this.el('text', { class: 'pc-shout', opacity: 0 });
    this.card = this.el('rect', { width: 1, height: 1.4, rx: .15, class: 'pc-card', opacity: 0 });
  }

  /** Трибуни (M52): смуга глядачів за лавами; у другій лізі — одна дерев'яна трибуна в центрі, у вищій —
   *  повний стадіон довкола. Глядачі — візерунок крапок, а не сотні вузлів: поле має лишатися легким. */
  private stands(defs: SVGDefsElement) {
    const pat = this.el('pattern', { id: 'crowd', patternUnits: 'userSpaceOnUse', width: 4.2, height: 2.1 }, defs);
    const dots: [number, number, string][] = [[.4, .5, 'a'], [1.5, .3, 'b'], [2.6, .6, 'c'], [3.6, .4, 'a'], [.9, 1.5, 'c'], [2.0, 1.6, 'a'], [3.1, 1.4, 'b'], [4.0, 1.7, 'c']];
    for (const [x, y, c] of dots) this.el('circle', { cx: x, cy: y, r: .34, class: `pc-fan pc-fan-${c}` }, pat);
    const top = this.scene.league === 'top';
    const blocks: [number, number, number, number][] = top
      ? [[-12, -12, PW + 24, 5.4], [-12, PH + 2.6, PW + 24, 9.4], [-12, -6.6, 4.8, PH + 9.2], [PW + 7.2, -6.6, 4.8, PH + 9.2]]
      : [[30, -11, 45, 4.2], [-12, PH + 3.6, 22, 3], [PW - 10, PH + 3.6, 22, 3]];
    for (const [x, y, w, h] of blocks) {
      this.el('rect', { x, y, width: w, height: h, class: 'pc-stand' });
      this.el('rect', { x, y, width: w, height: h, fill: 'url(#crowd)', class: 'pc-crowd' });
    }
    this.flashes = this.el('g', { class: 'pc-flashes', opacity: 0 });
    for (let i = 0; i < 28; i++) {
      const b = blocks[i % blocks.length];
      this.el('circle', { cx: b[0] + ((i * 37) % 100) / 100 * b[2], cy: b[1] + ((i * 61) % 100) / 100 * b[3], r: .28, class: 'pc-phone' }, this.flashes);
    }
  }

  /** Рекламні щити вздовж бровок — та сама пародійна реклама, що на ESPM (M52). */
  private boards() {
    const words = this.scene.boards.length ? this.scene.boards : ['ESPM'];
    const g = this.el('g', { class: 'pc-boards' });
    let i = 0;
    for (const y of [-2.2, PH + 1.1]) {
      for (let x = 1; x < PW - 1; x += 15) {
        this.el('rect', { x, y, width: 14.2, height: 1.1, class: `pc-board pc-board-${i % 3}` }, g);
        const t = this.el('text', { x: x + 7.1, y: y + .8, class: 'pc-board-t' }, g);
        t.textContent = words[i % words.length].toUpperCase();
        i++;
      }
    }
  }

  /** Витоптаний газон: біля воріт, у центральному колі й на точках. У другій лізі помітніше. */
  private wear(defs: SVGDefsElement) {
    const rg = this.el('radialGradient', { id: 'wear' }, defs);
    this.el('stop', { offset: '0', class: 'pc-wear-0' }, rg);
    this.el('stop', { offset: '1', class: 'pc-wear-1' }, rg);
    const g = this.el('g', { class: 'pc-wear' });
    for (const [cx, cy, rx, ry] of [[4.5, 34, 5, 9], [PW - 4.5, 34, 5, 9], [52.5, 34, 6, 5], [11, 34, 2.4, 2.4], [PW - 11, 34, 2.4, 2.4]] as [number, number, number, number][]) {
      this.el('ellipse', { cx, cy, rx, ry, fill: 'url(#wear)' }, g);
    }
  }

  /** Вечір: чотири щогли за кутами, світлі плями на газоні й темніші краї. */
  private floodlights(defs: SVGDefsElement) {
    const rg = this.el('radialGradient', { id: 'flood' }, defs);
    this.el('stop', { offset: '0', class: 'pc-flood-0' }, rg);
    this.el('stop', { offset: '1', class: 'pc-flood-1' }, rg);
    const g = this.el('g', { class: 'pc-floods' });
    for (const [x, y] of [[-4, -4], [PW + 4, -4], [-4, PH + 4], [PW + 4, PH + 4]] as P[]) {
      this.el('ellipse', { cx: x + (x < 0 ? 22 : -22), cy: y + (y < 0 ? 16 : -16), rx: 34, ry: 26, fill: 'url(#flood)' }, g);
      this.el('circle', { cx: x, cy: y, r: 1.1, class: 'pc-mast' });
    }
  }

  /** Дощ: калюжі блищать світлом (самі краплі — шар над полем у Pitch.tsx, у координатах екрана). */
  private puddles(defs: SVGDefsElement) {
    const rg = this.el('radialGradient', { id: 'puddle' }, defs);
    this.el('stop', { offset: '0', class: 'pc-puddle-0' }, rg);
    this.el('stop', { offset: '1', class: 'pc-puddle-1' }, rg);
    for (const [cx, cy, rx, ry] of [[8, 40, 3.5, 1.4], [30, 22, 4, 1.2], [56, 48, 3, 1], [74, 30, 4.5, 1.5], [97, 26, 3, 1.2], [44, 60, 3.6, 1.1]] as [number, number, number, number][]) {
      this.el('ellipse', { cx, cy, rx, ry, fill: 'url(#puddle)' });
    }
  }

  /** Холод: іній біля бровок і в кутах, де сонце не дістає. */
  private frost(defs: SVGDefsElement) {
    const lg = this.el('linearGradient', { id: 'frost', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    this.el('stop', { offset: '0', class: 'pc-frost-0' }, lg);
    this.el('stop', { offset: '1', class: 'pc-frost-1' }, lg);
    this.el('rect', { x: 0, y: 0, width: PW, height: 7, fill: 'url(#frost)' });
    this.el('rect', { x: 0, y: PH - 7, width: PW, height: 7, fill: 'url(#frost)', transform: `rotate(180 ${PW / 2} ${PH - 3.5})` });
  }

  private token(id: string, us: Kit, them: Kit) {
    const self = id === 'u10';
    const ours = isUs(id);
    const kit = ours ? us : them;
    const gk = id === 'u1' || id === 't1';
    const g = this.el('g', {});
    // Тінь (M52): удень одна, від сонця; уночі — чотири бліді від щогл прожекторів, як на справжньому стадіоні.
    if (id !== 'med') {
      const sh = this.el('g', { class: 'pc-shadow' }, g);
      const offs: P[] = this.scene.night ? [[.55, .5], [-.55, .5], [.55, -.4], [-.55, -.4]] : [[.45, .6]];
      for (const [x, y] of offs) this.el('ellipse', { cx: x, cy: y, rx: self ? 1.7 : 1.35, ry: self ? .95 : .75 }, sh);
    }
    const mv = this.el('g', {}, g);
    const tk: Token = { g, mv, body: undefined as unknown as SVGGElement, p: [0, 0] };
    if (self) {
      this.el('circle', { r: 2.35, class: 'pc-ring-bg' }, g);
      tk.ring = this.el('circle', { r: 2.35, class: 'pc-ring', transform: 'rotate(-90)', 'stroke-dasharray': `${2 * Math.PI * 2.35} 99` }, g);
      tk.glow = this.el('circle', { r: 2.95, class: 'pc-glow', opacity: 0 }, g);
    }
    const body = this.el('g', {}, mv);
    tk.body = body;
    // Суддя — схематичний свисток (17.10, зауваження користувача): темне коло з жовтою обводкою без номера
    // читалося як фішка суперника в жовтій формі, у якої зник номер. Кремовий, нейтральний до будь-якої форми.
    if (id === 'ref') {
      g.setAttribute('class', 'pc-ref');
      this.el('circle', { r: 1.25, class: 'pc-ref-bg' }, body);
      this.el('circle', { cx: -.25, cy: .22, r: .52, class: 'pc-ref-ink' }, body);
      this.el('line', { x1: .12, y1: -.15, x2: .9, y2: -.62, class: 'pc-ref-ink pc-ref-mouth' }, body);
      this.t[id] = tk;
      return;
    }
    const fill = id === 'ref' ? '#111114' : id === 'med' ? '#f1eee6' : gk ? (ours ? us.gk : them.gk) : `url(#kit-${ours ? 'us' : 'them'})`;
    const stroke = id === 'ref' ? '#f2cf5b' : gk && ours ? '#e6e1d6' : '#0b0b0d';
    const r = self ? 1.75 : 1.4;
    this.el('circle', { r, fill, stroke, 'stroke-width': id === 'ref' || (gk && ours) ? .18 : .14 }, body);
    const num = NUM[id] ?? id.slice(1);
    if (num) {
      const color = id === 'ref' ? '#f2cf5b' : id === 'med' ? '#be3c1c' : gk ? (ours ? us.gkNum : them.gkNum) : kit.num;
      const light = /^#[ef]/i.test(kit.a) && !gk && id !== 'med';
      const n = this.el('text', { y: self ? .6 : .48, class: 'pc-num', 'font-size': self ? 1.55 : 1.22, fill: color, ...(light ? { stroke: kit.a, 'stroke-width': .3, 'paint-order': 'stroke' } : {}) }, body);
      n.textContent = num;
    }
    const name = this.names[id];
    if (name) { tk.label = this.el('text', { y: self ? -2.95 : -2.05, class: 'pc-label', opacity: self ? 1 : 0 }, g); tk.label.textContent = name; }
    this.t[id] = tk;
  }

  // ——— стан і рух —————————————————————————————————————————————————————
  private put(id: string, p: P) { const tk = this.t[id]; if (!tk) return; tk.p = p; tk.g.setAttribute('transform', `translate(${p[0].toFixed(2)},${p[1].toFixed(2)})`); }
  private putBall(p: P, h = 0) {
    this.ballP = p;
    // Висота (M52, як у 2D-рушії FM): м'яч у повітрі вищий за свою тінь і трохи більший — навіс, довгий
    // пас і свічка читаються об'ємом. Тінь лишається на землі, світлішає й меншає з висотою.
    this.ball.setAttribute('transform', `translate(${p[0].toFixed(2)},${(p[1] - h).toFixed(2)}) scale(${(1 + h * .07).toFixed(3)})`);
    this.ballShadow.setAttribute('cx', p[0].toFixed(2)); this.ballShadow.setAttribute('cy', (p[1] + .45).toFixed(2));
    this.ballShadow.setAttribute('opacity', String(Math.max(.12, .45 - h * .05)));
    if (h < .4) this.markOwner(p); else this.own.setAttribute('opacity', '0');
  }

  /** Кільце владіння (M52): під гравцем, біля ніг якого м'яч на землі. Нікого поруч — кільця немає. */
  private markOwner(p: P) {
    let best = '', bd = 1.9;
    for (const id in this.t) {
      if (id === 'ref' || id === 'med' || !this.playing(id)) continue;
      const d = dist(this.t[id].p, p);
      if (d < bd) { bd = d; best = id; }
    }
    if (!best) { this.own.setAttribute('opacity', '0'); return; }
    const q = this.t[best].p;
    this.own.setAttribute('cx', q[0].toFixed(2)); this.own.setAttribute('cy', q[1].toFixed(2));
    this.own.setAttribute('r', best === 'u10' ? '2.75' : '2.05');
    this.own.setAttribute('opacity', '.75');
  }
  private setView(v: View) { this.view = v; this.svg.setAttribute('viewBox', `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`); }
  pos(id: string): P { return this.t[id]?.p ?? [52.5, 34]; }

  /** Усі по місцях без анімації: перший кадр поля. */
  reset() {
    for (const id in this.home) this.put(id, this.home[id]);
    this.put('u10', this.onBench ? BENCH : this.home.u10);
    this.put('sub', this.onBench ? this.home.u10 : BENCH);
    this.putBall([52.5, 34]);
    this.setView(this.frame([52.5, 34], 56));
    this.quiet();
    this.t.sub?.g.setAttribute('opacity', this.onBench ? '1' : '0');
    this.t.u10?.g.setAttribute('opacity', this.onBench ? '0' : '1');
  }

  // Дублер на полі лише поки Реєс на лаві; решту часу його фішки немає — біля бровки вона читалась як
  // Реєс, що стоїть осторонь (зауваження користувача 17.10). Так само й сам Реєс: на лаві, після заміни
  // й після червоної його фішки на полі немає зовсім (друге зауваження 17.10), з'являється на виході.
  // Лікар з'являється тільки тоді, коли біжить.
  setBench(on: boolean, sentOff = false) {
    this.onBench = on || sentOff;
    this.tenMen = sentOff;
    this.put('u10', this.onBench ? BENCH : this.home.u10);
    this.put('sub', on && !sentOff ? this.home.u10 : BENCH);
    this.t.sub?.g.setAttribute('opacity', on && !sentOff ? '1' : '0');
    this.t.u10?.g.setAttribute('opacity', this.onBench ? '0' : '1');
  }
  /** Фішка, що грає на місці Реєса: він сам або дублер, поки Реєс на лаві. */
  private selfId() { return this.onBench ? 'sub' : 'u10'; }
  /** Чи стоїть ця фішка зараз на полі: Реєс — коли не на лаві, дублер — коли грає замість нього. */
  private playing(id: string) { return id === 'u10' ? !this.onBench : id === 'sub' ? this.onBench && !this.tenMen : true; }
  setStamina(v: number) {
    const ring = this.t.u10.ring; if (!ring) return;
    const C = 2 * Math.PI * 2.35;
    ring.setAttribute('stroke-dasharray', `${(C * clamp(v, 0, 100) / 100).toFixed(2)} 99`);
    ring.classList.toggle('mid', v < 50 && v >= 25); ring.classList.toggle('low', v < 25);
  }
  setMinute(m: number) { this.clock = m; }
  /** Детерміноване «випадкове» для одного розіграшу (M52, пункт 2): від сіду матчу, хвилини й того, що
   *  грається. Перезавантаження покаже той самий рух, а такий самий удар на іншій хвилині — інший.
   *  Math.random тут не можна: розіграш мав би інший вигляд після кожного монтування поля. */
  private rng(salt: string): () => number {
    let h = (Math.imul(this.seed | 0, 0x9e3779b1) ^ Math.imul(this.clock + 1, 0x85ebca6b)) >>> 0;
    for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 16777619) >>> 0;
    return () => {
      h = (h + 0x6d2b79f5) >>> 0;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  setGlow(on: boolean) { this.t.u10.glow?.setAttribute('opacity', on ? '.35' : '0'); }

  private frame(c: P, w: number): View {
    const h = w * ASPECT;
    return { x: clamp(c[0] - w / 2, -6, PW + 6 - w), y: clamp(c[1] - h / 2, -9, PH + 6 - h), w, h };
  }

  private sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, this.reduced ? 0 : ms)); }

  private tween(dur: number, f: (k: number) => void): Promise<void> {
    if (this.reduced || dur <= 0) { f(1); return Promise.resolve(); }
    return new Promise((res) => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / dur);
        f(k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
        if (k < 1) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
  }

  /** Один такт: фішки йдуть у точки, м'яч летить (дугою — якщо arc), камера їде. Старі такти — мовчки виходять. */
  private async step(my: number, o: { moves?: Record<string, P>; ball?: P; arc?: number; cam?: P; w?: number; dur?: number }) {
    if (my !== this.run || this.dead) return;
    const dur = o.dur ?? 600;
    const from: Record<string, P> = {};
    for (const id in o.moves ?? {}) from[id] = this.pos(id);
    const b0 = this.ballP;
    const v0 = this.view;
    // Камера трохи випереджає напрям гри (M52): дивимось туди, куди летить м'яч, а не туди, де він був.
    const lead = o.cam && o.ball ? clamp((o.ball[0] - b0[0]) * .22, -5, 5) : 0;
    let v1 = o.cam ? this.frame([o.cam[0] + lead, o.cam[1]], o.w ?? v0.w) : v0;
    // М'яч не має вилітати з кадру: якщо ціль поза ним — кадр зсувається рівно настільки, щоб ціль була видна.
    if (o.ball) {
      const m = 4, b = o.ball;
      const nx = b[0] < v1.x + m ? b[0] - m : b[0] > v1.x + v1.w - m ? b[0] + m - v1.w : v1.x;
      const ny = b[1] < v1.y + m ? b[1] - m : b[1] > v1.y + v1.h - m ? b[1] + m - v1.h : v1.y;
      if (nx !== v1.x || ny !== v1.y) v1 = this.frame([nx + v1.w / 2, ny + v1.h / 2], v1.w);
    }
    const arc = o.arc ?? 0;
    // Висота польоту: низом — по землі; навіс, переведення, свічка (arc від 3) — угору й униз параболою.
    const H = arc >= 3 ? Math.min(6, arc * .45) : 0;
    const mid: P | null = o.ball ? [(b0[0] + o.ball[0]) / 2, (b0[1] + o.ball[1]) / 2 - (H ? H * 2 : arc)] : null;
    // Розтяг на бігу (M52): фішка, що біжить далі за 2 м, трохи витягується вздовж руху.
    const runs: Record<string, number> = {};
    if (!this.reduced) for (const id in from) { const z = o.moves![id], a = from[id]; const d = dist(a, z); if (d > 2) runs[id] = Math.atan2(z[1] - a[1], z[0] - a[0]) * 180 / Math.PI; }
    // Звук удару — разом із передачею: м'яч пішов далі ніж на 4 м (не перекат біля ніг).
    if (o.ball && dist(b0, o.ball) > 4) sfxKick(this.idling ? 0.5 : 0.8);
    if (o.ball && dist(b0, o.ball) > 4) { this.trail.setAttribute('d', `M${b0[0]},${b0[1]} Q${mid![0]},${mid![1]} ${o.ball[0]},${o.ball[1]}`); this.trail.setAttribute('opacity', '.55'); }
    await this.tween(dur, (k) => {
      if (my !== this.run) return;
      for (const id in from) { const a = from[id], z = o.moves![id]; this.put(id, [a[0] + (z[0] - a[0]) * k, a[1] + (z[1] - a[1]) * k]); }
      for (const id in runs) {
        const s = Math.sin(Math.PI * k) * .13, a = runs[id];
        this.t[id].mv.setAttribute('transform', k >= 1 ? '' : `rotate(${a.toFixed(1)}) scale(${(1 + s).toFixed(3)},${(1 - s * .6).toFixed(3)}) rotate(${(-a).toFixed(1)})`);
      }
      if (o.ball && mid) {
        if (H) this.putBall([b0[0] + (o.ball[0] - b0[0]) * k, b0[1] + (o.ball[1] - b0[1]) * k], 4 * H * k * (1 - k));
        else { const q = 1 - k; this.putBall([q * q * b0[0] + 2 * q * k * mid[0] + k * k * o.ball[0], q * q * b0[1] + 2 * q * k * mid[1] + k * k * o.ball[1]]); }
      } else if (Object.keys(from).length) this.markOwner(this.ballP);
      if (v1 !== v0) this.setView({ x: v0.x + (v1.x - v0.x) * k, y: v0.y + (v1.y - v0.y) * k, w: v0.w + (v1.w - v0.w) * k, h: v0.h + (v1.h - v0.h) * k });
    });
    setTimeout(() => this.trail.setAttribute('opacity', '0'), 380);
  }

  private quiet() {
    for (const id in this.t) { this.t[id].body.removeAttribute('transform'); if (this.t[id].label && id !== 'u10') this.t[id].label!.setAttribute('opacity', '0'); }
    for (const e of [this.pointer, this.shout, this.benchMarks, this.flag, this.card]) e.setAttribute('opacity', '0');
    this.t.med?.g.setAttribute('opacity', '0');
    this.t.ref?.g.setAttribute('opacity', '0');
  }
  /** Суддя виходить лише в своїх моментах — фол, суперечка, зупинка, перевага, картка, симуляція, —
   *  як лікар: решту часу він бігав у строю без ролі й плутався з гравцями. */
  private showRef() { this.t.ref?.g.setAttribute('opacity', '1'); }
  private label(ids: string[]) { for (const id of ids) this.t[id]?.label?.setAttribute('opacity', '1'); }
  private lie(id: string, on = true) { this.t[id]?.body.setAttribute('transform', on ? 'rotate(70) scale(1.25,.6)' : ''); }
  private jump(id: string, on = true) { this.t[id]?.body.setAttribute('transform', on ? 'scale(1.3)' : ''); }
  private say(at: P, text: string) { this.shout.setAttribute('x', String(at[0])); this.shout.setAttribute('y', String(at[1] - 2.4)); this.shout.textContent = text; this.shout.setAttribute('opacity', '1'); }
  private point(at: P, deg: number) { this.pointer.setAttribute('transform', `translate(${at[0] + 1.4},${at[1] - 1}) rotate(${deg})`); this.pointer.setAttribute('opacity', '1'); }
  private showCard(at: P, red: boolean) { this.card.setAttribute('x', String(at[0] - .5)); this.card.setAttribute('y', String(at[1] - 4.6)); this.card.classList.toggle('red', red); this.card.setAttribute('opacity', '1'); }
  private async flashOn(side: 'us' | 'them') {
    sfxGoal(side === 'us', this.top);
    this.flashRect.classList.toggle('them', side === 'them');
    this.nets[side === 'us' ? 'them' : 'us'].classList.add('hit');
    this.nets[side === 'us' ? 'them' : 'us'].parentElement?.classList.add('shake');
    if (side === 'us') this.flashes.setAttribute('opacity', '1');
    await this.tween(900, (k) => this.flashRect.setAttribute('opacity', String((1 - k) * .3)));
    this.nets[side === 'us' ? 'them' : 'us'].classList.remove('hit');
    this.nets[side === 'us' ? 'them' : 'us'].parentElement?.classList.remove('shake');
    this.flashes.setAttribute('opacity', '0');
  }
  private async barHit(side: 'us' | 'them') { sfxPost(); this.bars[side].classList.add('hit'); await this.sleep(320); this.bars[side].classList.remove('hit'); }

  // ——— допоміжне: ролі, зони, блоки ——————————————————————————————————————
  private id(role: string | undefined, near: P, side?: 'us' | 'them'): string {
    if (role && ROLE_ID[role]) return role === 'self' && this.onBench ? 'sub' : ROLE_ID[role];
    const want = role === 'them' ? 'them' : role === 'us' ? 'us' : side ?? 'us';
    let best = want === 'us' ? 'u8' : 't10', d = Infinity;
    for (const id in this.t) {
      if (['u1', 't1', 'ref', 'med', 'sub', 'u10'].includes(id) || isUs(id) !== (want === 'us')) continue;
      const dd = dist(this.pos(id), near); if (dd < d) { d = dd; best = id; }
    }
    return best;
  }
  private sideOf(id: string): 'us' | 'them' { return isUs(id) ? 'us' : 'them'; }
  /** Блок зсувається за м'ячем: усі польові на `dx` уздовж поля і трохи до флангу гри. */
  private block(z: P, extra: Record<string, P> = {}): Record<string, P> {
    const dx = (z[0] - 52.5) * .45, dy = (z[1] - 34) * .18;
    const m: Record<string, P> = {};
    for (const id in this.home) {
      if (['ref', 'med', 'sub'].includes(id)) continue;
      if (id === 'u10' && this.onBench) continue;
      const [x, y] = this.home[id];
      m[id] = id === 'u1' || id === 't1' ? [x, clamp(34 + (z[1] - 34) * .12, 30, 38)] : [clamp(x + dx, 3, 102), clamp(y + dy, 3, 65)];
    }
    if (this.onBench && !this.tenMen) m.sub = [clamp(this.home.u10[0] + dx, 3, 102), this.home.u10[1]];
    m.ref = [clamp(z[0] - 6, 6, 99), clamp(z[1] + 9, 5, 63)];
    // Хто стоїть там, де відбувається дія рядка, відступає: інакше фішки лягають одна на одну
    // (Реєс у центрі кола накривав того, хто лежить, лікаря й суддю).
    const out = { ...m, ...extra };
    const fixed = Object.keys(extra);
    const spots = [z, ...fixed.map((id) => out[id])];
    for (const id of Object.keys(out)) {
      if (fixed.includes(id) || id === 'u1' || id === 't1') continue;
      for (const s of spots) {
        const p = out[id]; const d = dist(p, s);
        if (d < 4.6) { const dx = d ? (p[0] - s[0]) / d : 0, dy = d ? (p[1] - s[1]) / d : 1; out[id] = [clamp(s[0] + dx * 5, 2, 103), clamp(s[1] + dy * 5, 2, 66)]; }
      }
    }
    return this.separate(out, fixed);
  }

  /** Розвести фішки, що лягли одна на одну, — усі пари, не лише довкола місця дії (17.10, QA усіх
   *  постановок: 9 накладень у рядках Реєса, «відходять» ставили по двоє в одну точку). Учасників
   *  рядка (`fixed`) не чіпаємо: фол, єдиноборство, збитий гравець — дотик і є постановка; воротарі
   *  стоять на своїх місцях. Реєсу місця більше — у нього кільце сил. */
  private separate(out: Record<string, P>, fixed: string[] = []): Record<string, P> {
    const ids = Object.keys(out).filter((id) => id !== 'med');
    const still = (id: string) => fixed.includes(id) || id === 'u1' || id === 't1';
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j];
        if (still(a) && still(b)) continue;
        const need = a === 'u10' || b === 'u10' ? 2.7 : 2.0;
        const pa = out[a], pb = out[b]; const d = dist(pa, pb);
        if (d >= need) continue;
        const ux = d ? (pb[0] - pa[0]) / d : Math.cos(i + j), uy = d ? (pb[1] - pa[1]) / d : Math.sin(i + j);
        const gap = need - d;
        const ka = still(a) ? 0 : still(b) ? 1 : .5, kb = 1 - ka;
        out[a] = [clamp(pa[0] - ux * gap * ka, 1, 104), clamp(pa[1] - uy * gap * ka, 1, 67)];
        out[b] = [clamp(pb[0] + ux * gap * kb, 1, 104), clamp(pb[1] + uy * gap * kb, 1, 67)];
      }
    }
    return out;
  }
  private goalOf(attacker: 'us' | 'them'): P { return attacker === 'us' ? THEIR_GOAL : OUR_GOAL; }
  private fwd(side: 'us' | 'them', m: number) { return side === 'us' ? m : -m; }

  // ——— розіграш рядка стрічки ————————————————————————————————————————————
  async play(st: Stage, kind?: string) {
    if (st.act === 'kickoff') sfxWhistle('start');
    if (st.act === 'half') sfxWhistle('half');
    // Номер розіграшу цього рядка (playAct бере ++run першою дією). Фон — лише з ним: якщо поле зняли,
    // поки рядок догравав, this.run уже інший, і фон із новим номером грав би вічно на невидимому полі
    // (18.10: удари по м'ячу на титулі й у зошиті — по три одночасно, від трьох «осиротілих» полів).
    const mine = this.run + 1;
    await this.playAct(st, kind);
    if (this.dead) return;
    if (st.tags.includes('stands')) sfxBoo();
    // Перерва — команди в тунелі, фону немає до наступного рядка.
    if (st.act !== 'half' && mine === this.run) void this.idle(mine);
  }

  private async playAct(st: Stage, kind?: string) {
    const my = ++this.run;
    this.quiet();
    // Варіації рядка стрічки (M52, пункт 3): та сама постановка на іншій хвилині — в іншому місці зони,
    // в іншому темпі й з іншим кутом удару. Зона лишається тією, що в рядку: зсув — у її межах.
    const v = this.rng(`feed/${st.act}/${st.who ?? ''}/${st.vs ?? ''}/${st.x ?? ''}${st.y ?? ''}/${st.tags.join(',')}`);
    const jit = (m: number) => (v() * 2 - 1) * m;
    const tempo = .88 + v() * .26;
    const z: P = st.x ? [clamp(ZX[st.x] + jit(4), 3, 102), clamp(ZY[st.y ?? 'C'] + jit(4), 4, 64)] : [52.5, 34];
    const a = st.who ? this.id(st.who, z, st.who.startsWith('them') ? 'them' : 'us') : undefined;
    const b = st.vs ? this.id(st.vs, z, st.vs.startsWith('them') ? 'them' : 'us') : undefined;
    this.label((st.named ?? []).filter((r) => ROLE_ID[r]).map((r) => this.id(r, z)));
    const has = (t: string) => st.tags.includes(t);
    if (st.act === 'foul' || st.act === 'argue' || st.who === 'ref' || st.vs === 'ref' || ['ref', 'dive', 'hand', 'whistle', 'foul'].some(has)) this.showRef();
    const W = 44;
    const S = (o: Parameters<Director['step']>[1]) => this.step(my, o.dur ? { ...o, dur: o.dur * tempo } : o);
    const ok = () => my === this.run;

    switch (st.act) {
      case 'kickoff': {
        await S({ moves: this.block([52.5, 34], { [this.selfId()]: [52, 33], u9: [53.6, 35.2] }), ball: [52.5, 34], cam: [52.5, 34], w: 58, dur: 600 });
        await S({ ball: this.home.u6, dur: 700 });
        break;
      }
      case 'build': case 'switch': {
        const side = a ? this.sideOf(a) : has('them') || st.who === 'them' ? 'them' : 'us';
        const ids = this.nearest(side, z, 4).filter((x) => x !== a && x !== b);
        const chain = st.act === 'switch'
          ? [this.atLane(side, z[0], 12), this.atLane(side, z[0], 34), this.atLane(side, z[0], 56)]
          : [ids[0], a ?? ids[1], b ?? ids[2]].filter((x): x is string => !!x);
        const bm = this.block(z);
        await S({ moves: bm, ball: bm[chain[0]] ?? this.pos(chain[0]), cam: z, w: W + 4, dur: 500 });
        const slow = has('slow') ? 1.35 : 1;
        for (const id of chain.slice(1)) {
          if (!ok()) return;
          if (has('ignored') && id === a) { this.jump(id); await this.sleep(250); this.jump(id, false); continue; }
          const target = has('heel') && id === chain[chain.length - 1] ? [this.ballP[0] - this.fwd(side, 6), this.ballP[1] + 3] as P : this.pos(id);
          await S({ ball: target, dur: 380 * slow });
        }
        if (has('shift')) await S({ ball: [z[0] - this.fwd(side, 22), z[1]], cam: [z[0] - this.fwd(side, 14), z[1]], dur: 550 });
        if (has('through')) { const f = this.id(side === 'us' ? 'striker' : 'them.striker', z); const run: P = [this.pos(f)[0] + this.fwd(side, 10), this.pos(f)[1]]; await S({ moves: { [f]: run }, ball: run, dur: 600 }); }
        break;
      }
      case 'back': {
        const side = a ? this.sideOf(a) : 'us';
        const k = side === 'us' ? 'u1' : 't1';
        const passer = a && a !== k ? a : this.id(side === 'us' ? 'cb' : 'them.cb', z);
        const bm = this.block(z);
        const pp = bm[passer] ?? this.pos(passer);
        await S({ moves: bm, ball: pp, cam: [(pp[0] + this.home[k][0]) / 2, 34], w: Math.max(W, Math.abs(pp[0] - this.home[k][0]) + 14), dur: 500 });
        if (b && b !== k) await S({ ball: this.pos(b), dur: 420 });
        await S({ ball: [this.pos(k)[0] + this.fwd(side, 1.6), this.pos(k)[1]], dur: has('slow') ? 750 : 550 });
        if (has('stands')) this.say([this.pos(k)[0] + 6, 4], '~');
        break;
      }
      case 'long': case 'clear': {
        const side = a ? this.sideOf(a) : st.who === 'them' ? 'them' : 'us';
        const from = a ? this.pos(a) : this.pos(this.id(side === 'us' ? 'cb' : 'them.cb', z));
        const target = b ?? this.id(side === 'us' ? 'striker' : 'them.striker', z);
        if (st.act === 'clear') {
          const out: P = has('out') ? [z[0] + this.fwd(side, 8), z[1] < 34 ? -2 : 70] : [52.5 + this.fwd(side, 6), z[1]];
          await S({ moves: this.block(z, a ? { [a]: z } : {}), ball: a ? [z[0] + this.fwd(side, 1), z[1]] : z, cam: z, w: W, dur: 550 });
          await S({ ball: out, arc: 10, cam: [(z[0] + out[0]) / 2, (z[1] + out[1]) / 2], w: W + 8, dur: 750 });
          break;
        }
        await S({ moves: this.block([from[0], 34]), ball: [from[0] + this.fwd(side, 1.2), from[1]], cam: [from[0] + this.fwd(side, 12), from[1]], w: W + 6, dur: 450 });
        const land: P = has('out') ? [z[0], z[1] < 34 ? -2 : 70] : z;
        const runs: Record<string, P> = { [target]: [land[0] - this.fwd(side, 1), clamp(land[1], 1, 67)] };
        const def = this.id(side === 'us' ? 'them' : 'us', land);
        if (has('keeper')) runs[side === 'us' ? 't1' : 'u1'] = [land[0] + this.fwd(side, 1), land[1]];
        else runs[def] = [land[0] + this.fwd(side, 1.5), clamp(land[1] + 1, 1, 67)];
        await S({ moves: runs, ball: has('hang') ? [52.5, 34] : land, arc: has('hang') ? 14 : 9, cam: has('hang') ? [52.5, 34] : land, w: W + 2, dur: has('hang') ? 1000 : 800 });
        if (!ok()) return;
        if (has('won') || has('header')) { this.jump(target); await S({ ball: [land[0] + this.fwd(side, 7), land[1] + 3], dur: 420 }); this.jump(target, false); }
        else if (has('lost') || has('away')) { this.jump(def); await S({ ball: [land[0] - this.fwd(side, 10), land[1] - 6], dur: 450 }); this.jump(def, false); }
        else if (has('none')) await S({ ball: [land[0] + this.fwd(side, 9), land[1] + 4], dur: 500 });
        else if (has('back')) await S({ ball: [from[0] + this.fwd(side, 6), from[1]], dur: 600 });
        break;
      }
      case 'press': case 'intercept': {
        const attacker = a ?? this.id('us', z);
        const holder = b ?? this.id(this.sideOf(attacker) === 'us' ? 'them' : 'us', z);
        const hSide = this.sideOf(holder);
        const hp: P = [z[0], z[1]];
        const start: P = [hp[0] - this.fwd(hSide, 6), hp[1] + 4];
        await S({ moves: this.block(z, { [holder]: hp, [attacker]: [hp[0] + this.fwd(hSide, 7), hp[1] - 3] }), ball: st.act === 'press' ? [hp[0] + this.fwd(hSide, .9), hp[1]] : start, cam: z, w: W, dur: 600 });
        if (st.act === 'press') {
          const extra: Record<string, P> = { [attacker]: [hp[0] + this.fwd(hSide, 1.8), hp[1] - .6] };
          if (has('double')) extra[this.nearest(this.sideOf(attacker), hp, 3).find((x) => x !== attacker)!] = [hp[0] + this.fwd(hSide, 1.2), hp[1] + 2];
          await S({ moves: extra, dur: 450 });
          const mate = this.nearest(hSide, [hp[0] - this.fwd(hSide, 14), hp[1]], 3).find((x) => x !== holder)!;
          if (has('beaten')) await S({ ball: [hp[0] + this.fwd(hSide, 16), hp[1] + 6], dur: 450 });
          else if (has('kick')) await S({ ball: [hp[0] + this.fwd(hSide, 40), hp[1] - 8], arc: 12, cam: [52.5, 34], w: W + 14, dur: 800 });
          else await S({ ball: this.pos(mate), dur: 500 });
        } else {
          const line: P = [(start[0] + hp[0]) / 2, (start[1] + hp[1]) / 2];
          await S({ moves: { [attacker]: line }, ball: line, dur: 520 });
          if (has('back')) { await S({ moves: { [attacker]: [line[0] + this.fwd(this.sideOf(attacker), 3), line[1]] }, dur: 350 }); await S({ ball: this.pos(this.nearest(this.sideOf(attacker), [line[0] - this.fwd(this.sideOf(attacker), 12), line[1]], 3).find((x) => x !== attacker)!), dur: 420 }); }
        }
        break;
      }
      case 'dribble': case 'run': {
        const runner = a ?? this.id('us', z);
        const side = this.sideOf(runner);
        const start: P = [z[0] - this.fwd(side, 8), z[1]];
        const end: P = [clamp(z[0] + this.fwd(side, 4), 2, 103), z[1]];
        const def = b ?? this.id(side === 'us' ? 'them' : 'us', end);
        await S({ moves: this.block(z, { [runner]: start, [def]: [end[0] + this.fwd(side, 3), end[1] + 1.5] }), ball: [start[0] + this.fwd(side, 1), start[1]], cam: z, w: W, dur: 550 });
        if (st.act === 'run') { await S({ moves: { [runner]: [clamp(end[0] + this.fwd(side, 8), 1.5, 103.5), end[1]] }, cam: end, dur: 900 }); if (has('alone')) await this.sleep(300); break; }
        const meet: Record<string, P> = { [runner]: end, [def]: [end[0] + this.fwd(side, 1.6), end[1] + .6] };
        if (has('double') || has('stopped')) { const d2 = this.nearest(side === 'us' ? 'them' : 'us', end, 3).find((x) => x !== def)!; meet[d2] = [end[0] + this.fwd(side, 1), end[1] - 1.8]; }
        await S({ moves: meet, ball: [end[0] + this.fwd(side, 1), end[1]], dur: 650 });
        if (!ok()) return;
        if (has('foul')) { this.lie(runner); this.point(this.pos('ref'), -30); this.say(end, '!'); }
        else if (has('dive')) { this.lie(runner); await S({ moves: { ref: [end[0] - this.fwd(side, 3), end[1] + 4] }, dur: 500 }); this.say(this.pos('ref'), '?'); }
        else if (has('beat')) await S({ moves: { [runner]: [end[0] + this.fwd(side, 7), end[1]] }, ball: [end[0] + this.fwd(side, 8), end[1]], dur: 500 });
        else if (has('back')) await S({ ball: [end[0] - this.fwd(side, 10), end[1] + 3], dur: 450 });
        else if (has('out')) await S({ ball: [end[0], z[1] < 34 ? -2 : 70], dur: 450 });
        else if (st.vs === 'self') { this.jump('u10'); await this.sleep(250); this.jump('u10', false); }
        else await S({ moves: { [def]: [end[0] - this.fwd(side, 2), end[1]] }, ball: [end[0] - this.fwd(side, 3), end[1] + 1], dur: 450 });
        break;
      }
      case 'cross': {
        const crosser = a ?? this.id(st.who === 'them' ? 'them' : 'us', z);
        const side = this.sideOf(crosser);
        const goal = this.goalOf(side);
        const flank = z[1] <= 34 ? 6 : 62;
        const from: P = [goal[0] - this.fwd(side, 8), flank];
        const target = b ?? this.id(side === 'us' ? 'striker' : 'them.striker', goal);
        const far: P = [goal[0] - this.fwd(side, 7), flank < 34 ? 40 : 28];
        const def = this.id(side === 'us' ? 'them.cb' : 'cb', far);
        await S({ moves: this.block([goal[0] - this.fwd(side, 14), 34], { [crosser]: from, [target]: [far[0] - this.fwd(side, 4), far[1]], [def]: [far[0] + this.fwd(side, 1), far[1] - 1] }), ball: [from[0] + this.fwd(side, .8), from[1]], cam: [goal[0] - this.fwd(side, 13), (flank + 34) / 2], w: W + 8, dur: 550 });
        if (has('blocked')) { const bl = st.tags.includes('cb2') ? 'u5' : this.id(side === 'us' ? 'them' : 'us', from); await S({ moves: { [bl]: [from[0] + this.fwd(side, 1.5), from[1] + (flank < 34 ? 2 : -2)] }, dur: 300 }); await S({ ball: [from[0] - this.fwd(side, 6), from[1] + (flank < 34 ? 6 : -6)], dur: 450 }); break; }
        const land: P = has('keeper') ? [goal[0] - this.fwd(side, 3), 33] : has('nobody') || has('out') ? [goal[0] - this.fwd(side, 4), flank < 34 ? 70 : -2] : far;
        const runs: Record<string, P> = { [target]: far };
        if (has('keeper')) runs[side === 'us' ? 't1' : 'u1'] = [goal[0] - this.fwd(side, 3), 33];
        await S({ moves: runs, ball: land, arc: 7, dur: 750 });
        if (!ok()) return;
        if (has('over')) { this.jump(target); await S({ ball: [goal[0] + this.fwd(side, 3), 32], arc: 3, dur: 400 }); this.jump(target, false); }
        if (has('cleared')) { this.jump(def); await S({ ball: [far[0] - this.fwd(side, 18), far[1] - 8], arc: 4, dur: 450 }); }
        break;
      }
      case 'shot': case 'block': {
        const shooter = st.act === 'block' ? this.id('them', z) : a ?? this.id(st.who === 'them' ? 'them' : 'us', z);
        const side = this.sideOf(shooter);
        const goal = this.goalOf(side);
        const k = side === 'us' ? 't1' : 'u1';
        const sp: P = [clamp(z[0], 6, 99), z[1]];
        const blocker = st.act === 'block' ? (a ?? this.id('us', z)) : this.id(side === 'us' ? 'them' : 'us', sp);
        await S({ moves: this.block(z, { [shooter]: sp, [k]: [goal[0] - this.fwd(side, 1.5), 34], [blocker]: [sp[0] + this.fwd(side, 3), sp[1] + .4] }), ball: [sp[0] + this.fwd(side, .9), sp[1]], cam: [(sp[0] + goal[0]) / 2, (sp[1] + 34) / 2], w: Math.max(32, Math.abs(goal[0] - sp[0]) + 14), dur: 600 });
        if (!ok()) return;
        if (st.act === 'block' || has('blocked')) { await S({ ball: [sp[0] + this.fwd(side, 2.8), sp[1] + .4], dur: 200 }); if (side === 'us') sfxOoh(); this.jump(blocker); await S({ ball: [sp[0] + this.fwd(side, 6), sp[1] + 9], dur: 450 }); this.jump(blocker, false); break; }
        const low = v() < .5;
        const aim: P = has('bar') ? [goal[0], 31 + v() * 6] : has('post') ? [goal[0], low ? 37.4 : 30.6] : has('wide') ? [goal[0] + this.fwd(side, 1.5), low ? 41 + v() * 3 : 27 - v() * 3] : has('over') ? [goal[0] + this.fwd(side, 3), 33 + jit(3)] : has('stand') ? [goal[0] + this.fwd(side, 6), low ? 48 : 20] : [goal[0] - this.fwd(side, 1.4), 33.5 + jit(2.4)];
        if (has('dive') || has('saved')) this.lie(k);
        await S({ moves: has('saved') || has('dive') ? { [k]: [goal[0] - this.fwd(side, 1.6), 32] } : {}, ball: aim, arc: has('over') || has('stand') ? 4 : 1, dur: 520 });
        if (!ok()) return;
        if (side === 'us' && ['bar', 'post', 'wide', 'over', 'stand', 'saved', 'dive'].some(has)) sfxOoh();
        if (has('bar')) { await this.barHit(side === 'us' ? 'them' : 'us'); await S({ ball: [goal[0] - this.fwd(side, 10), 27], arc: 2, dur: 450 }); }
        else if (has('saved')) await S({ ball: [goal[0] - this.fwd(side, 6), 24], dur: 400 });
        break;
      }
      case 'header': case 'duel': case 'argue': {
        const p1 = a ?? this.id('us', z), p2 = b ?? this.id('them', z);
        const meet: Record<string, P> = { [p1]: [z[0] - .9, z[1]], [p2]: [z[0] + .9, z[1] + .3] };
        if (st.act === 'header') {
          await S({ moves: this.block(z, meet), ball: [z[0] - this.fwd(this.sideOf(p1), 26), z[1] - 6], cam: z, w: W, dur: 500 });
          await S({ ball: [z[0], z[1] - .4], arc: 12, dur: 700 });
          const win = has('lost') ? p2 : p1;
          this.jump(p1); this.jump(p2);
          await S({ ball: [z[0] + this.fwd(this.sideOf(win), 9), z[1] + (win === p1 ? 4 : -5)], arc: 3, dur: 420 });
          this.jump(p1, false); this.jump(p2, false);
        } else {
          const gap = st.act === 'argue' ? 1.4 : .6;
          await S({ moves: this.block(z, { [p1]: [z[0] - gap, z[1]], [p2]: [z[0] + gap, z[1]] }), ball: [z[0] + 3, z[1] + 3.5], cam: z, w: W - 4, dur: 650 });
          if (st.act === 'argue') this.say(z, '!');
          if (has('both')) { this.lie(p1); this.lie(p2); await this.sleep(450); this.lie(p1, false); this.lie(p2, false); }
        }
        break;
      }
      case 'foul': case 'knock': {
        const fouler = st.act === 'knock' ? (st.who ? this.id(st.who, z, 'them') : this.id('them', z)) : a ?? this.id('them', z);
        const victim = st.act === 'knock' ? this.selfId() : b ?? this.id(this.sideOf(fouler) === 'us' ? 'them' : 'us', z);
        const vSide = this.sideOf(victim);
        await S({ moves: this.block(z, { [victim]: z, [fouler]: [z[0] + this.fwd(vSide, 4), z[1] + 2] }), ball: [z[0] + this.fwd(vSide, .9), z[1]], cam: z, w: W - 4, dur: 550 });
        if (st.act === 'knock' && st.who === undefined) { const me = this.selfId(); await S({ moves: { [me]: [z[0] + this.fwd('us', 2), z[1] - 1] }, dur: 300 }); this.lie(me); await this.sleep(700); this.lie(me, false); break; }
        await S({ moves: { [fouler]: [z[0] + this.fwd(vSide, .8), z[1] + .3] }, dur: 300 });
        if (!ok()) return;
        if (!has('play')) sfxWhistle('short');
        if (has('hand')) { this.say(z, '!'); this.point(this.pos('ref'), 200); break; }
        this.lie(victim);
        if (has('play')) { this.point(this.pos('ref'), -20); const mate = this.nearest(vSide, [z[0] + this.fwd(vSide, 12), z[1]], 3).find((x) => x !== victim)!; await S({ ball: this.pos(mate), dur: 550 }); }
        else { this.say(z, '!'); await S({ moves: { ref: [z[0] - 2, z[1] + 3] }, dur: 600 }); }
        if (st.act === 'knock') { await this.sleep(300); this.lie(victim, false); }
        break;
      }
      case 'out': {
        const side = a ? this.sideOf(a) : st.who === 'them' ? 'them' : 'us';
        const line = z[1] <= 34 ? -1.6 : 69.6;
        const spot: P = has('corner') ? [z[0] > 52 ? 103.5 : 1.5, z[1] <= 34 ? -1 : 69] : [z[0], line];
        await S({ moves: this.block(z, a ? { [a]: [z[0] - this.fwd(side, 3), z[1] <= 34 ? 3 : 65] } : {}), ball: [z[0] - this.fwd(side, 4), z[1] <= 34 ? 3 : 65], cam: [z[0], z[1] <= 34 ? 6 : 62], w: W, dur: 450 });
        await S({ ball: has('stand') ? [z[0], z[1] <= 34 ? -9 : 77] : spot, arc: has('stand') ? 8 : 0, dur: has('slow') ? 700 : 500 });
        if (!ok()) return;
        if (has('ref')) this.point(this.pos('ref'), z[0] > 52 ? 0 : 180);
        if (has('bench')) { this.benchMarks.setAttribute('opacity', '1'); await S({ cam: [z[0] * .6 + 52.5 * .4, 2], w: W + 16, dur: 700 }); }
        if (has('throw')) { const thrower = a ?? this.id(side === 'us' ? 'us' : 'them', spot); await S({ moves: { [thrower]: [spot[0], spot[1]] }, dur: has('slow') ? 650 : 350 }); if (b) await S({ ball: this.pos(b), dur: 350 }); if (has('back') && b) await S({ ball: this.pos(thrower), dur: 300 }); }
        break;
      }
      case 'wall': {
        const taker = a && a !== this.id('us', z) ? a : this.id('us', z);
        const sp: P = [z[0], z[1]];
        const goal = THEIR_GOAL;
        const wall: Record<string, P> = {};
        this.nearest('them', [sp[0] + 9, sp[1]], 4).forEach((id, i) => { wall[id] = [sp[0] + 9, sp[1] - 1.5 + i * 1.1]; });
        await S({ moves: this.block(z, { ...wall, [taker]: [sp[0] - 1.5, sp[1]], t1: [goal[0] - 1.5, 34] }), ball: sp, cam: [sp[0] + 8, sp[1]], w: W - 6, dur: 650 });
        await S({ ball: [sp[0] + 8.6, sp[1]], dur: 320 });
        await S({ ball: [sp[0] - 4, sp[1] + 5], dur: 450 });
        break;
      }
      case 'corner': {
        const att: 'us' | 'them' = st.who === 'them' ? 'them' : 'us';
        const goal = this.goalOf(att);
        const fl: P = [goal[0], z[1] <= 34 ? 0 : 68];
        const box: Record<string, P> = {};
        const attackers = this.nearest(att, [goal[0] - this.fwd(att, 9), 34], 4);
        attackers.forEach((id, i) => { box[id] = [goal[0] - this.fwd(att, 6 + (i % 2) * 3), 28 + i * 4]; });
        if (has('cb')) { box.u4 = [goal[0] - 7, 33]; box.u5 = [goal[0] - 9, 38]; }
        // Опікун — поруч зі «своїм», на крок ближче до воріт і збоку, а не на ньому (QA 17.10: стояли впритул).
        const marked = [...new Set([...attackers, ...(has('cb') ? ['u4', 'u5'] : [])])].slice(-4);
        this.nearest(att === 'us' ? 'them' : 'us', [goal[0] - this.fwd(att, 7), 34], 4).forEach((id, i) => {
          const t = box[marked[i]]; if (t) box[id] = [t[0] + this.fwd(att, 2.2), t[1] + 1.4];
        });
        if (has('keeperup')) box.u1 = [52, 30];
        const taker = this.nearest(att, fl, 1)[0];
        box[taker] = [fl[0] - this.fwd(att, .8), fl[1] + (fl[1] ? -.8 : .8)];
        // Закріплені лише подавальник і ті, кого опікають; опікуни й захисники можуть посунутися — від воротаря й один від одного.
        await S({ moves: this.separate(this.block([goal[0] - this.fwd(att, 12), 34], box), [taker, ...attackers]), ball: [fl[0] - this.fwd(att, .5), fl[1] + (fl[1] ? -.5 : .5)], cam: [goal[0] - this.fwd(att, 12), 30], w: W, dur: 700 });
        const k = att === 'us' ? 't1' : 'u1';
        const land: P = [goal[0] - this.fwd(att, 5), 33];
        await S({ ball: land, arc: 7, moves: has('keeper') ? { [k]: land } : {}, dur: 700 });
        if (has('nothing') || has('cleared')) await S({ ball: [goal[0] - this.fwd(att, 22), 26], arc: 4, dur: 450 });
        break;
      }
      case 'keeper': case 'hold': {
        const holder = a ?? (has('ball') ? undefined : this.id(st.who === 'them' ? 'them' : 'us', z));
        if (!holder) { await S({ moves: this.block(z), ball: [z[0] - 6, z[1] - 4], cam: z, w: W, dur: 500 }); await S({ ball: z, dur: 900 }); break; }
        const side = this.sideOf(holder);
        const hp: P = st.act === 'keeper' ? [z[0] + (side === 'us' ? -3 : 3), 34] : [clamp(z[0] + this.fwd(side, 6), 2, 103), z[1] <= 34 ? 2.5 : 65.5];
        const extra: Record<string, P> = { [holder]: hp };
        if (st.act === 'hold') this.nearest(side === 'us' ? 'them' : 'us', hp, 2).forEach((id, i) => { extra[id] = [hp[0] - this.fwd(side, 1.6), hp[1] + (i ? 1.6 : -1.6)]; });
        if (has('wall')) this.nearest(side, [hp[0] + this.fwd(side, 14), 34], 3).forEach((id, i) => { extra[id] = [hp[0] + this.fwd(side, 12), 31 + i * 1.6]; });
        await S({ moves: this.block(z, extra), ball: [hp[0] + this.fwd(side, .6), hp[1]], cam: [hp[0] + this.fwd(side, 8), st.act === 'hold' ? hp[1] + (hp[1] < 34 ? 8 : -8) : 34], w: W - 6, dur: 650 });
        if (has('hold')) { await S({ moves: { [holder]: [hp[0] + this.fwd(side, 2.5), hp[1] - 3] }, ball: [hp[0] + this.fwd(side, 3), hp[1] - 3], dur: 800 }); if (has('ref')) this.point(this.pos('ref'), 150); }
        if (has('kick')) await S({ ball: [52.5 + this.fwd(side, 12), 30], arc: 14, cam: [52.5, 34], w: W + 14, dur: 900 });
        if (has('shout')) this.say(hp, '!');
        break;
      }
      case 'stoppage': case 'slip': {
        const who = a ?? (st.act === 'slip' ? this.id('them', z) : undefined);
        if (st.act === 'stoppage' && (has('medic') || has('ref') || has('whistle'))) sfxWhistle('short');
        await S({ moves: this.block(z, who ? { [who]: z } : {}), ball: who ? [z[0] + 2, z[1] + 1.5] : z, cam: z, w: W, dur: 600 });
        if (who && (st.act === 'slip' || has('down') || has('medic') || has('none') || st.act === 'stoppage' && st.who === 'them')) this.lie(who);
        if (has('medic')) { this.put('med', this.home.med); this.t.med.g.setAttribute('opacity', '1'); await S({ moves: { med: [z[0] - 2.4, z[1] - 1.6], ref: [z[0] + 4.5, z[1] + 3.5] }, cam: [z[0], z[1] - 6], w: W + 4, dur: 900 }); }
        else if (has('ref') || has('talk')) await S({ moves: { ref: [z[0] + 4, z[1] + 3] }, dur: 600 });
        if (has('ref')) this.say(this.pos('ref'), '⏱');
        if (has('water')) this.say(z, '~');
        if (has('bench')) this.benchMarks.setAttribute('opacity', '1');
        break;
      }
      case 'offside': {
        const runner = a ?? this.id('us', z);
        const side = this.sideOf(runner);
        const lineX = z[0] + this.fwd(side, 4);
        await S({ moves: this.block(z, { [runner]: [lineX - this.fwd(side, 1), z[1] + 3] }), ball: [z[0] - this.fwd(side, 18), z[1]], cam: [lineX, z[1]], w: W, dur: 550 });
        // Прапорець лайнсмена — на ближчій бровці, і кадр опускається до неї, щоб його було видно.
        const top = z[1] <= 34;
        await S({ moves: { [runner]: [lineX + this.fwd(side, 6), z[1] + 3] }, ball: [lineX + this.fwd(side, 6), z[1] + 3], arc: 4, cam: [lineX, top ? 20 : 48], w: W + 6, dur: 650 });
        this.flag.setAttribute('transform', `translate(${lineX},${top ? 1.6 : 67})`); this.flag.setAttribute('opacity', '1'); sfxWhistle('short');
        this.say([lineX + 2, top ? 4 : 64], '!');
        break;
      }
      case 'swap': {
        const p1 = a ?? 'u7', p2 = b ?? 'u9';
        const d = st.tags.includes('them.cb') ? 't4' : this.id('them', z);
        await S({ moves: this.block(z, { [p1]: [z[0] - 2, z[1] - 7], [p2]: [z[0] + 2, z[1] + 7], [d]: [z[0] + 6, z[1]] }), ball: [z[0] - 14, z[1]], cam: z, w: W, dur: 550 });
        this.label([d]);
        await S({ moves: { [p1]: [z[0] + 2, z[1] + 7], [p2]: [z[0] - 2, z[1] - 7] }, dur: 800 });
        this.t[d]?.body.setAttribute('transform', 'rotate(180)');
        break;
      }
      case 'bench': {
        if (has('medic')) { this.put('med', this.home.med); this.t.med.g.setAttribute('opacity', '1'); }
        await S({ cam: [52.5, 2], w: 46, dur: 550 });
        this.benchMarks.setAttribute('opacity', '1');
        if (b && b !== 'sub') { const p = this.pos(b); await S({ moves: { [b]: [46 + v() * 8, 2.5] }, dur: 550 }); await this.sleep(150); await S({ moves: { [b]: p }, dur: 400 }); }
        break;
      }
      case 'enter': {
        // Вихід завжди починається від лави: прапорець «на лаві» в App знімається тим самим рядком, і без
        // цього Реєс спершу стрибав на позицію, а потім «виходив» назад від бровки.
        this.put('u10', BENCH); this.put('sub', this.home.u10); this.t.sub?.g.setAttribute('opacity', '1'); this.t.u10?.g.setAttribute('opacity', '1');
        await S({ cam: [52.5, 4], w: 46, dur: 500 });
        await S({ moves: { u10: [52, 8], sub: BENCH }, dur: 800 });
        this.onBench = false;
        this.t.sub?.g.setAttribute('opacity', '0');
        await S({ moves: { u10: this.home.u10 }, cam: [52.5, 30], w: 52, dur: 550 });
        break;
      }
      case 'wide': case 'crowd': case 'half': {
        const m = st.act === 'crowd' ? this.crowded() : st.act === 'half' ? this.toTunnel() : this.block([52.5, 34]);
        await S({ moves: m, ball: st.act === 'half' ? [52.5, -1] : [52.5 + jit(5), 34], cam: [52.5, st.act === 'half' ? 28 : 34], w: 104, dur: st.act === 'half' ? 1400 : 900 });
        break;
      }
      case 'push': case 'deep': {
        const side = st.who === 'them' ? 'them' : 'us';
        const m: Record<string, P> = {};
        for (const id of [...Object.keys(this.home)]) {
          if (!(side === 'us' ? isUs(id) : id.startsWith('t')) || id === 'u1' || id === 't1' || !this.playing(id)) continue;
          const [x, y] = id === 'sub' ? this.home.u10 : this.home[id];
          m[id] = st.act === 'push' ? [clamp(x + this.fwd(side, 18), 3, 102), y] : [side === 'them' ? clamp(x + 14, 82, 100) : clamp(x - 14, 5, 22), 18 + (y - 4) * .55];
        }
        const c: P = st.act === 'deep' ? [side === 'them' ? 86 : 19, 34] : [z[0], 34];
        await S({ moves: this.separate(m), ball: [c[0] + (side === 'them' ? -14 : 14), 36], cam: c, w: W + 10, dur: 1000 });
        break;
      }
      case 'self': {
        const r = this.onBench ? 'sub' : 'u10';
        const rp: P = [z[0], z[1]];
        const other = a && a !== r ? a : undefined;
        const bm = this.block(z, { [r]: rp });
        const op = other ? bm[other] ?? this.pos(other) : rp;
        await S({ moves: bm, cam: [(rp[0] + op[0]) / 2, (rp[1] + op[1]) / 2], w: Math.max(W - 6, Math.abs(rp[0] - op[0]) + 14, (Math.abs(rp[1] - op[1]) + 12) / .92), dur: 500 });
        if (!ok()) return;
        if (has('tired') || has('rest') || has('sore')) {
          const others: Record<string, P> = {};
          this.nearest('us', rp, 4).filter((x) => x !== r).forEach((id) => { const p = this.pos(id); others[id] = [p[0] + 12, p[1]]; });
          if (a && a !== r) others[a] = [rp[0] + 10, rp[1] - 3];
          // Партнери біжать уперед — і не мають лягти на суперників, що там стоять (QA 17.10).
          const field: Record<string, P> = {};
          for (const id in this.home) if (id !== 'med' && this.playing(id)) field[id] = this.pos(id);
          await S({ moves: this.separate({ ...field, ...others }, [r, ...Object.keys(others)]), ball: [rp[0] + 14, rp[1] - 2], dur: 900 });
          if (has('sore')) { this.t.u10.ring?.classList.add('blink'); await this.sleep(500); this.t.u10.ring?.classList.remove('blink'); }
        } else if (has('ball')) {
          // «…і {them.cb} робить крок назад»: суперник поруч і відступає, коли м'яч приходить
          const foe = a && a.startsWith('t') ? a : undefined;
          const from = a && a !== r && !foe ? a : this.nearest('us', rp, 3).find((x) => x !== r)!;
          if (foe) await S({ moves: { [foe]: [rp[0] + 3, rp[1] + 1] }, dur: 300 });
          await S({ ball: this.pos(from), dur: 250 }); await S({ ball: [rp[0] + .9, rp[1]], ...(foe ? { moves: { [foe]: [rp[0] + 6, rp[1] + 1.5] } } : {}), dur: 500 });
        } else if (has('ignored')) {
          const to = b ?? this.nearest('us', rp, 3).find((x) => x !== r && x !== a)!;
          this.jump(r); await S({ ball: this.pos(to), dur: 550 }); this.jump(r, false);
        } else if (has('fouled')) {
          const f = this.id('them', rp); await S({ moves: { [f]: [rp[0] + .8, rp[1]] }, ball: [rp[0] + .9, rp[1]], dur: 450 }); this.lie(r); await this.sleep(400); this.lie(r, false);
        } else if (has('watch')) {
          await S({ ball: [rp[0] - 18, rp[1] + 4], arc: 10, dur: 800 });
        } else if (has('ref')) {
          await S({ moves: { ref: [rp[0] + 2, rp[1] + 2.5] }, dur: 600 });
        } else if (has('dive')) {
          const f = this.id('them.mid', rp); await S({ moves: { [f]: [rp[0] + 1.6, rp[1] + .5] }, dur: 400 }); this.lie(f);
        }
        break;
      }
      case 'goal': case 'echo': {
        const side: 'us' | 'them' = kind === 'goalThem' ? 'them' : 'us';
        if (st.act === 'echo') { void this.flashOn(side); await this.celebrate(my, side); break; }
        await this.goal(my, side, st.tags[0] ?? 'tap');
        break;
      }
    }
  }

  /** Розв'язка після броску — з точки сцени (FAMILY_SPOT) і за видом ісходу (engine/finale.ts). */
  async finale(kind: FinaleKind, at: P) {
    const spot = this.inPlay(at);
    const my = ++this.run;
    this.quiet();
    const S = (o: Parameters<Director['step']>[1]) => this.step(my, o);
    const r = 'u10';
    const near = this.id('them', spot);
    await S({ moves: this.block(spot, { [r]: spot, [near]: [spot[0] + 2.4, spot[1] + 1.4] }), ball: [spot[0] + .9, spot[1]], cam: spot, w: 44, dur: 450 });
    if (my !== this.run) return;
    const goal = THEIR_GOAL;
    switch (kind) {
      case 'goal': await S({ ball: [goal[0] + .6, 33], dur: 550, cam: [(spot[0] + goal[0]) / 2, 34], w: Math.max(32, goal[0] - spot[0] + 14) }); void this.flashOn('us'); await this.celebrate(my, 'us', r); break;
      case 'save': sfxOoh(); this.lie('t1'); await S({ moves: { t1: [goal[0] - 1.6, 32] }, ball: [goal[0] - 1.4, 32.5], dur: 500, cam: [(spot[0] + goal[0]) / 2, 34] }); await S({ ball: [goal[0] - 7, 24], dur: 400 }); break;
      case 'miss': sfxOoh(); await S({ ball: [goal[0] + 2, 42], dur: 550, cam: [(spot[0] + goal[0]) / 2, 34] }); break;
      case 'pass': { const mate = this.nearest('us', [spot[0] + 8, spot[1]], 3).find((x) => x !== r)!; const run: P = [this.pos(mate)[0] + 7, this.pos(mate)[1]]; await S({ moves: { [mate]: run }, ball: run, dur: 650 }); break; }
      case 'loss': {
        // Суперник забирає й веде до наших воріт — але в полі: біля власного кута 15 м назад було за лінією (QA 17.10).
        const to: P = [clamp(spot[0] - 14, 3, 102), clamp(spot[1] + 4, 3, 65)];
        await S({ moves: { [near]: [spot[0] + .8, spot[1] + .3] }, dur: 300 });
        await S({ moves: { [near]: to }, ball: [to[0] - 1, to[1]], cam: [clamp(spot[0] - 10, 3, 102), spot[1]], dur: 800 });
        break;
      }
      case 'concede': await S({ moves: { [near]: [spot[0] - 20, spot[1]] }, ball: [spot[0] - 21, spot[1]], cam: [spot[0] - 20, 34], w: 50, dur: 700 }); await S({ ball: [-.6, 34], cam: [16, 34], dur: 700 }); void this.flashOn('them'); break;
      case 'foul': case 'red': await S({ moves: { [near]: [spot[0] + .8, spot[1] + .3] }, dur: 300 }); sfxWhistle('short'); this.showRef(); this.lie(near); this.showCard(spot, kind === 'red'); break;
      case 'duel': await S({ moves: { [near]: [spot[0] + .7, spot[1] + .3] }, dur: 300 }); await S({ moves: { [near]: [spot[0] + 6, spot[1] + 5] }, ball: [spot[0] + 3, spot[1] - 1], dur: 450 }); break;
      default: this.jump(r); await this.sleep(350); this.jump(r, false);
    }
    if (my === this.run) void this.idle(my);
  }

  /** Дія Реєса після кидка (17.10, спрощений варіант): шаблон руху з actions.json, місце сцени,
   *  адресат із назви варіанта, кінцівка — за ярусом кидка. ok — вийшло, meh — вийшло з ціною
   *  (суперник поруч), fail — відібрали / воротар узяв / мимо, lost — втрата й їхня контратака.
   *  Гол, пропущений, фол і червона — з ісходу. Замінює загальну розв'язку `finale`. */
  async action(a: { template: ActionTemplate; result: ActionResult; place: P; target?: P | null; end?: string[]; by?: string; counter?: boolean }) {
    const my = ++this.run;
    this.quiet();
    const ok = () => my === this.run;
    const r = 'u10';
    // Варіації (M52, пункт 2): кут удару, бік стрибка воротаря, хто приймає, бік обводки, темп — від сіду
    // матчу й хвилини. Той самий такт після перезавантаження; такий самий удар на іншій хвилині — інший.
    const v = this.rng(`${a.template}/${a.result}/${(a.end ?? []).join(' ')}`);
    const jit = (m: number) => (v() * 2 - 1) * m;
    const pick = <T,>(xs: T[]): T => xs[Math.floor(v() * xs.length)];
    const tempo = .88 + v() * .26;
    const S = (o: Parameters<Director['step']>[1]) => this.step(my, o.dur ? { ...o, dur: o.dur * tempo } : o);
    const spot = this.inPlay([a.place[0] + jit(2.5), a.place[1] + jit(3)]);
    const R = a.result;
    const good = R === 'ok' || R === 'meh' || R === 'goal';
    const near = this.id('them', spot);
    const fwd = (m: number) => spot[0] + m;
    const defending = a.template === 'tackle' || a.template === 'foul';
    // Кінцівка з тексту ісходу (M52, tools/action-ends.ts): хто б'є і чим скінчився удар, далі —
    // кутовий, аут, офсайд, пенальті. Без подій — кінцівку вирішує ярус, як було.
    const end = a.end ?? [];
    const whoTok = end.find((b) => b.startsWith('@'));
    const beats = end.filter((b) => !b.startsWith('@')) as ActionBeat[];
    const has = (b: ActionBeat) => beats.includes(b);
    const shotEnd = beats.find((b) => SHOT_END.includes(b));
    const mateRole = whoTok && whoTok !== '@them' ? whoTok.slice(1) : undefined;
    /** Гол Реєса чи партнера показується «одразу в сітку», лише якщо текст не каже про добивання. */
    const scoresNow = R === 'goal' && !has('rebound');
    let shown = false;
    // Початок: Реєс у точці сцени; у захисних — м'яч у суперника перед ним.
    const foeAt: P = defending ? [clamp(fwd(-3), 3, 102), spot[1] + .6] : [spot[0] + 2.4, spot[1] + 1.4];
    await S({ moves: this.block(spot, { [r]: spot, [near]: foeAt }), ball: defending ? [foeAt[0] - .9, foeAt[1]] : [spot[0] + .9, spot[1]], cam: spot, w: 44, dur: 450 });
    if (!ok()) return;

    /** Втрата: суперник забирає там, де м'яч, і (lost) веде до наших воріт. */
    const lose = async (at: P, who = near) => {
      await S({ moves: { [who]: [at[0] + .8, at[1] + .4] }, ball: at, dur: 350 });
      if (R === 'lost' || R === 'concede') {
        const to: P = [clamp(at[0] - 13 - v() * 6, 3, 102), clamp(at[1] + (34 - at[1]) * (.1 + v() * .4), 3, 65)];
        await S({ moves: { [who]: to }, ball: [to[0] - 1, to[1]], cam: [clamp(at[0] - 10, 3, 102), at[1]], dur: 800 });
      }
    };
    /** Удар із кінцівкою з тексту. `side` — хто б'є (us — по їхніх воротах), `scores` — м'яч у сітці. */
    const strike = async (from: P, shooter: string, side: 'us' | 'them', how: ActionBeat | undefined, scores: boolean) => {
      shown = true;
      const g = this.goalOf(side);
      const f = (m: number) => g[0] - this.fwd(side, m);
      const k = side === 'us' ? 't1' : 'u1';
      const owner = side === 'us' ? 'them' : 'us';
      const cam: P = [(from[0] + g[0]) / 2, (from[1] + 34) / 2];
      const w = Math.max(32, Math.abs(g[0] - from[0]) + 14);
      // Куди летить м'яч: точка в створі, бік стійки, закрутка — свої на кожен удар.
      const aimY = 31 + v() * 6;
      const net: P = [g[0] + this.fwd(side, .6), aimY];
      const hi = v() < .5;
      const curl = pick([0, 0, 1.8, -1.8]);
      // Гол після добивання: перший удар текст не описав — воротар відбиває, добиває інший (after: rebound).
      if (!how && !scores && (side === 'us' ? R === 'goal' : R === 'concede')) how = 'parry';
      const finish = async () => { await S({ ball: net, dur: 300 }); void this.flashOn(side); await this.celebrate(my, side, shooter); };
      if (side === 'us') sfxOoh();
      switch (how) {
        case 'whiff':
          this.lie(shooter);
          await S({ ball: [from[0] + this.fwd(side, 3 + v() * 3), from[1] + jit(2)], dur: 650, cam, w });
          await S({ moves: { [k]: [f(3), 34] }, ball: [f(3.6), 34], dur: 600 });
          return;
        case 'post': case 'bar': {
          const frame: P = how === 'post' ? [g[0], hi ? 30.5 : 37.5] : [g[0], aimY];
          await S({ ball: frame, arc: how === 'bar' ? 4 : curl, cam, w, dur: 560 });
          void this.barHit(owner);
          if (scores) { await finish(); return; }
          await S({ ball: [f(4 + v() * 5), (hi ? 36 : 32) + jit(4)], dur: 380 });
          return;
        }
        case 'over': await S({ ball: [g[0] + this.fwd(side, 2.5 + v() * 3), 34 + jit(4)], arc: 5 + v() * 3, cam, w, dur: 600 }); return;
        case 'wide': await S({ ball: [g[0] + this.fwd(side, 1.5 + v() * 2), hi ? 27.5 - v() * 3 : 40.5 + v() * 3], arc: curl, cam, w, dur: 560 }); return;
        case 'held': {
          // Удар у кут — воротар падає за ним; по центру — забирає стоячи.
          const kp: P = [f(1.8), aimY];
          if (Math.abs(aimY - 34) > 1.8) this.lie(k);
          await S({ moves: { [k]: kp }, ball: [kp[0] - this.fwd(side, .5), kp[1]], arc: curl, cam, w, dur: 560 });
          return;
        }
        case 'parry': case 'tip': {
          this.lie(k);
          const kp: P = [f(1.4), aimY < 34 ? Math.min(aimY, 32) : Math.max(aimY, 36)];
          await S({ moves: { [k]: kp }, ball: kp, arc: curl, cam, w, dur: 520 });
          if (scores) { await finish(); return; }
          // Кінчиками — за лицьову (далі кутовий) збоку чи над поперечиною; відбив — перед собою, у штрафний.
          await S({ ball: how === 'tip' ? [g[0] + this.fwd(side, 1.5), v() < .4 ? 34 + jit(2) : aimY < 34 ? 27 - v() * 2 : 41 + v() * 2] : [f(4 + v() * 4), 34 + (aimY < 34 ? 1 : -1) * (2 + v() * 5)], arc: how === 'tip' ? 3 : 0, dur: 380 });
          return;
        }
        case 'block': {
          const dp: P = [from[0] + this.fwd(side, 2.6), from[1] + .3];
          const def = this.id(side === 'us' ? 'them' : 'us', dp);
          await S({ moves: { [def]: dp }, dur: 220 });
          this.jump(def);
          await S({ ball: [dp[0] - this.fwd(side, .5), dp[1]], dur: 200, cam, w });
          await S({ ball: [dp[0] + this.fwd(side, jit(3)), dp[1] + (hi ? 1 : -1) * (5 + v() * 4)], dur: 420 });
          this.jump(def, false);
          return;
        }
        case 'line': {
          const lp: P = [f(.9), hi ? 32 : 36];
          const def = this.id(side === 'us' ? 'them' : 'us', lp);
          this.lie(k);
          await S({ moves: { [def]: lp, [k]: [f(2.5), hi ? 37 : 31] }, ball: [lp[0] - this.fwd(side, .4), lp[1]], cam, w, dur: 560 });
          await S({ ball: [f(10 + v() * 8), hi ? 8 + v() * 8 : 52 + v() * 8], arc: 6, dur: 520 });
          return;
        }
      }
      if (scores) { await S({ ball: net, arc: curl, cam, w, dur: 550 }); void this.flashOn(side); await this.celebrate(my, side, shooter); return; }
      // Подій удару текст не назвав — як було: «вийшло» — воротар узяв, «вийшло, але» — відбив, інакше мимо.
      if (R === 'ok' || R === 'meh') {
        this.lie(k);
        await S({ moves: { [k]: [f(1.6), aimY] }, ball: [f(1.4), aimY + .5], arc: curl, dur: 500, cam, w });
        await S({ ball: R === 'meh' ? [g[0] + this.fwd(side, 1), aimY < 34 ? 25 : 43] : [f(5 + v() * 4), aimY < 34 ? 24 : 44], dur: 400 });
        return;
      }
      await S({ ball: [g[0] + this.fwd(side, 2), hi ? 27 - v() * 4 : 41 + v() * 4], arc: curl, dur: 550, cam, w });
    };
    /** Удар Реєса (шаблон «удар», голова біля воріт, обведення з голом). */
    const shoot = (from: P) => strike(from, r, 'us', shotEnd, scoresNow);
    /** Передача: ok — прийняв і пішов далі, meh — прийняв під тиском, goal — адресат забиває,
     *  fail/lost — перехоплення на шляху. Якщо текст каже, що адресат бив, — його удар з кінцівкою. */
    const deliver = async (target: P, mate: string, arc = 1, dur = 600) => {
      // Адресат не там, де стоїть сам Реєс: «у штрафний» зі штрафного — це вглиб, а не собі під ноги.
      const raw: P = dist(target, spot) < 7 ? [clamp(spot[0] + 10, 4, 99), spot[1] < 34 ? spot[1] + 8 : spot[1] - 8] : target;
      const to: P = [clamp(raw[0] + jit(a.target ? 1.2 : 2.5), 3, 102), clamp(raw[1] + jit(a.target ? 1.2 : 3), 3, 65)];
      const receiver = mateRole ? this.id(mateRole, to) : mate;
      if (good || (shotEnd && whoTok !== '@them')) {
        await S({ moves: { [receiver]: to }, ball: to, arc, cam: [(spot[0] + to[0]) / 2, (spot[1] + to[1]) / 2], w: Math.max(44, Math.abs(to[0] - spot[0]) + 16, (Math.abs(to[1] - spot[1]) + 14) / .92), dur });
        if (!ok()) return;
        if (shotEnd || R === 'goal') {
          // Адресат далеко від воріт — спершу доходить до удару.
          let from = to;
          if (to[0] < 72) { from = [clamp(to[0] + 14, 4, 90), to[1] + (34 - to[1]) * .4]; await S({ moves: { [receiver]: from }, ball: [from[0] + .8, from[1]], cam: from, dur: 500 }); }
          if (ok()) await strike(from, receiver, 'us', shotEnd, scoresNow);
        }
        else if (R === 'meh') { const foe = this.id('them', to); await S({ moves: { [foe]: [to[0] + 1.2, to[1] + 1] }, dur: 350 }); }
        else if (good && a.template === 'pass' && v() < .5) {
          // Стінка: адресат віддає в дотик назад у хід Реєсу.
          const run: P = [clamp(to[0] + 5 + v() * 3, 3, 100), spot[1] + (to[1] - spot[1]) * .3];
          await S({ moves: { [r]: run }, ball: [run[0] + .8, run[1]], cam: run, dur: 520 });
        }
        else if (good) await S({ moves: { [receiver]: [clamp(to[0] + 3 + v() * 3, 2, 103), to[1] + jit(2)] }, ball: [clamp(to[0] + 4 + v() * 3, 2, 103), to[1] + jit(2)], dur: 450 });
      } else {
        const mid: P = [(spot[0] + to[0]) / 2, (spot[1] + to[1]) / 2];
        const cut = this.id('them', mid);
        await S({ moves: { [receiver]: to, [cut]: mid }, ball: mid, arc: arc * .5, cam: mid, dur: dur * .7 });
        if (ok()) await lose(mid, cut);
      }
    };
    /** Хто з двох найближчих партнерів приймає — теж варіація. */
    const mateNear = (p: P) => pick(this.nearest('us', p, 4).filter((x) => x !== r).slice(0, 2));

    if (has('pen')) {
      // Пенальті (текст: «суддя свистить пенальті», «пенальті є, {striker} б'є у стійку»): Реєса збивають у
      // штрафному, свисток, суддя показує на позначку — і лише потім удар з позначки, якщо текст його називає.
      shown = true;
      // Падає збоку від позначки, не на ній: на позначку потім ставлять м'яч і підходить той, хто б'є.
      const box: P = [PW - 8.5, spot[1] <= 34 ? 28.5 : 39.5];
      await S({ moves: this.block(box, { [r]: box, [near]: [box[0] + 1.3, box[1] + .7] }), ball: [box[0] + .9, box[1]], cam: [PW - 15, 34], w: 38, dur: 520 });
      if (!ok()) return;
      this.lie(r); sfxWhistle('short'); this.showRef();
      const pen: P = [PW - 11, 34], refAt: P = [PW - 15, 41];
      await S({ moves: { ref: refAt }, ball: pen, dur: 600 });
      this.point(refAt, Math.atan2(pen[1] - refAt[1], pen[0] - refAt[0]) * 180 / Math.PI);
      await this.sleep(500);
      if (ok() && (shotEnd || R === 'goal')) {
        const taker = mateRole ? this.id(mateRole, pen) : a.by ? this.id(a.by, pen) : r;
        if (taker === r) this.lie(r, false);
        await S({ moves: { [taker]: [pen[0] - 1.6, 34], t1: [PW - .6, 34] }, dur: 450 });
        if (ok()) await strike(pen, taker, 'us', shotEnd, scoresNow);
      }
    } else if (whoTok === '@them' && shotEnd) {
      // Їхній удар по наших воротах (текст: «{them.striker} б'є — {keeper} відбиває»): Реєс лишається там,
      // де програв чи закрив, суперник доходить до удару — і кінцівка з тексту.
      const shooter = near;
      const from: P = spot[0] < 34 ? [clamp(spot[0] - 3 + jit(3), 10, 30), spot[1] + (34 - spot[1]) * .4 + jit(3)] : [20 + v() * 6, spot[1] + (34 - spot[1]) * .5 + jit(3)];
      if (defending || a.template === 'run' || a.template === 'shield') await S({ moves: { [r]: [foeAt[0] - 1.6, foeAt[1]] }, dur: 300 });
      await S({ moves: { [shooter]: from }, ball: [from[0] - .9, from[1]], cam: [(from[0] + 12) / 2, 34], w: 46, dur: dist(from, this.pos(shooter)) > 10 ? 750 : 400 });
      if (!ok()) return;
      await strike(from, shooter, 'them', shotEnd, R === 'concede' && !has('rebound'));
    } else switch (a.template) {
      case 'pass': case 'back': case 'through': case 'switch': case 'cross': {
        let to: P; let mate: string; let arc = 1; let dur = 600;
        if (a.template === 'through') { mate = this.id('striker', spot); to = [clamp(fwd(20), 8, 99), spot[1] + (34 - spot[1]) * .5]; dur = 750; }
        else if (a.template === 'cross') { mate = this.id('striker', spot); to = [PW - 7, spot[1] < 34 ? 38 : 30]; arc = 8; dur = 800; }
        else if (a.template === 'switch') { to = [clamp(fwd(6), 8, 99), spot[1] < 34 ? 58 : 10]; mate = mateNear(to); arc = 10; dur = 1000; }
        else if (a.template === 'back') { to = [clamp(fwd(-12), 4, 101), spot[1] + (34 - spot[1]) * .3]; mate = mateNear(to); }
        else { to = [clamp(fwd(9), 4, 101), spot[1] + (spot[1] < 34 ? 4 : -4)]; mate = mateNear(to); }
        // Адресат із назви варіанта («на дугу», «на дальню») важливіший за загальний шаблон.
        if (a.target) { to = a.target; if (a.template !== 'through' && a.template !== 'cross') mate = mateNear(to); }
        // Воротар знімає подачу (текст: «воротар спокійно знімає м'яч у повітрі») — м'яч до нього, а не на перехоплення.
        if (shotEnd === 'held' && !mateRole && !good) {
          shown = true;
          await S({ moves: { t1: [PW - 4.5, clamp(to[1], 30, 38)] }, ball: [PW - 4.5, clamp(to[1], 30, 38)], arc, cam: [(spot[0] + PW) / 2, 34], w: Math.max(40, PW - spot[0] + 12), dur });
          if (a.counter && ok()) await S({ ball: this.pos(this.id('them', [70, 34])), arc: 8, cam: [70, 34], dur: 800 });
          break;
        }
        await deliver(to, mate, arc, dur);
        break;
      }
      case 'shot': await shoot(spot); break;
      case 'header': {
        await S({ ball: [spot[0], spot[1] - .3], arc: 12, dur: 700 });
        this.jump(r); this.jump(near);
        if (spot[0] > 86) await shoot(spot);
        else await deliver([clamp(fwd(9), 4, 101), spot[1] + 3], mateNear([fwd(9), spot[1]]), 3, 450);
        this.jump(r, false); this.jump(near, false);
        break;
      }
      case 'dribble': {
        // Обводка йде вперед, тож починається не ближче за край штрафного: сцена «біля воріт» інакше
        // вела Реєса назад від воріт (запис 19.10).
        const x0 = Math.min(spot[0], 82);
        const fwd = (m: number) => x0 + m;
        if (x0 < spot[0]) await S({ moves: { [r]: [x0, spot[1]] }, ball: [x0 + .9, spot[1]], cam: [x0 + 6, spot[1]], dur: 350 });
        await S({ moves: { [near]: [fwd(2.6), spot[1]] }, dur: 300 });
        if (good || shotEnd) {
          // Три обводки: зміщення вбік, прокинути повз і оббігти, розворот на місці. Бік — теж варіація.
          const side = pick([3, -3]);
          const how = pick(['cut', 'knock', 'spin'] as const);
          if (how === 'knock') {
            await S({ ball: [Math.min(fwd(7), 91), spot[1] + side * .5], dur: 300 });
            await S({ moves: { [r]: [fwd(3), spot[1] - side * .9] }, dur: 260 });
          } else if (how === 'spin') {
            const body = this.t[r].body;
            await Promise.all([S({ moves: { [r]: [fwd(2), spot[1] + side * .7] }, ball: [fwd(2.6), spot[1] + side * .7], dur: 380 }),
              this.raw(380, (k) => body.setAttribute('transform', k >= 1 ? '' : `rotate(${(k * 360 * (side > 0 ? 1 : -1)).toFixed(0)})`))]);
          } else await S({ moves: { [r]: [fwd(3), spot[1] + side] }, ball: [fwd(3.8), spot[1] + side], dur: 350 });
          const done: Record<string, P> = { [r]: [clamp(fwd(9), 3, 91), spot[1] + side * .3], [near]: R === 'meh' ? [fwd(7.5), spot[1] + side * .9] : [fwd(2.6), spot[1] - side * .3] };
          await S({ moves: this.separate({ ...this.field(), ...done }, [r, near]), ball: [clamp(fwd(9.8), 3, 92), spot[1] + side * .3], dur: 450 });
          if (R === 'ok' && !shotEnd) this.lie(near);
          if (R === 'goal' || shotEnd) await shoot([clamp(fwd(9), 3, 99), spot[1]]);
        } else await lose([fwd(2), spot[1]]);
        break;
      }
      case 'tackle': {
        await S({ moves: { [r]: [foeAt[0] - 1.6, foeAt[1]] }, dur: 350 });
        if (good) {
          // Відбір стоячи або в підкаті — у підкаті Реєс на газоні, поки м'яч іде партнерові.
          const slide = v() < .45;
          if (slide) this.lie(r); else this.lie(near);
          await S({ moves: { [r]: [foeAt[0] - 1, foeAt[1] + .4] }, ball: [foeAt[0] - .2, foeAt[1] + .6 + jit(.8)], dur: 250 });
          await S({ ball: R === 'meh' ? [foeAt[0] + 2 + jit(2), foeAt[1] + (v() < .5 ? 5 : -5)] : this.pos(mateNear([fwd(6), spot[1]])), dur: 450 });
          if (slide) this.lie(r, false);
        } else {
          await S({ moves: { [near]: [clamp(foeAt[0] - 6, 3, 102), foeAt[1] - 2] }, ball: [clamp(foeAt[0] - 6.8, 3, 102), foeAt[1] - 2], dur: 400 });
          if (R === 'lost' || R === 'concede') await lose(this.ballP);
        }
        break;
      }
      case 'shield': {
        await S({ moves: { [near]: [spot[0] - 1.6, spot[1] + .3] }, dur: 300 });
        await S({ moves: { [r]: [spot[0] + .4, spot[1] - .4] }, dur: 300 });
        if (good) await deliver([clamp(fwd(-4), 3, 102), spot[1] + (spot[1] < 34 ? 7 : -7)], mateNear([fwd(-4), spot[1]]), 1, 450);
        else await lose([spot[0] - 1, spot[1] + 2]);
        break;
      }
      case 'run': {
        const back = spot[0] < 45;
        // Біля їхньої лицьової вперед бігти нікуди — ривок поперек, у штрафний.
        const end: P = !back && spot[0] > 80 ? [spot[0] - 2 + jit(2), spot[1] < 34 ? spot[1] + 10 + v() * 4 : spot[1] - 10 - v() * 4] : [clamp(fwd((back ? -1 : 1) * (11 + v() * 6)), 12, 93), spot[1] + jit(4)];
        const foe = this.id('them', end);
        const dash: Record<string, P> = { [r]: good ? end : [(spot[0] + end[0]) / 2, (spot[1] + end[1]) / 2], [foe]: good ? [end[0] + (back ? -2 : 2), end[1] + 2] : end };
        await S({ moves: this.separate({ ...this.field(), ...dash }, [r, foe]), ball: [end[0] + .9, end[1] + (good ? 0 : .4)], cam: [(spot[0] + end[0]) / 2, end[1]], w: 50, dur: 900 });
        if (mateRole && shotEnd && ok()) await deliver([clamp(end[0] + 10, 4, 99), 34 + (end[1] - 34) * .3], this.id(mateRole, end), 1, 500);
        else if (!good) await lose(end, foe);
        break;
      }
      case 'foul': {
        await S({ moves: { [r]: [foeAt[0] - .8, foeAt[1] + .3] }, dur: 300 });
        this.lie(near); sfxWhistle('short'); this.showRef();
        if (R === 'foul' || R === 'red') this.showCard(spot, R === 'red');
        break;
      }
      case 'hold': case 'talk': {
        if (a.template === 'talk') { this.say(spot, '!'); this.point(spot, spot[1] < 34 ? 60 : -60); }
        if (mateRole && shotEnd) { await S({ moves: this.block([spot[0] + 4, spot[1]], { [r]: spot }), dur: 500 }); await deliver([clamp(spot[0] + 10, 4, 99), 34 + (spot[1] - 34) * .4], this.id(mateRole, spot), 3, 600); }
        else if (good) {
          // Тримати й віддати: поруч, назад центральному чи на фланг.
          const toward = pick<P>([spot, [spot[0] - 12, spot[1]], [spot[0] + 2, spot[1] < 34 ? spot[1] + 14 : spot[1] - 14]]);
          await S({ moves: this.block([spot[0] + 4, spot[1]], { [r]: spot }), dur: 700 });
          await S({ ball: this.pos(mateNear(toward)), arc: dist(toward, spot) > 10 ? 2 : 0, dur: 450 });
        }
        else await lose([spot[0] + 2, spot[1] + 1.5]);
        break;
      }
    }
    if (!ok()) return;
    await this.after(my, beats.filter((b) => b !== 'pen'), { shooterSide: whoTok === '@them' ? 'them' : 'us', rebounder: a.by ? this.id(a.by, this.ballP) : undefined, scores: R === 'goal' || R === 'concede', shown });
    if (!ok()) return;
    // Ісход сильніший за шаблон: червона чи фол — свисток і картка; пропущений — м'яч у наші ворота.
    if ((R === 'red' || R === 'foul') && a.template !== 'foul') { sfxWhistle('short'); this.showRef(); this.lie(near); this.showCard(this.pos(near), R === 'red'); }
    if (R === 'concede' && !(whoTok === '@them' && shotEnd)) { await S({ ball: [-.6, 34], cam: [16, 34], w: 50, dur: 800 }); void this.flashOn('them'); }
    if (has('down')) this.lie(r);
    if (ok()) void this.idle(my);
  }

  /** Що було після удару чи передачі — у порядку, в якому це називає текст ісходу (M52):
   *  добивання, кутовий, аут, офсайд, фол на Реєсі. Пенальті грає `action` — до удару з позначки. */
  private async after(my: number, beats: ActionBeat[], o: { shooterSide: 'us' | 'them'; rebounder?: string; scores: boolean; shown: boolean }) {
    const S = (st: Parameters<Director['step']>[1]) => this.step(my, st);
    const side = o.shooterSide;
    for (const b of beats) {
      if (my !== this.run) return;
      const ball = this.ballP;
      // Ворота, біля яких усе відбувається: удар — ворота, по яких били; інакше — ближчі до м'яча.
      const g = o.shown ? this.goalOf(side) : ball[0] > 52.5 ? THEIR_GOAL : OUR_GOAL;
      const att: 'us' | 'them' = g === THEIR_GOAL ? 'us' : 'them';
      const hi = ball[1] < 34;
      switch (b) {
        case 'rebound': {
          const who = o.rebounder ?? this.nearest(side, ball, 1)[0];
          if (!who) break;
          await S({ moves: { [who]: [ball[0] - this.fwd(side, .8), ball[1]] }, dur: 320 });
          if (o.scores) {
            await S({ ball: [this.goalOf(side)[0] + this.fwd(side, .6), 34], dur: 300 });
            void this.flashOn(side); await this.celebrate(my, side, who);
          }
          break;
        }
        case 'corner': {
          // М'яч за лицьову — і хтось із тих, хто атакує, іде до прапорця ставити м'яч.
          const flag: P = [g[0], hi ? 0 : PH];
          if (Math.abs(ball[0] - g[0]) > 1) await S({ ball: [g[0] + (g === THEIR_GOAL ? 1.5 : -1.5), hi ? clamp(ball[1], 2, 26) : clamp(ball[1], 42, 66)], dur: 380 });
          const taker = this.nearest(att, flag, 1)[0];
          await S({ moves: taker ? { [taker]: [flag[0] + (g === THEIR_GOAL ? -1.2 : 1.2), flag[1] + (hi ? 1.2 : -1.2)] } : {}, ball: [flag[0] + (g === THEIR_GOAL ? -.6 : .6), flag[1] + (hi ? .6 : -.6)], cam: [g[0] + (g === THEIR_GOAL ? -14 : 14), hi ? 14 : 54], w: 40, dur: 750 });
          break;
        }
        case 'out': {
          // Біля воріт — за лицьову (від воріт); деінде — за бокову, і хтось іде вкидати.
          const nearGoal = Math.abs(ball[0] - g[0]) < 14 && Math.abs(ball[1] - 34) < 22;
          const outP: P = nearGoal ? [g[0] + (g === THEIR_GOAL ? 1.6 : -1.6), ball[1] < 34 ? 24 : 44] : [ball[0], hi ? -1.4 : PH + 1.4];
          await S({ ball: outP, cam: [clamp(outP[0], 20, 85), clamp(outP[1], 14, 54)], dur: 450 });
          if (!nearGoal) { const thrower = this.nearest(ball[0] > 52.5 ? 'us' : 'them', outP, 1)[0]; if (thrower) await S({ moves: { [thrower]: [outP[0], hi ? .6 : PH - .6] }, dur: 450 }); }
          break;
        }
        case 'offside': {
          const top = hi;
          this.flag.setAttribute('transform', `translate(${ball[0]},${top ? 1.6 : 67})`); this.flag.setAttribute('opacity', '1'); sfxWhistle('short');
          await S({ cam: [ball[0], top ? 20 : 48], dur: 400 });
          break;
        }
        case 'fk': {
          sfxWhistle('short'); this.showRef(); this.lie('u10');
          await S({ moves: { ref: [this.pos('u10')[0] - 3, this.pos('u10')[1] + 3] }, ball: [this.pos('u10')[0] + .9, this.pos('u10')[1]], dur: 450 });
          break;
        }
      }
    }
  }

  /** Сцена відкрилася десь на полі — усі на позиції від неї, Реєс у точці, камера туди ж. */
  async toSpot(at: P) {
    const spot = this.inPlay(at);
    const my = ++this.run;
    this.quiet();
    await this.step(my, { moves: this.block(spot, this.onBench ? {} : { u10: spot }), ball: [spot[0] + .9, spot[1]], cam: spot, w: 44, dur: 500 });
    void this.idle(my);
  }

  /** Де зараз стоять усі, хто грає, — щоб розвести фішки в кінцевій точці руху. */
  private field(): Record<string, P> {
    const f: Record<string, P> = {};
    for (const id in this.home) if (id !== 'med' && id !== 'ref' && this.playing(id)) f[id] = this.pos(id);
    return f;
  }

  /** Точка сцени для фішки Реєса — у грі, а не на лінії: у сцен тренера точка на самій бровці
   *  (FAMILY_SPOT.coach — так її бачить дошка), і Реєс лишався стояти там на наступних рядках. */
  private inPlay(p: P): P { return [clamp(p[0], 4, 101), clamp(p[1], 6, 62)]; }

  /** Фон між рядками стрічки (17.10, зауваження користувача: «поле стоїть, коли немає подій»). Формальний
   *  розіграш: команда катає м'яч у середній третині, блок зсувається за ним — і заодно повертає в стрій
   *  тих, хто лишився біля бровки чи в кутку після попередньої постановки. Без ударів і без штрафного:
   *  фон не має вигадувати моментів, яких немає в стрічці. Новий рядок або розв'язка зупиняють його
   *  (лічильник `run`); при «менше руху» фону немає. */
  private async idle(my: number) {
    if (this.reduced || this.dead) return;
    await this.sleep(1100);
    let side: 'us' | 'them' = this.sideOf(this.nearest('us', this.ballP, 1).concat(this.nearest('them', this.ballP, 1))
      .sort((x, y) => dist(this.pos(x), this.ballP) - dist(this.pos(y), this.ballP))[0] ?? 'u8');
    let first = true;
    while (my === this.run && !this.dead) {
      if (Math.random() < .22) side = side === 'us' ? 'them' : 'us';
      const near = this.nearest(side, this.ballP, 5).filter((id) => dist(this.pos(id), this.ballP) > 3.5);
      const to = near[Math.floor(Math.random() * Math.min(3, near.length))];
      if (!to) return;
      const p = this.pos(to);
      const target: P = [clamp(p[0], 22, 83), clamp(p[1], 8, 60)];
      const bm = this.block(target);
      const recv = bm[to] ?? target;
      const ball: P = [clamp(recv[0], 22, 83), clamp(recv[1], 8, 60)];
      if (first) { for (const id in this.t) if (id !== 'u10') this.t[id].label?.setAttribute('opacity', '0'); this.t.ref?.g.setAttribute('opacity', '0'); first = false; }
      this.idling = true;
      await this.step(my, { moves: { ...bm, [to]: ball }, ball, cam: ball, w: 52, dur: 1100 + Math.random() * 500 });
      this.idling = false;
      if (my !== this.run) return;
      await this.sleep(500 + Math.random() * 900);
    }
  }

  // ——— голи —————————————————————————————————————————————————————————————
  private async goal(my: number, side: 'us' | 'them', manner: string) {
    const S = (o: Parameters<Director['step']>[1]) => this.step(my, o);
    const goal = this.goalOf(side);
    const k = side === 'us' ? 't1' : 'u1';
    const scorer = side === 'us' ? 'u9' : 't9';
    // Гол стрічки теж не однаковий (M52): точка в сітці від сіду матчу й хвилини.
    const gv = this.rng(`goal/${side}/${manner}`);
    const net: P = [goal[0] + this.fwd(side, .6), 31.4 + gv() * 5.2];
    const cam = (p: P, w = 40) => ({ cam: p, w });
    const finish = async (from: P, dur = 480) => { await S({ moves: { [scorer]: from }, dur: 200 }); await S({ ball: net, dur, moves: { [k]: [goal[0] - this.fwd(side, 1.6), from[1] < 34 ? 35 : 32] } }); };
    const setup = (p: P, extra: Record<string, P> = {}) => S({ moves: this.block(p, extra), ball: p, ...cam([(p[0] + goal[0]) / 2, 34], Math.max(34, Math.abs(goal[0] - p[0]) + 16)), dur: 420 });
    switch (manner) {
      case 'cutback': case 'header': case 'corner': {
        const flank = manner === 'corner' ? [goal[0], 0] as P : [goal[0] - this.fwd(side, 4), 6] as P;
        const crosser = side === 'us' ? (manner === 'corner' ? 'u7' : 'u7') : 't7';
        const spot: P = manner === 'cutback' ? [goal[0] - this.fwd(side, 9), 30] : [goal[0] - this.fwd(side, 6), 35];
        await setup(flank, { [crosser]: flank, [scorer]: [spot[0] - this.fwd(side, 4), spot[1] + 4] });
        await S({ moves: { [scorer]: spot }, ball: spot, arc: manner === 'cutback' ? 0 : 7, dur: 560 });
        if (manner !== 'cutback') this.jump(scorer);
        await S({ ball: net, dur: 380 }); this.jump(scorer, false);
        break;
      }
      case 'rebound': {
        const shot: P = [goal[0] - this.fwd(side, 16), 32];
        await setup(shot, { [this.nearest(side, shot, 2).find((x) => x !== scorer)!]: shot, [scorer]: [goal[0] - this.fwd(side, 8), 38] });
        this.lie(k); await S({ ball: [goal[0] - this.fwd(side, 1.5), 34], dur: 360 });
        await S({ ball: [goal[0] - this.fwd(side, 6), 37], dur: 220 });
        await finish([goal[0] - this.fwd(side, 6.5), 37], 300);
        break;
      }
      case 'solo': case 'counter': case 'turn': case 'error': {
        const start: P = manner === 'counter' ? [52.5, 34] : manner === 'turn' ? [goal[0] - this.fwd(side, 17), 34] : [goal[0] - this.fwd(side, 24), 30];
        await setup(start, { [scorer]: start });
        if (manner === 'error') { const d = this.id(side === 'us' ? 'them.cb' : 'cb2', start); this.lie(d); }
        if (manner === 'turn') { this.t[scorer].body.setAttribute('transform', 'rotate(180)'); await this.sleep(180); this.t[scorer].body.removeAttribute('transform'); }
        const run: P = [goal[0] - this.fwd(side, 9), 33];
        await S({ moves: { [scorer]: run }, ball: [run[0] + this.fwd(side, 1), run[1]], ...cam([(run[0] + goal[0]) / 2, 34]), dur: manner === 'counter' ? 650 : 480 });
        await S({ ball: net, dur: 360 });
        break;
      }
      case 'long': case 'low': {
        const sp: P = [goal[0] - this.fwd(side, manner === 'long' ? 26 : 17), manner === 'long' ? 30 : 36];
        await setup(sp, { [scorer]: sp });
        await S({ ball: [goal[0] + this.fwd(side, .6), manner === 'low' ? 36.6 : 31], arc: manner === 'long' ? 3 : 0, dur: 520, moves: { [k]: [goal[0] - this.fwd(side, 1.6), 34] } });
        break;
      }
      case 'pen': {
        const sp: P = [goal[0] - this.fwd(side, 11), 34];
        await setup(sp, { [scorer]: [sp[0] - this.fwd(side, 2), 34], [k]: [goal[0] - this.fwd(side, .4), 34] });
        this.lie(k);
        await S({ moves: { [k]: [goal[0] - this.fwd(side, .5), 37] }, ball: [goal[0] + this.fwd(side, .6), 31.4], dur: 450 });
        break;
      }
      default: {
        const sp: P = [goal[0] - this.fwd(side, 5), 33];
        await setup([goal[0] - this.fwd(side, 12), 34], { [scorer]: sp });
        await S({ ball: sp, dur: 350 });
        await S({ ball: net, dur: 300 });
      }
    }
    if (my !== this.run) return;
    void this.flashOn(side);
    await this.celebrate(my, side, scorer);
  }

  private async celebrate(my: number, side: 'us' | 'them', scorer = side === 'us' ? 'u9' : 't9') {
    if (my !== this.run || this.dead || !this.t[scorer]) return;
    let h = this.clock * 7;
    for (const c of scorer) h += c.charCodeAt(0);
    const kind = this.forceCelebration ?? CELEBRATIONS[h & 3];
    const goal = this.goalOf(side);
    const from = this.pos(scorer);
    const up = from[1] < 34;
    const sc = this.t[scorer];
    const pose = (tr: string) => sc.body.setAttribute('transform', tr);
    const mates = this.nearest(side, from, 4).filter((x) => x !== scorer).slice(0, 3);
    const toward = (p: P, i: number): P => { const a = i * 2.1 + .6; return [clamp(p[0] + Math.cos(a) * 2.3, 1, 104), clamp(p[1] + Math.sin(a) * 2.3, 1, 67)]; };
    const mateMoves = (at: P, shift: number) => Object.fromEntries(mates.map((m, i) => [m, toward(at, i + shift)]));
    this.label([scorer]);
    /** Біг автора кривою (квадратична дуга через `via`) з позою на кожному кадрі; камера — за ним. */
    const along = (to: P, via: P, dur: number, ease: (k: number) => number, look: (k: number) => string, w = 34) => {
      const a = this.pos(scorer), v0 = this.view, v1 = this.frame([a[0] + (to[0] - a[0]) * .7, a[1] + (to[1] - a[1]) * .7], w);
      return this.raw(dur, (k0) => {
        if (my !== this.run) return;
        const k = ease(k0), q = 1 - k;
        this.put(scorer, [q * q * a[0] + 2 * q * k * via[0] + k * k * to[0], q * q * a[1] + 2 * q * k * via[1] + k * k * to[1]]);
        pose(look(k0));
        this.setView({ x: v0.x + (v1.x - v0.x) * k0, y: v0.y + (v1.y - v0.y) * k0, w: v0.w + (v1.w - v0.w) * k0, h: v0.h + (v1.h - v0.h) * k0 });
      });
    };
    const lin = (k: number) => k, out = (k: number) => 1 - (1 - k) * (1 - k);
    switch (kind) {
      case 'knees': {
        // Розгін до бровки — і ковзання на колінах: фішка нижча й ширша, за нею слід по газону.
        const edge = up ? 4 : PH - 4;
        const run: P = [clamp(from[0] - this.fwd(side, 6), 6, 99), (from[1] + edge) / 2];
        const end: P = [clamp(run[0] - this.fwd(side, 7), 4, 101), edge];
        await along(run, [(from[0] + run[0]) / 2, from[1]], 450, lin, () => '');
        if (my !== this.run) return;
        const skid = this.el('path', { d: `M${run[0]},${run[1]} L${run[0]},${run[1]}`, class: 'pc-skid' });
        this.svg.insertBefore(skid, this.ballShadow);
        void this.step(my, { moves: mateMoves(end, 1), dur: 1100 });
        const low = (k: number) => Math.min(1, k * 4);
        await along(end, [(run[0] + end[0]) / 2, (run[1] + end[1]) / 2], 650, out, (k) => {
          const p = this.pos(scorer);
          skid.setAttribute('d', `M${run[0]},${run[1]} L${p[0].toFixed(2)},${p[1].toFixed(2)}`);
          return `translate(0,${(.35 * low(k)).toFixed(2)}) scale(${(1 + .18 * low(k)).toFixed(2)},${(1 - .32 * low(k)).toFixed(2)})`;
        });
        await this.sleep(450);
        skid.remove();
        break;
      }
      case 'flag': {
        // До кутового прапорця з боку, де забив; біля прапорця — удар по ньому і купа зверху.
        const c = this.corners.find((x) => x.p[0] === goal[0] && (x.p[1] === 0) === up)!;
        const end: P = [c.p[0] - this.fwd(side, 3.2), c.p[1] + (up ? 2.6 : -2.6)];
        void this.step(my, { moves: mateMoves(end, 2), dur: 750 });
        await along(end, [(from[0] + end[0]) / 2, (from[1] + end[1]) / 2 + (up ? 3 : -3)], 700, lin, () => '', 24);
        if (my !== this.run) return;
        const [cx, cy] = c.p;
        // Прапорець хитається і на мить більшає — інакше під фішкою його не видно.
        await this.raw(700, (k) => {
          const z = 1 + .6 * Math.sin(Math.PI * k), t = (z - 1) / z;
          c.g.setAttribute('transform', `rotate(${(Math.sin(k * Math.PI * 4) * 45 * (1 - k)).toFixed(1)} ${cx} ${cy}) scale(${z.toFixed(3)}) translate(${(-cx * t).toFixed(2)},${(-cy * t).toFixed(2)})`);
        });
        c.g.removeAttribute('transform');
        // Купа: партнери накривають автора майже впритул.
        await this.step(my, { moves: Object.fromEntries(mates.map((m, i) => { const a = i * 2.1; return [m, [end[0] + Math.cos(a) * 1.1, end[1] + Math.sin(a) * 1.1] as P]; })), dur: 300 });
        break;
      }
      case 'jump': {
        // Стрибки на місці: тінь лишається на землі, фішка злітає. Партнери підбігають і стрибають теж.
        const end: P = [clamp(from[0] - this.fwd(side, 4), 4, 101), clamp(from[1] + (34 - from[1]) * .2, 4, 64)];
        await along(end, [(from[0] + end[0]) / 2, (from[1] + end[1]) / 2], 300, lin, () => '');
        void this.step(my, { moves: mateMoves(end, 0), dur: 600 });
        await this.raw(1400, (k) => {
          if (my !== this.run) return;
          const hop = (ph: number) => Math.abs(Math.sin((k * 3 + ph) * Math.PI)) * 2.6;
          const hh = hop(0);
          pose(`translate(0,${(-hh).toFixed(2)}) scale(${(1 + hh * .08).toFixed(3)})`);
          if (k > .5) mates.forEach((m, i) => this.t[m].body.setAttribute('transform', `translate(0,${(-hop(i * .3) * .7).toFixed(2)})`));
        });
        mates.forEach((m) => this.t[m].body.removeAttribute('transform'));
        break;
      }
      case 'plane': {
        // «Літачок»: широка дуга до центру з креном — номер на фішці хилиться то в один, то в інший бік.
        const end: P = [clamp(from[0] - this.fwd(side, 14), 6, 99), 34 + (up ? 6 : -6)];
        const via: P = [from[0] - this.fwd(side, 3), up ? 2 : PH - 2];
        void this.step(my, { moves: mateMoves(end, 1), dur: 1300 });
        await along(end, via, 1300, lin, (k) => `rotate(${(Math.sin(k * Math.PI * 3) * 32).toFixed(1)}) scale(1.12,.92)`, 40);
        break;
      }
    }
    pose('');
  }

  /** Твін без «повільно-швидко-повільно» з `tween` — для власних кривих руху святкування. */
  private raw(dur: number, f: (k: number) => void): Promise<void> {
    if (this.reduced || dur <= 0) { f(1); return Promise.resolve(); }
    return new Promise((res) => {
      const t0 = performance.now();
      const tick = (now: number) => { const k = Math.min(1, (now - t0) / dur); f(k); if (k < 1 && !this.dead) requestAnimationFrame(tick); else res(); };
      requestAnimationFrame(tick);
    });
  }

  // ——— вибірки —————————————————————————————————————————————————————————
  private nearest(side: 'us' | 'them', p: P, n: number): string[] {
    return Object.keys(this.t)
      .filter((id) => (side === 'us' ? isUs(id) : id.startsWith('t')) && !['u1', 't1'].includes(id) && this.playing(id))
      .sort((x, y) => dist(this.pos(x), p) - dist(this.pos(y), p))
      .slice(0, n);
  }
  private atLane(side: 'us' | 'them', x: number, y: number): string { return this.nearest(side, [x, y], 1)[0]; }
  private crowded(): Record<string, P> {
    const m: Record<string, P> = {};
    let i = 0;
    for (const id in this.home) { if (['ref', 'med', 'u1', 't1'].includes(id) || !this.playing(id)) continue; const a = i++ * 2.399; const r = 2 + (i % 5) * 1.6; m[id] = [52.5 + Math.cos(a) * r * 1.2, 34 + Math.sin(a) * r]; }
    return m;
  }
  private toTunnel(): Record<string, P> {
    const m: Record<string, P> = {};
    let i = 0;
    for (const id in this.home) { if (id === 'med' || !this.playing(id)) continue; m[id] = [42 + (i % 8) * 3, 2.5 + Math.floor(i / 8) * 2.8]; i++; }
    return m;
  }

  /** Зупинити все, що грається: компонент знято або прийшов новий рядок. */
  stop() { this.run++; this.dead = true; }
}

/** Схема суперника → розстановка на полі (conditions.ts:FORMATION_BY_STRENGTH). */
export function formationOf(s: string): Formation { return (s === '4-4-2' || s === '4-3-3' ? s : '4-2-3-1'); }
/** Роль у ростері для підпису фішки. */
export const LABEL_ROLES: Record<string, string> = {
  u1: 'keeper', u2: 'rb', u3: 'lb', u4: 'cb', u5: 'cb2', u6: 'dm', u7: 'partner', u9: 'striker', u11: 'winger', u10: 'self', sub: 'sub',
  t1: 'keeper', t4: 'cb', t6: 'mid', t7: 'winger', t9: 'striker',
};
