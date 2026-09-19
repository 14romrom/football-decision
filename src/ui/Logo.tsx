// Логотип Inside the Box (19.09): название внутри линий штрафной — той же, что рисует Pitch.
// Леттеринг красный --bad, цвет штампа «Катастрофа»: игра заранее ставит на себе печать.
// Вектор, не шрифт: одинаков в APK и на сайте, не ждёт загрузки Oswald.
// Лёгкое смещение через feTurbulence — «пропечатка» штампа, едва заметная намеренно.

export function Logo({ id = 'logo' }: { id?: string }) {
  const f = `${id}-stamp`;
  return (
    <svg className="logo" viewBox="0 0 300 118" role="img" aria-label="Inside the Box">
      <defs>
        <filter id={f} x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" />
        </filter>
      </defs>
      {/* лицевая линия, штрафная, площадь ворот, точка, дуга */}
      <g className="logo-lines" fill="none" strokeWidth="1.4">
        <line x1="0" y1="4" x2="300" y2="4" />
        <path d="M10 4 V96 H290 V4" />
        <path d="M92 4 V30 H208 V4" />
        <path d="M113 96 A40 40 0 0 1 187 96" />
      </g>
      <circle className="logo-spot" cx="150" cy="72" r="2.2" />
      <g className="logo-text" filter={`url(#${f})`} textAnchor="middle" fontWeight="600">
        <text x="150" y="60" fontSize="34" letterSpacing="3">INSIDE THE</text>
        <text x="150" y="112" fontSize="58" letterSpacing="6">BOX</text>
      </g>
    </svg>
  );
}
