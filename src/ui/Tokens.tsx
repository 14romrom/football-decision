import type { CSSProperties, ReactNode, Ref } from 'react';
import type { Attribute, ModGroup } from '../engine/types';
import { ATTRIBUTE_LABEL } from '../engine/types';
import type { Token } from '../engine/tokens';
import { AttrIcon, GroupIcon } from './icons';
import { t } from '../content/i18n';

// Жетони «на кубик» (27.10, макет «Жетони на кубик»): поправки сцени — чотири групи, у кожній і плюси,
// і мінуси, нульова група не показується. Над жетоном назва групи, у жетоні значок, під жетоном число
// зі знаком (плюс латунний, мінус іржавий — знак не тримається на кольорі групи). Висота стопки — модуль
// числа. Навичка — окрема латунна монета зі значком атрибута, лише в кидку: на листі моменту її немає,
// бо атрибут у кожного ходу свій, а значки атрибутів на кнопках відкинуто.

export const GROUP_LABEL: Record<ModGroup, string> = {
  body: t('тіло'), head: t('голова'), opp: t('суперник'), cond: t('обставини'),
};

const fmt = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');

/** Ребра стопки під верхнім жетоном — по одному на одиницю, не більше шести. */
function pile(n: number): CSSProperties {
  const k = Math.min(Math.max(n, 1), 6);
  const s: string[] = [];
  for (let i = 1; i < k; i++) s.push(`0 ${i * 4 - 1}px 0 0 var(--tk-rim)`, `0 ${i * 4}px 0 0 var(--tk-c)`);
  return { ['--pile' as string]: s.length ? s.join(', ') : '0 0 0 transparent', marginBottom: `${(k - 1) * 4}px` };
}

type StackProps = { name: string; value: number; icon: ReactNode; cls: string; spent?: boolean; coinRef?: Ref<HTMLSpanElement> };
function Stack({ name, value, icon, cls, spent, coinRef }: StackProps) {
  return (
    <span className={`tk${spent ? ' spent' : ''}`}>
      <span className="tk-name">{name}</span>
      <span className={`tk-coin ${cls}`} style={pile(Math.abs(value))} ref={coinRef}>{icon}</span>
      <span className={`tk-val ${value > 0 ? 'pos' : value < 0 ? 'neg' : ''}`}>{fmt(value)}</span>
    </span>
  );
}

export function TokenStack({ token, spent, coinRef }: { token: Token; spent?: boolean; coinRef?: Ref<HTMLSpanElement> }) {
  return <Stack name={GROUP_LABEL[token.group]} value={token.value} icon={GroupIcon[token.group]()} cls={`g-${token.group}`} spent={spent} coinRef={coinRef} />;
}

export function SkillCoin({ attribute, value, spent, coinRef }: { attribute: Attribute; value: number; spent?: boolean; coinRef?: Ref<HTMLSpanElement> }) {
  return <Stack name={ATTRIBUTE_LABEL[attribute]} value={value} icon={AttrIcon[attribute]?.()} cls="g-skill" spent={spent} coinRef={coinRef} />;
}
