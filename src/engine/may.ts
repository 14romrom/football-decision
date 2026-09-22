// Лист «Що було в травні» (M19.2, 22.09; зауваження тестера: «виграв два сезони і нічого не сталося»).
// Один розворот зошита після останнього матчу першого сезону — за тим, як саме сезон закінчився:
// чемпіон / вихід у двійці / стикові виграні / стикові програні / мимо (і те, й те — «за регламентом»).
// Розворот той самий формат, що пролог і відпустка (PrologueScreen), наслідки — через applyWeek.
import mayJson from '../content/may.json';
import type { PrologueSpread } from './prologue';
import { playoffWon, promotion, standings, US, type Season } from './season';

const MAY = mayJson as unknown as Record<string, PrologueSpread>;

export type MayKind = 'champion' | 'direct' | 'playoff_won' | 'playoff_lost' | 'missed';

/** Яким був травень: чемпіон, вихід прямо, стикові (виграні чи ні), чи все вирішив регламент. */
export function mayKind(season: Season): MayKind | null {
  const promo = promotion(season);
  if (!promo) return null;
  const won = playoffWon(season);
  if (won === true) return 'playoff_won';
  if (won === false) return 'playoff_lost';
  if (promo.kind === 'scandal') return 'missed';
  return standings(season).find((r) => r.club === US)!.position === 1 ? 'champion' : 'direct';
}

export function maySpread(season: Season): PrologueSpread | null {
  const kind = mayKind(season);
  return kind ? MAY[kind] : null;
}
