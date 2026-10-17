import type { Kit } from '../engine/names';

// Форма клубу як SVG-патерн (17.10): той самий малюнок, що на фішках поля (ui/pitchDirector.ts), —
// для магнітів дошки аналітика. Кола заливаються `url(#id)`; без форми — суцільний запасний колір.

export function KitPattern({ id, kit, fallback }: { id: string; kit?: Kit; fallback: string }) {
  const k: Kit = kit ?? { pattern: 'solid', a: fallback, b: fallback, num: '#fff', gk: fallback, gkNum: '#fff' };
  return (
    <pattern id={id} patternUnits="objectBoundingBox" width="1" height="1" viewBox="0 0 10 10" preserveAspectRatio="none">
      <rect x="0" y="0" width="10" height="10" fill={k.a} />
      {k.pattern === 'stripes' && [1, 4, 7].map((x) => <rect key={x} x={x} y="0" width="1.5" height="10" fill={k.b} />)}
      {k.pattern === 'hoops' && [1.5, 4.5, 7.5].map((y) => <rect key={y} x="0" y={y} width="10" height="1.5" fill={k.b} />)}
      {k.pattern === 'sash' && <polygon points="0,2 2,0 10,8 8,10" fill={k.b} />}
      {k.pattern === 'halves' && <rect x="5" y="0" width="5" height="10" fill={k.b} />}
      {k.pattern === 'trim' && <circle cx="5" cy="5" r="4.4" fill="none" stroke={k.b} strokeWidth="1.1" />}
    </pattern>
  );
}
