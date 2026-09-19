import { useEffect, useRef, useState } from 'react';
import type { Episode, TimelineEvent } from '../engine/types';
import type { Strength } from '../engine/conditions';
import type { FinaleKind } from '../engine/finale';
import { motionReduced } from '../telemetry/settings';

// Поле над сценою (макет А2; план анимации 19.09, три слоя). 11 на 11: наши — 4-3-3 (АПЗ — десятка),
// соперник по силе: слабый 4-4-2, равный 4-2-3-1, сильный 4-3-3. Ми атакуємо праворуч.
//  1. Розв’язка — хореография по исходу (engine/finale.ts): не полёт мяча, а 3–4 актёра со своими
//     траекториями и сдвигом по времени; запускается со штампом вердикта (RollView.onVerdict).
//  2. Між епізодами — поле живёт по ленте: строка ленты запускает 2–3 передачи в команде, о которой
//     строка; гол в ленте — удар в сетку. Иллюстрация к тексту, как повтор в трансляции.
//  3. Дихання — раз в ~4 с каждая точка смещается на пару процентов в пределах позиции.
// Всё через CSS transition по transform; при «Менше руху» — сразу конечные положения, дыхания нет.
// Когда появится Phaser, сюда ляжет его сцена, а `zone` эпизода заменит FAMILY_SPOT.

type Spot = [number, number];
type Pos = Record<string, Spot>;

/** Где на поле происходит сцена: доля ширины (0 — свои ворота, 1 — чужие) и высоты. */
const FAMILY_SPOT: Record<string, Spot> = {
  edge_shot: [0.74, 0.5], one_on_one: [0.86, 0.5], finishing: [0.9, 0.48], penalty: [0.88, 0.5],
  free_kick: [0.72, 0.42], corner_attack: [0.96, 0.92], through: [0.62, 0.5], wing: [0.7, 0.14],
  counter: [0.5, 0.5], partner: [0.55, 0.5], press: [0.42, 0.5], duel: [0.34, 0.5], last_man: [0.2, 0.5],
  corner_defense: [0.04, 0.94], coach: [0.5, 0.97], referee: [0.5, 0.5], body: [0.5, 0.5],
};
const PHASE_SPOT: Record<NonNullable<Episode['phase']>, Spot> = { attack: [0.7, 0.5], defense: [0.3, 0.5], transition: [0.5, 0.5], setpiece: [0.8, 0.4] };

type Formation = { x: number; ys: number[] }[];
const F433: Formation = [{ x: 0.05, ys: [0.5] }, { x: 0.2, ys: [0.2, 0.4, 0.6, 0.8] }, { x: 0.38, ys: [0.3, 0.5, 0.7] }, { x: 0.6, ys: [0.15, 0.5, 0.85] }];
const F442: Formation = [{ x: 0.05, ys: [0.5] }, { x: 0.2, ys: [0.2, 0.4, 0.6, 0.8] }, { x: 0.4, ys: [0.15, 0.4, 0.6, 0.85] }, { x: 0.6, ys: [0.4, 0.6] }];
const F4231: Formation = [{ x: 0.05, ys: [0.5] }, { x: 0.2, ys: [0.2, 0.4, 0.6, 0.8] }, { x: 0.35, ys: [0.4, 0.6] }, { x: 0.5, ys: [0.15, 0.5, 0.85] }, { x: 0.64, ys: [0.5] }];
const THEM_BY_STRENGTH: Record<Strength, Formation> = { weak: F442, even: F4231, strong: F433 };
const PHASE_SHIFT: Record<NonNullable<Episode['phase']>, number> = { attack: 0.12, defense: -0.12, transition: 0, setpiece: 0.1 };

const W = 350; const H = 180; const PAD = 10;
const px = (s: Spot): [number, number] => [PAD + s[0] * (W - 2 * PAD), 12 + s[1] * (H - 24)];
const clamp = (v: number) => Math.max(0.03, Math.min(0.97, v));
const SELF = 'u9'; // десятка: последняя линия 4-3-3, центр
const BALL = 'ball';

function formationSpots(f: Formation, mirror: boolean, shift: number): Spot[] {
  const out: Spot[] = [];
  for (const line of f) for (const y of line.ys) {
    const x = mirror ? 1 - line.x : line.x;
    out.push([line.x < 0.1 ? x : clamp(x + shift), y]);   // вратарь не уезжает с линией
  }
  return out;
}

/** Исходные позиции всех актёров под эпизод: схема + сдвиг фазы, Реєс в точке сцены, ближайший соперник рядом. */
function basePositions(episode: Episode | null, strength: Strength): { pos: Pos; near: string; partner: string; spot: Spot } {
  const phase = episode?.phase ?? 'transition';
  const spot = (episode?.family && FAMILY_SPOT[episode.family]) || PHASE_SPOT[phase];
  const shift = PHASE_SHIFT[phase];
  const pos: Pos = {};
  formationSpots(F433, false, shift).forEach((s, i) => { pos['u' + i] = s; });
  formationSpots(THEM_BY_STRENGTH[strength], true, shift).forEach((s, i) => { pos['t' + i] = s; });
  pos[SELF] = spot;
  let near = 't1'; let best = Infinity;
  for (let i = 1; i < 11; i++) { const p = pos['t' + i]; const d = (p[0] - spot[0]) ** 2 + (p[1] - spot[1]) ** 2; if (d < best) { best = d; near = 't' + i; } }
  pos[near] = [clamp(spot[0] + 0.045), clamp(spot[1] + 0.06)];
  // Партнёр для паса — ближайший свой, кроме вратаря и самого Реєса.
  let partner = 'u8'; best = Infinity;
  for (let i = 1; i < 11; i++) { if ('u' + i === SELF) continue; const p = pos['u' + i]; const d = (p[0] - spot[0]) ** 2 + (p[1] - spot[1]) ** 2; if (d < best) { best = d; partner = 'u' + i; } }
  pos[BALL] = [spot[0] + 0.02, spot[1] + 0.035];
  return { pos, near, partner, spot };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Детерминированный «случайный» из строки ленты — чтобы перерисовка не меняла розыгрыш. */
function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

type Props = {
  episode: Episode | null; selfName: string; strength?: Strength;
  /** Розв’язка: вид и порядковый номер броска — новый номер запускает хореографию. */
  finale?: { kind: FinaleKind; id: number } | null;
  /** Последняя строка ленты — поле разыгрывает её, пока эпизода нет. */
  pulse?: TimelineEvent | null;
};

export function Pitch({ episode, selfName, strength = 'even', finale, pulse }: Props) {
  const reduced = motionReduced();
  const baseRef = useRef(basePositions(episode, strength));
  const [pos, setPos] = useState<Pos>(baseRef.current.pos);
  const [dur, setDur] = useState<Record<string, number>>({});
  const [lit, setLit] = useState<string | null>(null);
  const [net, setNet] = useState<'us' | 'them' | null>(null);
  const [card, setCard] = useState<'yellow' | 'red' | null>(null);
  const [pulseSelf, setPulseSelf] = useState(0);
  const busy = useRef(0);   // номер текущей последовательности: устаревшие шаги не применяются

  const move = (patch: Pos, ms: number) => {
    setDur((d) => { const n = { ...d }; for (const k of Object.keys(patch)) n[k] = reduced ? 0 : ms; return n; });
    setPos((p) => ({ ...p, ...patch }));
  };

  // Новый эпизод: все на исходные, мяч у Реєса, следы прошлой развязки стёрты.
  useEffect(() => {
    busy.current += 1;
    baseRef.current = basePositions(episode, strength);
    setNet(null); setCard(null); setLit(null);
    move(baseRef.current.pos, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.id, strength]);

  // 1. Розв’язка.
  useEffect(() => {
    if (!finale) return;
    const token = ++busy.current;
    const ok = () => busy.current === token;
    const { near, partner, spot } = baseRef.current;
    const b = baseRef.current.pos;
    const run = async () => {
      const k = finale.kind;
      if (k === 'goal') {
        move({ [SELF]: [clamp(spot[0] + 0.05), spot[1]], [BALL]: [clamp(spot[0] + 0.07), spot[1] + 0.03] }, 350); await sleep(350); if (!ok()) return;
        move({ [BALL]: [0.995, 0.5], t0: [0.96, 0.42], [partner]: [clamp(b[partner][0] + 0.12), clamp(b[partner][1] * 0.6 + 0.2)], [near]: [clamp(b[near][0] + 0.03), b[near][1]] }, 650); await sleep(650); if (!ok()) return;
        setNet('us'); setLit(SELF);
      } else if (k === 'concede') {
        move({ [BALL]: b[near], [near]: [clamp(b[near][0] - 0.06), b[near][1]] }, 300); await sleep(320); if (!ok()) return;
        const surge: Pos = {}; for (let i = 1; i < 11; i++) { const x = 't' + i; surge[x] = [clamp(b[x][0] - 0.18), b[x][1]]; }
        move({ ...surge, [BALL]: [0.005, 0.5], u0: [0.06, 0.58] }, 950); await sleep(950); if (!ok()) return;
        setNet('them');
      } else if (k === 'save') {
        move({ [SELF]: [clamp(spot[0] + 0.04), spot[1]], [BALL]: [0.965, 0.5], t0: [0.93, 0.5] }, 450); await sleep(450); if (!ok()) return;
        setLit('t0'); move({ [BALL]: [0.9, 0.44] }, 500);
      } else if (k === 'miss') {
        move({ [SELF]: [clamp(spot[0] + 0.04), spot[1]], [BALL]: [1.0, 0.1], t0: [0.95, 0.45] }, 700);
      } else if (k === 'pass') {
        const run2: Spot = [clamp(b[partner][0] + 0.1), clamp(b[partner][1] * 0.7 + 0.15)];
        move({ [partner]: run2 }, 500); await sleep(420); if (!ok()) return;
        move({ [BALL]: run2 }, 450); setLit(partner);
      } else if (k === 'loss') {
        move({ [near]: [clamp(spot[0] + 0.015), spot[1] + 0.02], [BALL]: [clamp(spot[0] + 0.03), spot[1] + 0.03] }, 300); await sleep(300); if (!ok()) return;
        setLit(near);
        const back: Pos = {}; for (let i = 1; i < 11; i++) { const x = 'u' + i; if (x === SELF) continue; back[x] = [clamp(b[x][0] - 0.07), b[x][1]]; }
        const fwd: Pos = {}; for (let i = 1; i < 11; i++) { const x = 't' + i; if (x === near) continue; fwd[x] = [clamp(b[x][0] - 0.08), b[x][1]]; }
        move({ ...back, ...fwd, [BALL]: [clamp(spot[0] - 0.08), spot[1] + 0.04], [near]: [clamp(spot[0] - 0.1), spot[1] + 0.02] }, 700);
      } else if (k === 'foul' || k === 'red') {
        move({ [near]: [clamp(spot[0] + 0.01), spot[1] + 0.01] }, 250); await sleep(300); if (!ok()) return;
        setCard(k === 'red' ? 'red' : 'yellow');
      } else if (k === 'duel') {
        move({ [near]: [clamp(spot[0] + 0.015), spot[1] + 0.02] }, 250); await sleep(260); if (!ok()) return;
        move({ [near]: [clamp(spot[0] + 0.09), spot[1] + 0.08] }, 400); setPulseSelf((n) => n + 1);
      } else {
        setPulseSelf((n) => n + 1);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finale?.id]);

  // 2. Поле живёт по ленте: 2–3 передачи в команде, о которой строка; гол в ленте — в сетку.
  useEffect(() => {
    if (!pulse || episode) return;
    const token = ++busy.current;
    const ok = () => busy.current === token;
    const b = baseRef.current.pos;
    const r = hash(pulse.text);
    const side = pulse.kind === 'goalUs' ? 'u' : pulse.kind === 'goalThem' ? 't' : r < 0.5 ? 'u' : 't';
    const ids = Array.from({ length: 10 }, (_, i) => side + (i + 1));
    const start = Math.floor(r * 10);
    const chain = [ids[start], ids[(start + 3 + Math.floor(r * 7)) % 10], ids[(start + 6) % 10]];
    const run = async () => {
      setNet(null);
      for (const id of chain) {
        if (!ok()) return;
        const [x, y] = b[id];
        move({ [id]: [clamp(x + (side === 'u' ? 0.03 : -0.03)), y], [BALL]: [clamp(x + (side === 'u' ? 0.045 : -0.045)), y + 0.03] }, 450);
        setLit(id);
        await sleep(520);
      }
      if (!ok()) return;
      if (pulse.kind === 'goalUs') { move({ [BALL]: [0.995, 0.5], t0: [0.96, 0.4] }, 550); await sleep(560); if (ok()) setNet('us'); }
      if (pulse.kind === 'goalThem') { move({ [BALL]: [0.005, 0.5], u0: [0.04, 0.6] }, 550); await sleep(560); if (ok()) setNet('them'); }
      if (pulse.kind === 'halftime' || pulse.kind === 'kickoff') move({ [BALL]: [0.5, 0.5] }, 500);
      setLit(null);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse?.minute, pulse?.text]);

  // 3. Дихання: раз в ~4 с — на пару процентов в пределах позиции, только когда никто не бежит.
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      const snapshot = busy.current;
      setTimeout(() => {
        if (busy.current !== snapshot) return;
        setPos((p) => {
          const n: Pos = { ...p };
          for (const k of Object.keys(p)) { if (k === BALL) continue; const [x, y] = p[k]; n[k] = [clamp(x + (Math.random() - 0.5) * 0.02), clamp(y + (Math.random() - 0.5) * 0.03)]; }
          return n;
        });
        setDur((d) => { const n = { ...d }; for (const k of Object.keys(n)) if (k !== BALL) n[k] = 2400; return n; });
      }, 0);
    }, 4000);
    return () => clearInterval(t);
  }, [reduced]);

  const at = (id: string) => { const [x, y] = px(pos[id] ?? [0.5, 0.5]); return { transform: `translate(${x}px, ${y}px)`, transitionDuration: `${dur[id] ?? 600}ms` }; };
  const litClass = (id: string) => (lit === id ? ' lit' : '');

  return (
    <svg className="pitch" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x="0" y="0" width={W} height={H} className="pitch-grass" />
      <rect className={`pitch-flash us ${net === 'us' ? 'on' : ''}`} x={W - PAD - 48} y="45" width="48" height="90" />
      <rect className={`pitch-flash them ${net === 'them' ? 'on' : ''}`} x={PAD} y="45" width="48" height="90" />
      <g className="pitch-lines">
        <rect x={PAD} y="12" width={W - 2 * PAD} height={H - 24} />
        <line x1={W / 2} y1="12" x2={W / 2} y2={H - 12} />
        <circle cx={W / 2} cy={H / 2} r="24" />
        <rect x={PAD} y="45" width="48" height="90" /><rect x={PAD} y="67" width="16" height="46" />
        <rect x={W - PAD - 48} y="45" width="48" height="90" /><rect x={W - PAD - 16} y="67" width="16" height="46" />
        <path d={`M ${PAD + 48} 72 A 22 22 0 0 1 ${PAD + 48} 108`} />
        <path d={`M ${W - PAD - 48} 72 A 22 22 0 0 0 ${W - PAD - 48} 108`} />
      </g>
      <rect className={`pitch-net ${net === 'us' ? 'hit' : ''}`} x={W - PAD} y="72" width="5" height="36" />
      <rect className={`pitch-net ${net === 'them' ? 'hit' : ''}`} x={PAD - 5} y="72" width="5" height="36" />
      <g className="pitch-them">
        {Array.from({ length: 11 }, (_, i) => 't' + i).map((id) => <circle key={id} className={`pitch-dot${litClass(id)}`} style={at(id)} r="4" />)}
      </g>
      <g className="pitch-us">
        {Array.from({ length: 11 }, (_, i) => 'u' + i).filter((id) => id !== SELF).map((id) => <circle key={id} className={`pitch-dot${litClass(id)}`} style={at(id)} r="4" />)}
      </g>
      <g className="pitch-dot" style={at(SELF)}>
        <circle key={pulseSelf} className={`pitch-self ${pulseSelf > 0 ? 'pulse' : ''}${litClass(SELF)}`} r="6" />
        <text className="pitch-name" x="-10" y="-12">{selfName}</text>
        {card && <rect className={`pitch-card ${card}`} x="-3" y="-30" width="6" height="9" />}
      </g>
      <circle className="pitch-dot pitch-ball" style={at(BALL)} r="3" />
      <text className="pitch-dir" x={PAD + 4} y={H - 4}>ми →</text>
    </svg>
  );
}
