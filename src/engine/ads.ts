// Розклад реклами (M48, макет «Реклама в Inside the Box», погоджено 17.10). Лише рішення «коли» — без
// AdMob, щоб правило можна було перевірити тестом; показує `ui/ads.ts`.
//
// Не більше однієї примусової реклами на матч, один спільний лічильник:
//   пауза в матчі — кожен парний матч кар'єри з другого (2, 4, 6…);
//   ролик після матчу — кожен третій, між дошкою й ESPM, лише якщо паузи в цьому матчі не було (3, 9, 15…);
//   пролог і перший матч — без реклами. Покупка «Без реклами» вимикає все, паузи лишаються історією.

import type { Rng } from './rng';
import type { AdBreak, AdBreakDef } from '../content';

/** `matchNo` — номер матчу в кар'єрі, з одиниці (перший матч — 1). */
export function adPlan(matchNo: number): { pause: boolean; post: boolean } {
  if (matchNo < 2) return { pause: false, post: false };
  const pause = matchNo % 2 === 0;
  return { pause, post: !pause && matchNo % 3 === 0 };
}

/** Хвилина паузи: кінець першого тайму (36–44) або другий тайм (55–80) — навпіл. Від сиду матчу, тож
 *  перезавантаження ставить паузу на ту саму хвилину. */
export function pauseMinute(rng: Rng): number {
  return rng.next() < 0.5 ? 36 + Math.floor(rng.next() * 9) : 55 + Math.floor(rng.next() * 26);
}

/** Сюжет паузи — по колу: шість сюжетів на шість пауз, далі знову з першого. Пауза n-та в кар'єрі
 *  (2-й матч — перша), тому один сюжет не повторюється раніше ніж за дванадцять матчів. */
export function breakIndex(matchNo: number, count: number): number {
  return (Math.floor(matchNo / 2) - 1 + count) % count;
}

/** Сюжет паузи для матчу. Перший сезон — шість сюжетів другої ліги, другий — п'ять своїх, вищої
 *  (рішення користувача 18.10: у другому сезоні старі паузи повторювались, а дві з них казали
 *  «друга ліга»). Пауз за сезон п'ять, тож усередині сезону сюжет не повторюється. Погода — з умов
 *  матчу: «спеки тут немає» в серпневу спеку читалося як помилка. */
export function adBreakFor(all: AdBreakDef[], matchNo: number, league: 'top' | 'second', weather: string): AdBreak {
  const pool = all.filter((b) => (b.league ?? 'second') === league);
  const b = pool[breakIndex(matchNo, pool.length)];
  const setup = b.weather ? b.setup.replace('{weather}', b.weather[weather] ?? b.weather.clear) : b.setup;
  return { id: b.id, setup, voices: b.voices, note: b.note };
}
