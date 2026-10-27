// Жетони «на кубик» (27.10, макет «Жетони на кубик», рішення користувача). Поправки кидка діляться на дві
// частини — і це лише показ, рушій рахує як і раніше:
//
//  - **сцена** — те, що стоїть у більшості варіантів сцени (ноги, кураж, виїзд…). Вони лягають жетонами на
//    лоток, однакові для будь-якого ходу: що на лотку, те й піде в кидок. До цього зона «на кубик» збирала
//    гірше з усіх варіантів, і число на лотку не збігалося з числом у кидку — «−18 на дебафах» тестера;
//  - **хід** — те, що є лише в частини варіантів (пасуть на ударі, «голос веде», риса проти дриблінгу,
//    «після провалу» не діє на Спокої). Ця різниця мовчки переїжджає в ціль на кнопці.
//
// Чому це не змінює баланс: ісход — `кубики + атрибут + усі поправки` проти порогів форми ризику, зсунутих на
// складність (`resolve.ts:tierFor`). Перенести частину поправок у поріг — та сама нерівність:
// raw + attr + сцена + хід > поріг ⇔ raw + attr + сцена > поріг − хід. Катастрофа й крит рахуються по
// голих кубиках — їх перенос не зачіпає. Тест у tokens.test.ts тримає рівність на всіх сценах пулу.

import { computeContext } from './context';
import { availableOptions } from './match';
import type { MatchConditions } from './conditions';
import type { Episode, EpisodeOption, FlagRule, MatchState, ModGroup, ModLine, Player } from './types';

export type Token = { group: ModGroup; value: number; lines: ModLine[] };
export type SceneSplit = {
  /** Жетони сцени з ненульовою сумою, у порядку лотка: тіло, голова, суперник, обставини. */
  tokens: Token[];
  /** Поправки сцени рядками — розбір по тапу. */
  scene: ModLine[];
  sceneSum: number;
  /** Різниця «поправки ходу − поправки сцени» за id варіанта: ціль на кнопці = ціль форми − shift. */
  shift: Record<string, number>;
};

export const GROUP_ORDER: ModGroup[] = ['body', 'head', 'opp', 'cond'];

/** Поправки варіанта без рядка атрибута (він — навичка, окрема монета) і без нулів. */
function optionMods(state: MatchState, player: Player, option: EpisodeOption, phase: Episode['phase'], cond: MatchConditions, rules: FlagRule[]): ModLine[] {
  return computeContext(state, player, option, phase, cond, rules).mods.slice(1).filter((m) => m.value !== 0);
}

/** Поправка належить сцені, коли вона є в більшості варіантів (строго більше половини); значення —
 *  найчастіше серед них. Решта — різниця кожного ходу, що йде в його ціль. */
export function sceneSplit(episode: Episode, state: MatchState, player: Player, cond: MatchConditions, rules: FlagRule[]): SceneSplit {
  const options = availableOptions(episode, state, player);
  const per = options.map((o) => optionMods(state, player, o, episode.phase, cond, rules));
  const seen = new Map<string, { line: ModLine; values: Map<number, number>; count: number }>();
  for (const mods of per) {
    for (const m of mods) {
      const e = seen.get(m.label) ?? { line: m, values: new Map(), count: 0 };
      e.count += 1;
      e.values.set(m.value, (e.values.get(m.value) ?? 0) + 1);
      seen.set(m.label, e);
    }
  }
  const scene: ModLine[] = [];
  for (const { line, values, count } of seen.values()) {
    if (count * 2 <= options.length) continue;
    const value = [...values.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    scene.push({ ...line, value });
  }
  const sceneSum = scene.reduce((s, m) => s + m.value, 0);
  const shift: Record<string, number> = {};
  options.forEach((o, i) => { shift[o.id] = per[i].reduce((s, m) => s + m.value, 0) - sceneSum; });
  const tokens = GROUP_ORDER.flatMap((group) => {
    const lines = scene.filter((m) => (m.group ?? 'cond') === group);
    const value = lines.reduce((s, m) => s + m.value, 0);
    return value !== 0 ? [{ group, value, lines }] : [];
  });
  return { tokens, scene, sceneSum, shift };
}

/** Зсув цілі для варіанта, якого немає серед доступних (ланка ланцюжка, підмінений у тестах): рахуємо напряму. */
export function shiftFor(split: SceneSplit, option: EpisodeOption, episode: Episode, state: MatchState, player: Player, cond: MatchConditions, rules: FlagRule[]): number {
  if (option.id in split.shift) return split.shift[option.id];
  return optionMods(state, player, option, episode.phase, cond, rules).reduce((s, m) => s + m.value, 0) - split.sceneSum;
}
