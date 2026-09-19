import type { Episode } from '../engine/types';

// Поле над сценою (решение 19.09, макет А2): условное, целиком, ми атакуємо праворуч. Пока
// статичное — точка гравця ставится по семье и фазе эпизода; когда появится Phaser, сюда же
// ляжет анимация подводки/развязки, а `zone` у эпизодов заменит эту эвристику.

type Spot = [number, number];
/** Где на поле происходит сцена: доля ширины (0 — свои ворота, 1 — чужие) и высоты. */
const FAMILY_SPOT: Record<string, Spot> = {
  edge_shot: [0.74, 0.5], one_on_one: [0.86, 0.5], finishing: [0.9, 0.48], penalty: [0.88, 0.5],
  free_kick: [0.72, 0.42], corner_attack: [0.97, 0.06], through: [0.62, 0.5], wing: [0.7, 0.14],
  counter: [0.5, 0.5], partner: [0.55, 0.5], press: [0.42, 0.5], duel: [0.34, 0.5], last_man: [0.2, 0.5],
  corner_defense: [0.04, 0.94], coach: [0.5, 0.97], referee: [0.5, 0.5], body: [0.5, 0.5],
};
const PHASE_SPOT: Record<NonNullable<Episode['phase']>, Spot> = { attack: [0.7, 0.5], defense: [0.3, 0.5], transition: [0.5, 0.5], setpiece: [0.8, 0.4] };

/** Соперник: при нашей атаке сидит глубоко у своих ворот, при обороне — давит на наши. */
const THEM_ATTACK: Spot[] = [[0.86, 0.3], [0.85, 0.45], [0.85, 0.57], [0.86, 0.72], [0.77, 0.36], [0.76, 0.5], [0.77, 0.66], [0.7, 0.42], [0.69, 0.58], [0.95, 0.5]];
const THEM_DEFENSE: Spot[] = [[0.3, 0.3], [0.28, 0.5], [0.3, 0.7], [0.42, 0.4], [0.42, 0.62], [0.55, 0.5], [0.6, 0.25], [0.6, 0.75], [0.7, 0.5], [0.95, 0.5]];
const US_ATTACK: Spot[] = [[0.43, 0.22], [0.34, 0.5], [0.43, 0.8], [0.57, 0.15], [0.58, 0.85], [0.23, 0.5], [0.05, 0.5]];
const US_DEFENSE: Spot[] = [[0.12, 0.3], [0.1, 0.5], [0.12, 0.7], [0.22, 0.4], [0.22, 0.62], [0.36, 0.5], [0.05, 0.5]];

const W = 350; const H = 180; const PAD = 10;
const px = (s: Spot): [number, number] => [PAD + s[0] * (W - 2 * PAD), 12 + s[1] * (H - 24)];

export function Pitch({ episode, selfName }: { episode: Episode | null; selfName: string }) {
  const phase = episode?.phase ?? 'attack';
  const spot = (episode?.family && FAMILY_SPOT[episode.family]) || PHASE_SPOT[phase];
  const [sx, sy] = px(spot);
  const attacking = phase !== 'defense';
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
        {(attacking ? THEM_ATTACK : THEM_DEFENSE).map((s, i) => { const [x, y] = px(s); return <circle key={i} cx={x} cy={y} r="4" />; })}
      </g>
      <g className="pitch-us">
        {(attacking ? US_ATTACK : US_DEFENSE).map((s, i) => { const [x, y] = px(s); return <circle key={i} cx={x} cy={y} r="4" />; })}
      </g>
      <circle className="pitch-self" cx={sx} cy={sy} r="6" />
      <circle className="pitch-ball" cx={sx + 7} cy={sy + 6} r="3" />
      <text className="pitch-name" x={sx - 10} y={sy - 12}>{selfName}</text>
      <text className="pitch-dir" x={PAD + 4} y={H - 4}>ми →</text>
    </svg>
  );
}
