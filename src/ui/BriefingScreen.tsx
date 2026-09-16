import type { MatchConditions } from '../engine/conditions';
import { signatureAttrs } from '../engine/conditions';
import { attrMod } from '../engine/context';
import { ATTRIBUTE_LABEL } from '../engine/types';
import type { Attribute, Player } from '../engine/types';
import type { Opponent } from '../content';

// Брифинг перед матчем: условия словами, без чисел. Каждая строка обещает
// эффект, который потом появится строкой модификатора после броска — это
// и есть способ проверить, что условия ощущаются, а не просто показываются.

const ATTR_GEN: Record<Attribute, string> = {
  finishing: 'удар', passing: 'пас', dribbling: 'дриблінг', first_touch: 'перший дотик',
  pace: 'швидкість', strength: 'боротьбу', stamina: 'витривалість',
  composure: 'холоднокровність', vision: 'бачення поля', positioning: 'позиційну гру',
};

const WEATHER: Record<MatchConditions['weather'], { title: string; note: string }> = {
  clear: { title: 'Ясно', note: 'Газон сухий, м’яч слухається.' },
  rain: { title: 'Дощ', note: 'Мокрий газон — дриблінг і паси менш надійні.' },
  heat: { title: 'Спека', note: 'Сили йтимуть швидше, ніж зазвичай.' },
  wind: { title: 'Вітер', note: 'Удари здалеку і подачі зі стандартів гірше слухаються.' },
};

const INSTRUCTION: Record<Exclude<MatchConditions['instruction'], 'none'>, { title: string; quote: string; note: string }> = {
  hold: { title: 'На результат', quote: '«Без авантюр. Тримаємо м’яч, граємо просто.»',
    note: 'Надійні рішення тренер оцінить вище; провал на ризику коштуватиме дорожче.' },
  press: { title: 'Тиснути', quote: '«Вони цього не чекають. Іди в обведення, бий, не озирайся.»',
    note: 'Сміливі рішення тренер відзначить; кожен обережний хід — «просив же тиснути».' },
  free: { title: 'Вільна роль', quote: '«Роби що хочеш, але щоб у протоколі було твоє прізвище.»',
    note: 'Тренер чекає голів і передач — і рахуватиме саме їх.' },
};

function toneLines(c: MatchConditions): { title: string; note: string } {
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

function weakestLine(player: Player): string {
  const keys = Object.keys(player.attrs) as Attribute[];
  return keys.sort((a, b) => player.attrs[a] - player.attrs[b]).slice(0, 2)
    .map((a) => `${ATTRIBUTE_LABEL[a]} +${attrMod(player.attrs[a])}`).join(', ');
}

type Props = { conditions: MatchConditions; opponent: Opponent; player: Player; carryoverNote?: string; onStart: () => void };

export function BriefingScreen({ conditions, opponent, player, carryoverNote, onStart }: Props) {
  const sig = signatureAttrs(player).map((a) => ATTR_GEN[a]);
  const venue = conditions.venue === 'home'
    ? { title: 'Вдома', note: `Трибуни знають тебе і чекають ${sig[0]} та ${sig[1]} — саме за це тут люблять.` }
    : { title: 'Виїзд', note: 'Чужий стадіон: свист замість підтримки, а в кінцівці — особливо.' };
  const strength = opponent.strength === 'strong' ? 'Сильний суперник — кожне рішення дається важче.'
    : opponent.strength === 'weak' ? 'Слабкий суперник — простір є, і його треба брати.'
    : 'Рівний суперник.';
  const weather = WEATHER[conditions.weather];
  const instr = INSTRUCTION[conditions.instruction === 'none' ? 'free' : conditions.instruction];
  const tone = toneLines(conditions);

  return (
    <div className="briefing">
      <h1>Перед матчем</h1>
      <dl className="conditions">
        <div><dt>Ти</dt><dd>
          <b>{player.name}.</b> {signatureAttrs(player).map((a) => `${ATTRIBUTE_LABEL[a]} +${attrMod(player.attrs[a])}`).join(', ')} —
          твоє; {weakestLine(player)} — ні. <a className="link" href="#/player">Картка</a>
        </dd></div>
        <div><dt>Суперник</dt><dd><b>«{opponent.name.nom}»</b> — {opponent.blurb}. {strength}</dd></div>
        <div><dt>Стадіон</dt><dd><b>{venue.title}.</b> {venue.note}</dd></div>
        <div><dt>Погода</dt><dd><b>{weather.title}.</b> {weather.note}</dd></div>
        <div><dt>Тренер</dt><dd><b>{instr.title}.</b> {instr.quote} {instr.note}</dd></div>
        <div><dt>Тонус</dt><dd><b>{tone.title}.</b> {tone.note}</dd></div>
        {carryoverNote && <div><dt>Наслідки</dt><dd>{carryoverNote}</dd></div>}
      </dl>
      <button className="primary" onClick={onStart}>Вийти на поле</button>
    </div>
  );
}
