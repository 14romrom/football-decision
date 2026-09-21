// «Погуглити себе» (21.09, ідея користувача): справа тижня, ісход — заміткою в зошиті, без окремого екрана
// (правило 19.09: ESPM — єдиний екран-у-екрані). Два динамічні шматки — ціна на «Трансфермарті» (пародія, не бренд)
// і чутка з пошуку — підставляються в текст ісходу токенами ⟨ціна⟩ і ⟨чутка⟩ (не {дужки}: fillNames їх не знає).
// Ціна — число в євро, без відсотків; показується лише тут і ніде більше — не ресурс, а дзеркало. Стан арки на неї
// не впливає навмисно: ринок не бачить того, що бачить місто. Після зриву у відпустці — «уцінка: медогляд».

import type { Season } from './season';
import type { Career } from './career';

const K = 1000;

/** Оцінка: база за лігою × результативність × середня оцінка тренера; після зриву медогляду — нижче. */
export function marketValue(season: Season, career: Career): number {
  const base = season.number >= 2 ? 600 * K : 150 * K;
  const p = season.player;
  const actions = p.goals + p.assists;
  const coach = p.matches ? p.coachSum / p.matches : 6;
  const perf = 1 + actions * 0.08 + (coach - 6) * 0.15;
  const collapse = (career.agentLog ?? []).some((a) => a.reason === 'medical') && season.number >= 2 && season.round < 5 ? 0.7 : 1;
  const v = base * Math.max(0.5, perf) * collapse;
  return Math.round(v / (25 * K)) * 25 * K;
}

/** «€ 450 тис.» / «€ 1,2 млн» — без десяткових хвостів і без відсотків. */
export function formatMarket(v: number): string {
  if (v >= 1000 * K) { const m = Math.round(v / (100 * K)) / 10; return `€ ${String(m).replace('.', ',')} млн`; }
  return `€ ${Math.round(v / K)} тис.`;
}

/** Що видає пошук за прізвищем: чутка за станом кар’єри, одна фраза. */
export function rumourLine(season: Season, career: Career, usName: string): string {
  const log = career.agentLog ?? [];
  if (season.number >= 2 && log.some((a) => a.reason === 'medical')) return `«Реєс: медогляд не пройдено, клуб вищої ліги відмовився» — і три копії цієї новини з різними заголовками`;
  if (season.number >= 2) return `«Дебютант вищої ліги на радарі клубів Ліги чемпіонів» — джерела, які не називають ні клубів, ні джерел`;
  if (season.round >= 5) return `«Десятка „${usName}“ цікавить клуби вищої ліги» — «джерела», тобто твій агент`;
  return `перший результат — тренер з іншої ліги з таким самим прізвищем; ти — четвертий, після оголошення про продаж велосипеда`;
}

/** Підставити динаміку в тексти справи: ⟨ціна⟩ і ⟨чутка⟩. */
export function fillMarket<T>(value: T, season: Season, career: Career, usName: string): T {
  const price = formatMarket(marketValue(season, career));
  const rumour = rumourLine(season, career, usName);
  const walk = (x: unknown): unknown => {
    if (typeof x === 'string') return x.replace(/⟨ціна⟩/g, price).replace(/⟨чутка⟩/g, rumour);
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, v]) => [k, walk(v)]));
    return x;
  };
  return walk(value) as T;
}
