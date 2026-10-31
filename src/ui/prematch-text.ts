// Тексти двох екранів перед матчем (27.09). Були всередині BriefingScreen, поки екран був один;
// тепер їх ділять матчдей (`MatchdayScreen` — факт: погода одним словом) і екран Реєса
// (`PrematchScreen` — наслідок: що ця погода зробить із рішеннями).

import type { MatchConditions } from '../engine/conditions';
import type { Attribute } from '../engine/types';
import { t } from '../content/i18n';

export const ATTR_GEN: Record<Attribute, string> = {
  finishing: t('удар'), passing: t('пас'), dribbling: t('дриблінг'), first_touch: t('перший дотик'),
  pace: t('швидкість'), strength: t('боротьбу'), stamina: t('витривалість'),
  composure: t('спокій'), vision: t('бачення поля'), positioning: t('позиційну гру'),
};

export const WEATHER: Record<MatchConditions['weather'], { title: string; note: string }> = {
  clear: { title: t('Ясно'), note: t('Газон сухий, м’яч слухається.') },
  rain: { title: t('Дощ'), note: t('Мокрий газон — дриблінг і паси менш надійні.') },
  heat: { title: t('Спека'), note: t('Сили йтимуть швидше, ніж зазвичай.') },
  wind: { title: t('Вітер'), note: t('Удари здалеку і подачі зі стандартів гірше слухаються.') },
};

export const INSTRUCTION: Record<Exclude<MatchConditions['instruction'], 'none'>, { title: string; quote: string; note: string }> = {
  hold: { title: t('На результат'), quote: t('«Без авантюр. Тримаємо м’яч, граємо просто.»'),
    note: t('Надійні рішення тренер оцінить вище; провал на ризику коштуватиме дорожче.') },
  press: { title: t('Тиснути'), quote: t('«Вони цього не чекають. Іди в обведення, бий, не озирайся.»'),
    note: t('Сміливі рішення тренер відзначить; кожен обережний хід — «просив же тиснути».') },
  free: { title: t('Вільна роль'), quote: t('«Роби що хочеш, але щоб у протоколі було твоє прізвище.»'),
    note: t('Тренер чекає голів і передач — і рахуватиме саме їх.') },
};

/** `tile` — речення, що пояснює саме заголовок (плейтест 31.10, Б-5): плитка показувала перше речення опису
 *  (настрій), а заголовок брався з утоми — «ВТОМЛЕНИЙ» над «Серія перемог — упевненості вистачає на двох». */
export function toneLines(c: MatchConditions): { title: string; tile: string } {
  const { confidence, fatigue } = c.tone;
  const form = confidence >= 2 ? t('Серія перемог — упевненості вистачає на двох.')
    : confidence === 1 ? t('Останні матчі радше вдалі, настрій робочий.')
    : confidence === 0 ? t('Форма рівна: ні куражу, ні тягаря.')
    : confidence === -1 ? t('Останні матчі не пішли, голова важча за ноги.')
    : t('Кілька поразок поспіль. Нерви на межі.');
  const legs = fatigue === 0 ? t('Після паузи — свіжий.')
    : fatigue === 1 ? t('Другий матч поспіль, ноги в нормі.')
    : fatigue === 2 ? t('Третій матч за десять днів — стартуєш не на повних.')
    : t('Четвертий матч поспіль. Сил на всі дев’яносто немає.');
  const tired = fatigue >= 2;
  const title = confidence > 0 && !tired ? t('На підйомі')
    : confidence < 0 && tired ? t('Вичавлений')
    : tired ? t('Втомлений') : confidence < 0 ? t('Пригнічений') : t('Рівний');
  return { title, tile: tired ? legs : form };
}

/** День туру: непарні — субота, парні — неділя. Без оператора остачі: тест шукає «%» у текстах. */
export const matchDay = (round: number) => ((round & 1) === 1 ? t('субота') : t('неділя'));
/** Вдома грають увечері, на виїзді — пізніше: різниця помітна в рядку матчдея. */
export const kickoffHour = (venue: MatchConditions['venue']) => (venue === 'home' ? 18 : 20);
export const matchTime = (venue: MatchConditions['venue']) => `${kickoffHour(venue)}:00`;

/** Захід сонця в місяці туру, години місцевого часу (середина місяця, наша широта, з літнім часом):
 *  серпень … травень за `season.ts:MONTHS`, квітень двічі. Стики — травень. */
const SUNSET = [20.2, 19.2, 18.1, 16.4, 15.9, 17.3, 18.1, 19.6, 19.9, 20.6];
/** Поле під прожекторами (M52, 19.10): якщо сонце сідає раніше, ніж за годину після свистка з афіші, —
 *  більша частина матчу йде при штучному світлі. Так поле показує той самий вечір, що надрукований на
 *  афіші: виїзд о 20:00 — завжди, домашній о 18:00 — з жовтня по березень. */
export const floodlit = (round: number, venue: MatchConditions['venue']) =>
  SUNSET[Math.max(0, Math.min(SUNSET.length - 1, round - 1))] < kickoffHour(venue) + 1;
