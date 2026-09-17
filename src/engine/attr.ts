// Модификатор атрибута — вынесен отдельно, чтобы voices.ts и context.ts не зависели друг
// от друга по кругу: контекст теперь спрашивает у голосов, кого слышно.

import { ATTR_MOD } from './balance';

export function attrMod(attr: number): number {
  const { base, step, max } = ATTR_MOD;
  return Math.max(0, Math.min(max, Math.floor((attr - base) / step)));
}
