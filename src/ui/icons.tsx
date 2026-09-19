import type { ReactNode } from 'react';

// Знаки факторов броска (решение 19.09: «иконками дополнительные характеристики»). Инлайн-SVG,
// обводка currentColor — цвет задаёт родитель. Подбор по подписи модификатора из context.ts:
// новая строка там → новая ветка в modIcon, иначе покажется точка.

const svg = (children: ReactNode, extra: Record<string, string> = {}) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...extra}>{children}</svg>
);

export const Icon = {
  flame: () => svg(<path d="M12 22c4-2 7-5 7-9 0-3-2-5-3-6-1 2-2 3-3 3 0-3-1-6-3-8-1 3-5 6-5 11 0 4 3 7 7 9z" />),
  battery: (low = true) => svg(<><rect x="3" y="7" width="15" height="10" rx="2" /><line x1="21" y1="10" x2="21" y2="14" /><rect x="5" y="9" width={low ? 4 : 11} height="6" fill="currentColor" stroke="none" /></>),
  shield: () => svg(<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />),
  eye: () => svg(<><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="3" /></>),
  target: () => svg(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="3" x2="12" y2="7" /><line x1="12" y1="17" x2="12" y2="21" /><line x1="3" y1="12" x2="7" y2="12" /><line x1="17" y1="12" x2="21" y2="12" /></>),
  down: () => svg(<><line x1="12" y1="4" x2="12" y2="20" /><polyline points="6 14 12 20 18 14" /></>),
  pulse: () => svg(<polyline points="3 12 7 12 10 5 14 19 17 12 21 12" />),
  card: () => svg(<rect x="6" y="3" width="12" height="18" rx="2" fill="currentColor" stroke="none" />),
  bandage: () => svg(<><rect x="3" y="8" width="18" height="8" rx="4" /><line x1="9" y1="10" x2="9" y2="14" /><line x1="12" y1="10" x2="12" y2="14" /><line x1="15" y1="10" x2="15" y2="14" /></>),
  crowd: () => svg(<><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M2 20c0-4 3-6 6-6s6 2 6 6" /><path d="M14 14c3 0 6 2 6 6" /></>),
  rain: () => svg(<><path d="M7 15a5 5 0 1 1 1-9.9A6 6 0 0 1 19 8a4 4 0 0 1-1 7.9" /><line x1="9" y1="18" x2="8" y2="21" /><line x1="13" y1="18" x2="12" y2="21" /><line x1="17" y1="18" x2="16" y2="21" /></>),
  wind: () => svg(<><path d="M3 8h11a3 3 0 1 0-3-3" /><path d="M3 14h15a3 3 0 1 1-3 3" /></>),
  voice: () => svg(<><path d="M12 3a4 4 0 0 1 4 4v5a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4z" /><path d="M5 11a7 7 0 0 0 14 0" /><line x1="12" y1="18" x2="12" y2="21" /></>),
  home: () => svg(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>),
  dot: () => svg(<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />),
  dice: () => svg(<><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" /><circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></>),
  energy: () => svg(<path d="M6 3v18M18 3v18M3 6h6M15 6h6M3 18h6M15 18h6" />),
  list: () => svg(<><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="16" y2="12" /><line x1="4" y1="18" x2="12" y2="18" /></>),
  person: () => svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="12" r="2.5" /><line x1="14" y1="10" x2="18" y2="10" /><line x1="14" y1="14" x2="18" y2="14" /></>),
};

/** Знак по подписи модификатора (context.ts). Порядок важен: «свіжість» раньше общего «сил». */
export function modIcon(label: string, source?: string): ReactNode {
  const l = label.toLowerCase();
  if (l.startsWith('свіжість')) return Icon.battery(false);
  if (l.startsWith('ноги')) return Icon.battery(true);
  if (l.startsWith('кураж')) return Icon.flame();
  if (l.startsWith('провали')) return Icon.down();
  if (l.startsWith('після провалу')) return Icon.down();
  if (l.includes('нерви') || l.startsWith('спокійний')) return Icon.pulse();
  if (l.startsWith('жовта')) return Icon.card();
  if (l.startsWith('пошкодження') || l.startsWith('мікротравма')) return Icon.bandage();
  if (l.includes('трибуни') || l.includes('стадіон')) return Icon.crowd();
  if (l.includes('суперник')) return Icon.shield();
  if (l.includes('газон')) return Icon.rain();
  if (l.startsWith('вітер')) return Icon.wind();
  if (l.includes('веде') || l.includes('заглушило') || l.includes('чекає на пас')) return Icon.voice();
  if (l.includes('рідні')) return Icon.home();
  if (l.startsWith('їхн')) return Icon.shield();
  return source === 'field' ? Icon.shield() : Icon.dot();
}
