// Тексти двох екранів перед матчем (27.09). Були всередині BriefingScreen, поки екран був один;
// тепер їх ділять матчдей (`MatchdayScreen` — факт: погода одним словом) і екран Реєса
// (`PrematchScreen` — наслідок: що ця погода зробить із рішеннями).

import type { MatchConditions } from '../engine/conditions';
import type { Attribute } from '../engine/types';

export const ATTR_GEN: Record<Attribute, string> = {
  finishing: 'удар', passing: 'пас', dribbling: 'дриблінг', first_touch: 'перший дотик',
  pace: 'швидкість', strength: 'боротьбу', stamina: 'витривалість',
  composure: 'спокій', vision: 'бачення поля', positioning: 'позиційну гру',
};

export const WEATHER: Record<MatchConditions['weather'], { title: string; note: string }> = {
  clear: { title: 'Ясно', note: 'Газон сухий, м’яч слухається.' },
  rain: { title: 'Дощ', note: 'Мокрий газон — дриблінг і паси менш надійні.' },
  heat: { title: 'Спека', note: 'Сили йтимуть швидше, ніж зазвичай.' },
  wind: { title: 'Вітер', note: 'Удари здалеку і подачі зі стандартів гірше слухаються.' },
};

export const INSTRUCTION: Record<Exclude<MatchConditions['instruction'], 'none'>, { title: string; quote: string; note: string }> = {
  hold: { title: 'На результат', quote: '«Без авантюр. Тримаємо м’яч, граємо просто.»',
    note: 'Надійні рішення тренер оцінить вище; провал на ризику коштуватиме дорожче.' },
  press: { title: 'Тиснути', quote: '«Вони цього не чекають. Іди в обведення, бий, не озирайся.»',
    note: 'Сміливі рішення тренер відзначить; кожен обережний хід — «просив же тиснути».' },
  free: { title: 'Вільна роль', quote: '«Роби що хочеш, але щоб у протоколі було твоє прізвище.»',
    note: 'Тренер чекає голів і передач — і рахуватиме саме їх.' },
};

export function toneLines(c: MatchConditions): { title: string; note: string } {
  const { confidence, fatigue } = c.tone;
  const form = confidence >= 2 ? 'Серія перемог — упевненості вистачає на двох.'
    : confidence === 1 ? 'Останні матчі радше вдалі, настрій робочий.'
    : confidence === 0 ? 'Форма рівна: ні куражу, ні тягаря.'
    : confidence === -1 ? 'Останні матчі не пішли, голова важча за ноги.'
    : 'Кілька поразок поспіль. Нерви на межі.';
  const legs = fatigue === 0 ? 'Після паузи — свіжий.'
    : fatigue === 1 ? 'Другий матч поспіль, ноги в нормі.'
    : fatigue === 2 ? 'Третій матч за десять днів — стартуєш не на повних.'
    : 'Четвертий матч поспіль. Сил на всі дев’яносто немає.';
  const title = confidence > 0 && fatigue < 2 ? 'На підйомі'
    : confidence < 0 && fatigue >= 2 ? 'Вичавлений'
    : fatigue >= 2 ? 'Втомлений' : confidence < 0 ? 'Пригнічений' : 'Рівний';
  return { title, note: form + ' ' + legs };
}

/** День туру: непарні — субота, парні — неділя. Без оператора остачі: тест шукає «%» у текстах. */
export const matchDay = (round: number) => ((round & 1) === 1 ? 'субота' : 'неділя');
/** Вдома грають увечері, на виїзді — пізніше: різниця помітна в рядку матчдея. */
export const matchTime = (venue: MatchConditions['venue']) => (venue === 'home' ? '18:00' : '20:00');
