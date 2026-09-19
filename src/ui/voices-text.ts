import type { Attribute, VoiceKey } from '../engine/types';

// Тексты голосов — что стоит за каждым и его девиз. Одно место для картки, стикера, титула и «Про гру».
export const VOICES: { who: VoiceKey; attrs: Attribute[]; about: string; motto: string }[] = [
  { who: 'ego', attrs: [], about: 'Хоче м’яч. Хоче гол. Хоче, щоб бачили.', motto: 'Ти для цього тут.' },
  { who: 'team', attrs: [], about: 'Знає, де партнер. Іноді — раніше за тебе.', motto: 'Крім тебе — нікого. І нікого, крім них.' },
  { who: 'vision', attrs: ['vision', 'positioning'], about: 'Поле згори. Партнер відкритий за секунду до того, як відкриється.', motto: 'Не вискакуй. Подивись.' },
  { who: 'instinct', attrs: ['dribbling', 'first_touch'], about: 'Стопи, плечі, п’яти суперника. Знає, куди він піде, раніше за нього.', motto: 'Не думай. Він уже впав.' },
  { who: 'body', attrs: ['pace', 'strength'], about: 'Вага, ноги, дихання. Своє і чуже.', motto: 'Наступний стик — твій.' },
  { who: 'composure', attrs: ['composure'], about: 'Півсекунди, яких у інших немає.', motto: 'Є час. Завжди є час.' },
];
