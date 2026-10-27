import type { ReactNode } from 'react';
import { t } from '../content/i18n';

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
  if (l.startsWith(t('свіжість'))) return Icon.battery(false);
  if (l.startsWith(t('ноги'))) return Icon.battery(true);
  if (l.startsWith(t('кураж'))) return Icon.flame();
  if (l.startsWith(t('куражу немає')) || l.startsWith(t('без куражу'))) return Icon.down();
  if (l.startsWith(t('після провалу'))) return Icon.down();
  if (l.includes(t('нерви')) || l.startsWith(t('спокійний'))) return Icon.pulse();
  if (l.startsWith(t('жовта'))) return Icon.card();
  if (l.startsWith(t('пошкодження')) || l.startsWith(t('мікротравма'))) return Icon.bandage();
  if (l.includes(t('трибуни')) || l.includes(t('стадіон'))) return Icon.crowd();
  if (l.includes(t('суперник'))) return Icon.shield();
  if (l.includes(t('газон'))) return Icon.rain();
  if (l.startsWith(t('вітер'))) return Icon.wind();
  if (l.includes(t('веде')) || l.includes(t('заглушило')) || l.includes(t('чекає на пас'))) return Icon.voice();
  if (l.includes(t('рідні'))) return Icon.home();
  if (l.startsWith(t('їхн'))) return Icon.shield();
  return source === 'field' ? Icon.shield() : Icon.dot();
}

// Значки жетонів «на кубик» (27.10, макет «Жетони на кубик»): силует, як карбування на монеті — заливка,
// вирізи через evenodd, грубі лінії класом `s`. Сітка 24, колір — від жетона. Власні, без чужих наборів.
const fsvg = (children: ReactNode) => (
  <svg className="tk-ico" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true">{children}</svg>
);
const ball = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r}a${r} ${r} 0 1 1 0 ${2 * r}a${r} ${r} 0 1 1 0-${2 * r}z M${cx} ${cy - r * 0.5}l${r * 0.45} ${r * 0.33}-${r * 0.17} ${r * 0.52}h-${r * 0.56}l-${r * 0.17}-${r * 0.52}z`;

/** Групи жетонів. */
export const GroupIcon: Record<'body' | 'head' | 'opp' | 'cond', () => ReactNode> = {
  // бутса з шипами
  body: () => fsvg(<><path d="M2 16.2V8c0-.7.5-1.2 1.2-1.2h3.9l1.8 4 4.7 2h4a3 3 0 0 1 3 3v.4z" /><rect x="4.3" y="17" width="2.2" height="2.6" rx=".6" /><rect x="9" y="17" width="2.2" height="2.6" rx=".6" /><rect x="13.7" y="17" width="2.2" height="2.6" rx=".6" /><rect x="18.2" y="17" width="2.2" height="2.6" rx=".6" /></>),
  // голова в профіль зі знаком питання — думка
  head: () => fsvg(<path d="M8.4 21.8v-3.4H6.5a1.7 1.7 0 0 1-1.7-1.7v-2.4l-1.9-1 2-4A7.4 7.4 0 0 1 19.4 11c0 2.3-1 4.4-2.7 5.7v5.1zm4.1-14.6a2.6 2.6 0 0 0-2.6 2.4h2a.6.6 0 1 1 .9.5c-.9.5-1.4 1.2-1.4 2.2v.4h2v-.3c0-.3.2-.6.6-.8a2.6 2.6 0 0 0-1.5-4.4zm-1.1 6.9h2v2h-2z" />),
  // чужа футболка з номером
  opp: () => fsvg(<path d="M8.4 2.6 3.2 5.5l1.9 4.6 2-.8v12.3h9.8V9.3l2 .8 1.9-4.6-5.2-2.9a3.6 3.6 0 0 1-7.2 0zm1.9 8.4h4.3l-2.3 6.3h-2.2l1.8-4.4h-1.6z" />),
  // трибуна з прожектором
  cond: () => fsvg(<><path d="M2.5 21.5v-1.6h1.2v-3.6h3v-2.6h3v-2.6h3.6v8.8h2.4V8.6h1.8v11.3h4v1.6z" /><path d="M14.6 2.2h6.2c.4 0 .7.3.7.7v4.4c0 .4-.3.7-.7.7h-6.2a.7.7 0 0 1-.7-.7V2.9c0-.4.3-.7.7-.7zm1.6 1.7v1.8h1.1V3.9zm2.3 0v1.8h1.1V3.9z" /></>),
};

/** Атрибути — значок на латунній монеті навички. */
export const AttrIcon: Record<string, () => ReactNode> = {
  finishing: () => fsvg(<><path d={ball(16.2, 12, 5.3)} /><rect x="1.5" y="7.2" width="7" height="2" rx="1" /><rect x="0.5" y="11" width="9" height="2" rx="1" /><rect x="2.5" y="14.8" width="6" height="2" rx="1" /></>),
  passing: () => fsvg(<><circle cx="4.6" cy="17.6" r="2.7" /><path className="s" d="M7.6 15C10 9 14.4 6.6 18.3 7.2" strokeDasharray="2.3 2.6" /><path d="M17.2 3.9l5 3.5-5.6 2.6z" /></>),
  dribbling: () => fsvg(<><path className="s" d="M2.8 3.8l4.2 2.6-3 3 4.2 2.6-2.6 2.8" /><path d={ball(16, 15.4, 5.6)} /></>),
  first_touch: () => fsvg(<><path d="M1.8 21v-5.6c0-.5.4-.9.9-.9h3l1.4 2.8 3.9 1.5h3.4a2.8 2.8 0 0 1 2.8 2.2z" /><path d={ball(15.5, 6.3, 4)} /><path className="s" d="M10.6 12.8c.8-.9 1.8-1.4 3-1.5" /></>),
  pace: () => fsvg(<path d="M14.6 1.8 4.6 13.6h6.1l-1.6 8.6 10.3-12.6h-6.3z" />),
  strength: () => fsvg(<path d="M12 2.6c-2.9 0-5.2 2.1-5.2 4.8 0 .9.3 1.7.7 2.5a7.3 7.3 0 1 0 9 0c.4-.8.7-1.6.7-2.5 0-2.7-2.3-4.8-5.2-4.8zm0 2.5c1.5 0 2.7 1 2.7 2.3 0 .3-.1.7-.2 1a7.6 7.6 0 0 0-5 0 2.5 2.5 0 0 1-.2-1c0-1.3 1.2-2.3 2.7-2.3z" />),
  stamina: () => fsvg(<path d="M5.5 1.8h13v2.4h-1.2v2.4c0 2.3-1.5 4.2-3.6 5.4 2.1 1.2 3.6 3.1 3.6 5.4v2.4h1.2v2.4h-13v-2.4h1.2v-2.4c0-2.3 1.5-4.2 3.6-5.4-2.1-1.2-3.6-3.1-3.6-5.4V4.2H5.5zm3.7 15.6h5.6c-.3-1.4-1.4-2.5-2.8-3.3-1.4.8-2.5 1.9-2.8 3.3z" />),
  composure: () => fsvg(<><path className="s" d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6" /><path className="s" d="M9.4 3.9 12 6.3l2.6-2.4M9.4 20.1 12 17.7l2.6 2.4M3.5 10.5l3.3 1.5-3.3 1.5M20.5 10.5l-3.3 1.5 3.3 1.5" /></>),
  vision: () => fsvg(<><path d="M12 4.6C6.4 4.6 2.4 9.2 1.2 12c1.2 2.8 5.2 7.4 10.8 7.4S21.6 14.8 22.8 12C21.6 9.2 17.6 4.6 12 4.6zm0 3a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8z" /><circle cx="12" cy="12" r="2.1" /></>),
  positioning: () => fsvg(<path d="M12 1.6a7.4 7.4 0 0 0-7.4 7.4c0 5.3 7.4 13.4 7.4 13.4S19.4 14.3 19.4 9A7.4 7.4 0 0 0 12 1.6zm0 4.6a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z" />),
};
