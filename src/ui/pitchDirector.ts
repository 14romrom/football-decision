import type { Stage } from '../engine/feed';
import type { FinaleKind } from '../engine/finale';
import type { Kit } from '../engine/names';

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
const ZY = { L: 12, C: 34, R: 56 } as const;
const OUR_GOAL: P = [0, 34];
const THEIR_GOAL: P = [PW, 34];
const BENCH: P = [50, -3.4];

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

export type DirectorOptions = {
  usKit?: Kit; themKit?: Kit; formation: Formation;
  /** Підписи фішок: id → ім'я. Показуються лише тим, кого називає рядок, і Реєсу завжди. */
  names: Record<string, string>;
  reduced: boolean;
};

type Token = { g: SVGGElement; body: SVGGElement; label?: SVGTextElement; ring?: SVGCircleElement; glow?: SVGCircleElement; p: P };

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
  private nets: Record<'us' | 'them', SVGRectElement> = {} as Record<'us' | 'them', SVGRectElement>;
  private bars: Record<'us' | 'them', SVGLineElement> = {} as Record<'us' | 'them', SVGLineElement>;
  private flashRect!: SVGRectElement;
  private benchMarks!: SVGGElement;
  private shout!: SVGTextElement;
  private pointer!: SVGGElement;
  private flag!: SVGGElement;
  private card!: SVGRectElement;
  private names: Record<string, string>;
  private onBench = false;

  constructor(svg: SVGSVGElement, opt: DirectorOptions) {
    this.svg = svg;
    this.reduced = opt.reduced;
    this.names = opt.names;
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
    this.el('rect', { x: -12, y: -12, width: PW + 24, height: PH + 24, class: 'pc-surround' });
    this.el('rect', { x: 0, y: 0, width: PW, height: PH, class: 'pc-grass' });
    for (let i = 1; i < 10; i += 2) this.el('rect', { x: i * 10.5, y: 0, width: 10.5, height: PH, class: 'pc-stripe' });
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
      this.nets[side] = this.el('rect', { x: left ? -2 : PW, y: 30.34, width: 2, height: 7.32, class: 'pc-net' });
      this.bars[side] = this.el('line', { x1: left ? 0 : PW, y1: 30.34, x2: left ? 0 : PW, y2: 37.66, class: 'pc-bar' });
    }
    for (const [x, y] of [[0, 0], [PW, 0], [0, PH], [PW, PH]] as P[]) {
      this.el('line', { x1: x, y1: y, x2: x, y2: y - 1.6, class: 'pc-flagpole' });
      this.el('polygon', { points: `${x},${y - 1.6} ${x + (x ? -1 : 1)},${y - 1.3} ${x},${y - 1}`, class: 'pc-flag' });
    }
    // лави за верхньою бровкою, біля центру
    for (const x of [44, 61]) this.el('rect', { x: x - 5, y: -5.4, width: 10, height: 2.4, rx: .4, class: 'pc-bench' });
    this.benchMarks = this.el('g', { opacity: 0 });
    for (const x of [41, 47, 58, 64]) { const t = this.el('text', { x, y: -6.2, class: 'pc-shout' }, this.benchMarks); t.textContent = '!'; }
    this.flashRect = this.el('rect', { x: 0, y: 0, width: PW, height: PH, class: 'pc-flash', opacity: 0 });
    this.trail = this.el('path', { class: 'pc-trail', opacity: 0 });

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

  private token(id: string, us: Kit, them: Kit) {
    const self = id === 'u10';
    const ours = isUs(id);
    const kit = ours ? us : them;
    const gk = id === 'u1' || id === 't1';
    const g = this.el('g', {});
    const tk: Token = { g, body: undefined as unknown as SVGGElement, p: [0, 0] };
    if (self) {
      this.el('circle', { r: 2.35, class: 'pc-ring-bg' }, g);
      tk.ring = this.el('circle', { r: 2.35, class: 'pc-ring', transform: 'rotate(-90)', 'stroke-dasharray': `${2 * Math.PI * 2.35} 99` }, g);
      tk.glow = this.el('circle', { r: 2.95, class: 'pc-glow', opacity: 0 }, g);
    }
    const body = this.el('g', {}, g);
    tk.body = body;
    const fill = id === 'ref' ? '#111114' : id === 'med' ? '#f1eee6' : gk ? (ours ? us.gk : them.gk) : `url(#kit-${ours ? 'us' : 'them'})`;
    const stroke = id === 'ref' ? '#f2cf5b' : gk && ours ? '#e6e1d6' : '#0b0b0d';
    this.el('circle', { r: self ? 1.75 : 1.4, fill, stroke, 'stroke-width': id === 'ref' || (gk && ours) ? .18 : .14 }, body);
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
  private putBall(p: P) { this.ballP = p; this.ball.setAttribute('transform', `translate(${p[0].toFixed(2)},${p[1].toFixed(2)})`); }
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
  }

  setBench(on: boolean) { this.onBench = on; this.put('u10', on ? BENCH : this.home.u10); this.put('sub', on ? this.home.u10 : BENCH); }
  setStamina(v: number) {
    const ring = this.t.u10.ring; if (!ring) return;
    const C = 2 * Math.PI * 2.35;
    ring.setAttribute('stroke-dasharray', `${(C * clamp(v, 0, 100) / 100).toFixed(2)} 99`);
    ring.classList.toggle('mid', v < 50 && v >= 25); ring.classList.toggle('low', v < 25);
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
    if (my !== this.run) return;
    const dur = o.dur ?? 600;
    const from: Record<string, P> = {};
    for (const id in o.moves ?? {}) from[id] = this.pos(id);
    const b0 = this.ballP;
    const v0 = this.view;
    let v1 = o.cam ? this.frame(o.cam, o.w ?? v0.w) : v0;
    // М'яч не має вилітати з кадру: якщо ціль поза ним — кадр зсувається рівно настільки, щоб ціль була видна.
    if (o.ball) {
      const m = 4, b = o.ball;
      const nx = b[0] < v1.x + m ? b[0] - m : b[0] > v1.x + v1.w - m ? b[0] + m - v1.w : v1.x;
      const ny = b[1] < v1.y + m ? b[1] - m : b[1] > v1.y + v1.h - m ? b[1] + m - v1.h : v1.y;
      if (nx !== v1.x || ny !== v1.y) v1 = this.frame([nx + v1.w / 2, ny + v1.h / 2], v1.w);
    }
    const arc = o.arc ?? 0;
    const mid: P | null = o.ball ? [(b0[0] + o.ball[0]) / 2, (b0[1] + o.ball[1]) / 2 - arc] : null;
    if (o.ball && dist(b0, o.ball) > 4) { this.trail.setAttribute('d', `M${b0[0]},${b0[1]} Q${mid![0]},${mid![1]} ${o.ball[0]},${o.ball[1]}`); this.trail.setAttribute('opacity', '.55'); }
    await this.tween(dur, (k) => {
      if (my !== this.run) return;
      for (const id in from) { const a = from[id], z = o.moves![id]; this.put(id, [a[0] + (z[0] - a[0]) * k, a[1] + (z[1] - a[1]) * k]); }
      if (o.ball && mid) { const q = 1 - k; this.putBall([q * q * b0[0] + 2 * q * k * mid[0] + k * k * o.ball[0], q * q * b0[1] + 2 * q * k * mid[1] + k * k * o.ball[1]]); }
      if (v1 !== v0) this.setView({ x: v0.x + (v1.x - v0.x) * k, y: v0.y + (v1.y - v0.y) * k, w: v0.w + (v1.w - v0.w) * k, h: v0.h + (v1.h - v0.h) * k });
    });
    setTimeout(() => this.trail.setAttribute('opacity', '0'), 380);
  }

  private quiet() {
    for (const id in this.t) { this.t[id].body.removeAttribute('transform'); if (this.t[id].label && id !== 'u10') this.t[id].label!.setAttribute('opacity', '0'); }
    for (const e of [this.pointer, this.shout, this.benchMarks, this.flag, this.card]) e.setAttribute('opacity', '0');
  }
  private label(ids: string[]) { for (const id of ids) this.t[id]?.label?.setAttribute('opacity', '1'); }
  private lie(id: string, on = true) { this.t[id]?.body.setAttribute('transform', on ? 'rotate(70) scale(1.25,.6)' : ''); }
  private jump(id: string, on = true) { this.t[id]?.body.setAttribute('transform', on ? 'scale(1.3)' : ''); }
  private say(at: P, text: string) { this.shout.setAttribute('x', String(at[0])); this.shout.setAttribute('y', String(at[1] - 2.4)); this.shout.textContent = text; this.shout.setAttribute('opacity', '1'); }
  private point(at: P, deg: number) { this.pointer.setAttribute('transform', `translate(${at[0] + 1.4},${at[1] - 1}) rotate(${deg})`); this.pointer.setAttribute('opacity', '1'); }
  private showCard(at: P, red: boolean) { this.card.setAttribute('x', String(at[0] - .5)); this.card.setAttribute('y', String(at[1] - 4.6)); this.card.classList.toggle('red', red); this.card.setAttribute('opacity', '1'); }
  private async flashOn(side: 'us' | 'them') {
    this.flashRect.classList.toggle('them', side === 'them');
    this.nets[side === 'us' ? 'them' : 'us'].classList.add('hit');
    await this.tween(900, (k) => this.flashRect.setAttribute('opacity', String((1 - k) * .3)));
    this.nets[side === 'us' ? 'them' : 'us'].classList.remove('hit');
  }
  private async barHit(side: 'us' | 'them') { this.bars[side].classList.add('hit'); await this.sleep(320); this.bars[side].classList.remove('hit'); }

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
    if (this.onBench) m.sub = [clamp(this.home.u10[0] + dx, 3, 102), this.home.u10[1]];
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
    return out;
  }
  private goalOf(attacker: 'us' | 'them'): P { return attacker === 'us' ? THEIR_GOAL : OUR_GOAL; }
  private fwd(side: 'us' | 'them', m: number) { return side === 'us' ? m : -m; }

  // ——— розіграш рядка стрічки ————————————————————————————————————————————
  async play(st: Stage, kind?: string) {
    const my = ++this.run;
    this.quiet();
    const z: P = st.x ? [ZX[st.x], ZY[st.y ?? 'C']] : [52.5, 34];
    const a = st.who ? this.id(st.who, z, st.who.startsWith('them') ? 'them' : 'us') : undefined;
    const b = st.vs ? this.id(st.vs, z, st.vs.startsWith('them') ? 'them' : 'us') : undefined;
    this.label((st.named ?? []).filter((r) => ROLE_ID[r]).map((r) => this.id(r, z)));
    const has = (t: string) => st.tags.includes(t);
    const W = 44;
    const S = (o: Parameters<Director['step']>[1]) => this.step(my, o);
    const ok = () => my === this.run;

    switch (st.act) {
      case 'kickoff': {
        await S({ moves: this.block([52.5, 34], { u10: [52, 33], u9: [53.6, 35.2] }), ball: [52.5, 34], cam: [52.5, 34], w: 58, dur: 600 });
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
        const runs: Record<string, P> = { [target]: [land[0] - this.fwd(side, 1), land[1]] };
        const def = this.id(side === 'us' ? 'them' : 'us', land);
        if (has('keeper')) runs[side === 'us' ? 't1' : 'u1'] = [land[0] + this.fwd(side, 1), land[1]];
        else runs[def] = [land[0] + this.fwd(side, 1.5), land[1] + 1];
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
        if (st.act === 'run') { await S({ moves: { [runner]: [end[0] + this.fwd(side, 8), end[1]] }, cam: end, dur: 900 }); if (has('alone')) await this.sleep(300); break; }
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
        if (st.act === 'block' || has('blocked')) { await S({ ball: [sp[0] + this.fwd(side, 2.8), sp[1] + .4], dur: 200 }); this.jump(blocker); await S({ ball: [sp[0] + this.fwd(side, 6), sp[1] + 9], dur: 450 }); this.jump(blocker, false); break; }
        const aim: P = has('bar') ? [goal[0], 30.6] : has('post') ? [goal[0], 37.4] : has('wide') ? [goal[0] + this.fwd(side, 1.5), 41] : has('over') ? [goal[0] + this.fwd(side, 3), 33] : has('stand') ? [goal[0] + this.fwd(side, 6), 20] : [goal[0] - this.fwd(side, 1.4), 33.5];
        if (has('dive') || has('saved')) this.lie(k);
        await S({ moves: has('saved') || has('dive') ? { [k]: [goal[0] - this.fwd(side, 1.6), 32] } : {}, ball: aim, arc: has('over') || has('stand') ? 4 : 1, dur: 520 });
        if (!ok()) return;
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
        const victim = st.act === 'knock' ? 'u10' : b ?? this.id(this.sideOf(fouler) === 'us' ? 'them' : 'us', z);
        const vSide = this.sideOf(victim);
        await S({ moves: this.block(z, { [victim]: z, [fouler]: [z[0] + this.fwd(vSide, 4), z[1] + 2] }), ball: [z[0] + this.fwd(vSide, .9), z[1]], cam: z, w: W - 4, dur: 550 });
        if (st.act === 'knock' && st.who === undefined) { await S({ moves: { u10: [z[0] + this.fwd('us', 2), z[1] - 1] }, dur: 300 }); this.lie('u10'); await this.sleep(700); this.lie('u10', false); break; }
        await S({ moves: { [fouler]: [z[0] + this.fwd(vSide, .8), z[1] + .3] }, dur: 300 });
        if (!ok()) return;
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
        this.nearest(att, [goal[0] - this.fwd(att, 9), 34], 4).forEach((id, i) => { box[id] = [goal[0] - this.fwd(att, 6 + (i % 2) * 3), 28 + i * 4]; });
        this.nearest(att === 'us' ? 'them' : 'us', [goal[0] - this.fwd(att, 7), 34], 4).forEach((id, i) => { box[id] = [goal[0] - this.fwd(att, 4.5 + (i % 2) * 3), 29 + i * 3.6]; });
        if (has('cb')) { box.u4 = [goal[0] - 7, 33]; box.u5 = [goal[0] - 9, 38]; }
        if (has('keeperup')) box.u1 = [52, 30];
        const taker = this.nearest(att, fl, 1)[0];
        box[taker] = [fl[0] - this.fwd(att, .8), fl[1] + (fl[1] ? -.8 : .8)];
        await S({ moves: this.block([goal[0] - this.fwd(att, 12), 34], box), ball: [fl[0] - this.fwd(att, .5), fl[1] + (fl[1] ? -.5 : .5)], cam: [goal[0] - this.fwd(att, 12), 30], w: W, dur: 700 });
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
        await S({ moves: this.block(z, who ? { [who]: z } : {}), ball: who ? [z[0] + 2, z[1] + 1.5] : z, cam: z, w: W, dur: 600 });
        if (who && (st.act === 'slip' || has('down') || has('medic') || has('none') || st.act === 'stoppage' && st.who === 'them')) this.lie(who);
        if (has('medic')) await S({ moves: { med: [z[0] - 2.4, z[1] - 1.6], ref: [z[0] + 4.5, z[1] + 3.5] }, cam: [z[0], z[1] - 6], w: W + 4, dur: 900 });
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
        this.flag.setAttribute('transform', `translate(${lineX},${top ? 1.6 : 67})`); this.flag.setAttribute('opacity', '1');
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
        await S({ cam: [52.5, 2], w: 46, dur: 550 });
        this.benchMarks.setAttribute('opacity', '1');
        if (b && b !== 'sub') { const p = this.pos(b); await S({ moves: { [b]: [46 + Math.random() * 8, 2.5] }, dur: 550 }); await this.sleep(150); await S({ moves: { [b]: p }, dur: 400 }); }
        break;
      }
      case 'enter': {
        await S({ cam: [52.5, 4], w: 46, dur: 500 });
        await S({ moves: { u10: [52, 8], sub: BENCH }, dur: 800 });
        this.onBench = false;
        await S({ moves: { u10: this.home.u10 }, cam: [52.5, 30], w: 52, dur: 550 });
        break;
      }
      case 'wide': case 'crowd': case 'half': {
        const m = st.act === 'crowd' ? this.crowded() : st.act === 'half' ? this.toTunnel() : this.block([52.5, 34]);
        await S({ moves: m, ball: st.act === 'half' ? [52.5, -1] : [52.5 + (Math.random() - .5) * 10, 34], cam: [52.5, st.act === 'half' ? 28 : 34], w: 104, dur: st.act === 'half' ? 1400 : 900 });
        break;
      }
      case 'push': case 'deep': {
        const side = st.who === 'them' ? 'them' : 'us';
        const m: Record<string, P> = {};
        for (const id in this.home) {
          if (!id.startsWith(side === 'us' ? 'u' : 't') || id === 'u1' || id === 't1') continue;
          const [x, y] = this.home[id];
          m[id] = st.act === 'push' ? [clamp(x + this.fwd(side, 18), 3, 102), y] : [side === 'them' ? clamp(x + 14, 82, 100) : clamp(x - 14, 5, 22), 18 + (y - 4) * .55];
        }
        const c: P = st.act === 'deep' ? [side === 'them' ? 86 : 19, 34] : [z[0], 34];
        await S({ moves: m, ball: [c[0] + (side === 'them' ? -14 : 14), 36], cam: c, w: W + 10, dur: 1000 });
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
          await S({ moves: others, ball: [rp[0] + 14, rp[1] - 2], dur: 900 });
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
  async finale(kind: FinaleKind, spot: P) {
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
      case 'save': this.lie('t1'); await S({ moves: { t1: [goal[0] - 1.6, 32] }, ball: [goal[0] - 1.4, 32.5], dur: 500, cam: [(spot[0] + goal[0]) / 2, 34] }); await S({ ball: [goal[0] - 7, 24], dur: 400 }); break;
      case 'miss': await S({ ball: [goal[0] + 2, 42], dur: 550, cam: [(spot[0] + goal[0]) / 2, 34] }); break;
      case 'pass': { const mate = this.nearest('us', [spot[0] + 8, spot[1]], 3).find((x) => x !== r)!; const run: P = [this.pos(mate)[0] + 7, this.pos(mate)[1]]; await S({ moves: { [mate]: run }, ball: run, dur: 650 }); break; }
      case 'loss': await S({ moves: { [near]: [spot[0] + .8, spot[1] + .3] }, dur: 300 }); await S({ moves: { [near]: [spot[0] - 14, spot[1] + 4] }, ball: [spot[0] - 15, spot[1] + 4], cam: [spot[0] - 10, spot[1]], dur: 800 }); break;
      case 'concede': await S({ moves: { [near]: [spot[0] - 20, spot[1]] }, ball: [spot[0] - 21, spot[1]], cam: [spot[0] - 20, 34], w: 50, dur: 700 }); await S({ ball: [-.6, 34], cam: [16, 34], dur: 700 }); void this.flashOn('them'); break;
      case 'foul': case 'red': await S({ moves: { [near]: [spot[0] + .8, spot[1] + .3] }, dur: 300 }); this.lie(near); this.showCard(spot, kind === 'red'); break;
      case 'duel': await S({ moves: { [near]: [spot[0] + .7, spot[1] + .3] }, dur: 300 }); await S({ moves: { [near]: [spot[0] + 6, spot[1] + 5] }, ball: [spot[0] + 3, spot[1] - 1], dur: 450 }); break;
      default: this.jump(r); await this.sleep(350); this.jump(r, false);
    }
  }

  /** Сцена відкрилася десь на полі — усі на позиції від неї, Реєс у точці, камера туди ж. */
  async toSpot(spot: P) {
    const my = ++this.run;
    this.quiet();
    await this.step(my, { moves: this.block(spot, this.onBench ? {} : { u10: spot }), ball: [spot[0] + .9, spot[1]], cam: spot, w: 44, dur: 500 });
  }

  // ——— голи —————————————————————————————————————————————————————————————
  private async goal(my: number, side: 'us' | 'them', manner: string) {
    const S = (o: Parameters<Director['step']>[1]) => this.step(my, o);
    const goal = this.goalOf(side);
    const k = side === 'us' ? 't1' : 'u1';
    const scorer = side === 'us' ? 'u9' : 't9';
    const net: P = [goal[0] + this.fwd(side, .6), 33.4];
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
    const corner: P = side === 'us' ? [102, 3] : [3, 65];
    const mates = this.nearest(side, corner, 3).filter((x) => x !== scorer);
    const m: Record<string, P> = { [scorer]: corner };
    mates.forEach((id, i) => { m[id] = [corner[0] - this.fwd(side, 3 + i * 2), corner[1] + (side === 'us' ? 2 + i : -2 - i)]; });
    await this.step(my, { moves: m, cam: [corner[0] - this.fwd(side, 10), corner[1] + (side === 'us' ? 10 : -10)], w: 40, dur: 650 });
  }

  // ——— вибірки —————————————————————————————————————————————————————————
  private nearest(side: 'us' | 'them', p: P, n: number): string[] {
    return Object.keys(this.t)
      .filter((id) => (side === 'us' ? isUs(id) : id.startsWith('t')) && !['u1', 't1', 'sub'].includes(id) && !(id === 'u10' && this.onBench))
      .sort((x, y) => dist(this.pos(x), p) - dist(this.pos(y), p))
      .slice(0, n);
  }
  private atLane(side: 'us' | 'them', x: number, y: number): string { return this.nearest(side, [x, y], 1)[0]; }
  private crowded(): Record<string, P> {
    const m: Record<string, P> = {};
    let i = 0;
    for (const id in this.home) { if (['ref', 'med', 'sub', 'u1', 't1'].includes(id) || (id === 'u10' && this.onBench)) continue; const a = i++ * 2.399; const r = 2 + (i % 5) * 1.6; m[id] = [52.5 + Math.cos(a) * r * 1.2, 34 + Math.sin(a) * r]; }
    return m;
  }
  private toTunnel(): Record<string, P> {
    const m: Record<string, P> = {};
    let i = 0;
    for (const id in this.home) { if (['med', 'sub'].includes(id) || (id === 'u10' && this.onBench)) continue; m[id] = [44 + (i % 8) * 2.4, 2 + Math.floor(i / 8) * 2.2]; i++; }
    return m;
  }

  /** Зупинити все, що грається: компонент знято або прийшов новий рядок. */
  stop() { this.run++; }
}

/** Схема суперника → розстановка на полі (conditions.ts:FORMATION_BY_STRENGTH). */
export function formationOf(s: string): Formation { return (s === '4-4-2' || s === '4-3-3' ? s : '4-2-3-1'); }
/** Роль у ростері для підпису фішки. */
export const LABEL_ROLES: Record<string, string> = {
  u1: 'keeper', u2: 'rb', u3: 'lb', u4: 'cb', u5: 'cb2', u6: 'dm', u7: 'partner', u9: 'striker', u11: 'winger', u10: 'self', sub: 'sub',
  t1: 'keeper', t4: 'cb', t6: 'mid', t7: 'winger', t9: 'striker',
};
