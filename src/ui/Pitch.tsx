import type { Episode } from '../engine/types';
import type { Strength } from '../engine/conditions';

// Поле над сценою (макет А2; шаги 1–2 плана 19.09): условное, целиком, ми атакуємо праворуч.
// 11 на 11: наши — 4-3-3 (АПЗ — десятка), соперник по силе: слабый 4-4-2, равный 4-2-3-1,
// сильный 4-3-3. Фаза сдвигает линии обеих команд: атака — все едут вправо (наши поднимаются,
// их блок садится), оборона — влево. Реєс встаёт в точку сцены, ближайший соперник — рядом.
// Точки не прыгают, а едут (CSS transition по transform; при «Менше руху» — без), чтобы за девять
// эпизодов было видно, как матч перетекает. Шаг 3 (развязка после броска) — отдельно.

type Spot = [number, number];
/** Где на поле происходит сцена: доля ширины (0 — свои ворота, 1 — чужие) и высоты. */
const FAMILY_SPOT: Record<string, Spot> = {
  edge_shot: [0.74, 0.5], one_on_one: [0.86, 0.5], finishing: [0.9, 0.48], penalty: [0.88, 0.5],
  free_kick: [0.72, 0.42], corner_attack: [0.96, 0.92], through: [0.62, 0.5], wing: [0.7, 0.14],
  counter: [0.5, 0.5], partner: [0.55, 0.5], press: [0.42, 0.5], duel: [0.34, 0.5], last_man: [0.2, 0.5],
  corner_defense: [0.04, 0.94], coach: [0.5, 0.97], referee: [0.5, 0.5], body: [0.5, 0.5],
};
const PHASE_SPOT: Record<NonNullable<Episode['phase']>, Spot> = { attack: [0.7, 0.5], defense: [0.3, 0.5], transition: [0.5, 0.5], setpiece: [0.8, 0.4] };

/** Схема — линии от своих ворот: x каждой линии и y игроков в ней (доли поля, атака вправо). */
type Formation = { x: number; ys: number[] }[];
const F433: Formation = [{ x: 0.05, ys: [0.5] }, { x: 0.2, ys: [0.2, 0.4, 0.6, 0.8] }, { x: 0.38, ys: [0.3, 0.5, 0.7] }, { x: 0.6, ys: [0.15, 0.5, 0.85] }];
const F442: Formation = [{ x: 0.05, ys: [0.5] }, { x: 0.2, ys: [0.2, 0.4, 0.6, 0.8] }, { x: 0.4, ys: [0.15, 0.4, 0.6, 0.85] }, { x: 0.6, ys: [0.4, 0.6] }];
const F4231: Formation = [{ x: 0.05, ys: [0.5] }, { x: 0.2, ys: [0.2, 0.4, 0.6, 0.8] }, { x: 0.35, ys: [0.4, 0.6] }, { x: 0.5, ys: [0.15, 0.5, 0.85] }, { x: 0.64, ys: [0.5] }];
const THEM_BY_STRENGTH: Record<Strength, Formation> = { weak: F442, even: F4231, strong: F433 };
/** Сдвиг всех линий по фазе: атакуем — поле смещается к чужим воротам, обороняемся — к своим. */
const PHASE_SHIFT: Record<NonNullable<Episode['phase']>, number> = { attack: 0.12, defense: -0.12, transition: 0, setpiece: 0.1 };

const W = 350; const H = 180; const PAD = 10;
const px = (s: Spot): [number, number] => [PAD + s[0] * (W - 2 * PAD), 12 + s[1] * (H - 24)];
const clamp = (v: number) => Math.max(0.03, Math.min(0.97, v));

/** Позиции команды: наши считаются от своих ворот слева, соперник — зеркально от правых. */
function positions(f: Formation, mirror: boolean, shift: number): Spot[] {
  const out: Spot[] = [];
  for (const line of f) for (const y of line.ys) {
    const x = mirror ? 1 - line.x : line.x;
    // Вратарь не уезжает с линией.
    out.push([line.x < 0.1 ? x : clamp(x + shift), y]);
  }
  return out;
}

export function Pitch({ episode, selfName, strength = 'even' }: { episode: Episode | null; selfName: string; strength?: Strength }) {
  const phase = episode?.phase ?? 'transition';
  const spot = (episode?.family && FAMILY_SPOT[episode.family]) || PHASE_SPOT[phase];
  const shift = PHASE_SHIFT[phase];
  const us = positions(F433, false, shift);
  const them = positions(THEM_BY_STRENGTH[strength], true, shift);
  // Реєс — десятка (последняя линия, центр) — встаёт в точку сцены; ближайший соперник (не вратарь) — рядом с ним.
  const selfIdx = us.length - 2;
  us[selfIdx] = spot;
  let near = 1; let best = Infinity;
  them.forEach((p, i) => { if (i === 0) return; const d = (p[0] - spot[0]) ** 2 + (p[1] - spot[1]) ** 2; if (d < best) { best = d; near = i; } });
  them[near] = [clamp(spot[0] + 0.045), clamp(spot[1] + 0.06)];
  const at = (s: Spot) => { const [x, y] = px(s); return { transform: `translate(${x}px, ${y}px)` }; };

  return (
    <svg className="pitch" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x="0" y="0" width={W} height={H} className="pitch-grass" />
      <g className="pitch-lines">
        <rect x={PAD} y="12" width={W - 2 * PAD} height={H - 24} />
        <line x1={W / 2} y1="12" x2={W / 2} y2={H - 12} />
        <circle cx={W / 2} cy={H / 2} r="24" />
        <rect x={PAD} y="45" width="48" height="90" /><rect x={PAD} y="67" width="16" height="46" />
        <rect x={W - PAD - 48} y="45" width="48" height="90" /><rect x={W - PAD - 16} y="67" width="16" height="46" />
        <path d={`M ${PAD + 48} 72 A 22 22 0 0 1 ${PAD + 48} 108`} />
        <path d={`M ${W - PAD - 48} 72 A 22 22 0 0 0 ${W - PAD - 48} 108`} />
      </g>
      <g className="pitch-them">
        {them.map((s, i) => <circle key={i} className="pitch-dot" style={at(s)} r="4" />)}
      </g>
      <g className="pitch-us">
        {us.map((s, i) => (i === selfIdx ? null : <circle key={i} className="pitch-dot" style={at(s)} r="4" />))}
      </g>
      <g className="pitch-dot" style={at(spot)}>
        <circle className="pitch-self" r="6" />
        <circle className="pitch-ball" cx="7" cy="6" r="3" />
        <text className="pitch-name" x="-10" y="-12">{selfName}</text>
      </g>
      <text className="pitch-dir" x={PAD + 4} y={H - 4}>ми →</text>
    </svg>
  );
}
