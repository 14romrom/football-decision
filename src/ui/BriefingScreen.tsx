import type { MatchConditions } from '../engine/conditions';
import { signatureAttrs } from '../engine/conditions';
import type { Attribute, Player } from '../engine/types';
import type { Opponent } from '../content';

// Брифинг перед матчем: условия словами, без чисел. Каждая строка обещает
// эффект, который потом появится строкой модификатора после броска — это
// и есть способ проверить, что условия ощущаются, а не просто показываются.

const ATTR_GEN: Record<Attribute, string> = {
  finishing: 'удар', passing: 'пас', dribbling: 'дриблінг', first_touch: 'перший дотик',
  pace: 'швидкість', strength: 'боротьбу', stamina: 'витривалість',
  composure: 'спокій', vision: 'бачення поля', positioning: 'позиційну гру',
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

type Props = {
  conditions: MatchConditions; opponent: Opponent; player: Player;
  /** Наслідки недели (бирки) — на програмці уходят в заметку о Реєсе; здесь остаются как подпись мелко. */
  carryoverNote?: string;
  /** Тур (1-based), клуб-хозяин для шапки, заметка о Реєсе и черта соперника — считаются в App (engine/programme.ts). */
  round: number; usName: string; note: string; trait: string | null;
  onStart: () => void;
};

// Програмка (19.09, макет «Брифинг як програмка»): тот же брифинг, но лист бумаги в руке перед выходом —
// единственный светлый экран в игре. Рубрики: Реєс (заметка прозой), Суперник (+ черта голосом клуба),
// Стадіон, Погода, Форма, Слово тренера цитатой в рамке. Без иронии: програмку пишет пресс-служба.

export function BriefingScreen({ conditions, opponent, player, carryoverNote, round, usName, note, trait, onStart }: Props) {
  const sig = signatureAttrs(player).map((a) => ATTR_GEN[a]);
  const venue = conditions.venue === 'home'
    ? { title: 'Вдома', note: `Трибуни знають тебе і чекають ${sig[0]} та ${sig[1]}.` }
    : { title: 'Виїзд', note: 'Чужий стадіон: свист замість підтримки, а в кінцівці — особливо.' };
  const strength = opponent.strength === 'strong' ? 'Сильний суперник.' : opponent.strength === 'weak' ? 'Слабкий суперник.' : 'Рівний суперник.';
  const weather = WEATHER[conditions.weather];
  const instr = INSTRUCTION[conditions.instruction === 'none' ? 'free' : conditions.instruction];
  const tone = toneLines(conditions);
  const home = conditions.venue === 'home' ? usName : opponent.name.nom;
  const away = conditions.venue === 'home' ? opponent.name.nom : usName;
  const day = (round & 1) === 1 ? 'субота' : 'неділя';   // нечётные туры — субота; без оператора остатка (тест «никаких процентов»)
  const time = conditions.venue === 'home' ? '18:00' : '20:00';

  return (
    <div className="briefing">
      <div className="prog">
        <div className="prog-top"><span>Офіційна програмка</span><span>Тур {round} · {day}</span></div>
        <h1 className="prog-title">{home} — {away}<small>Стадіон «{home}» · початок о {time}</small></h1>
        <div className="prog-rule" />
        <dl className="prog-list">
          <dt>Реєс</dt><dd><b>№10.</b> {note} <a className="prog-link" href="#/player">Картка гравця</a></dd>
          <dt>Суперник</dt><dd><b>«{opponent.name.nom}»</b> — {opponent.blurb}. {strength}{trait && <> {trait}<span className="prog-warn">увага</span></>}</dd>
          <dt>Стадіон</dt><dd><b>{venue.title}.</b> {venue.note}</dd>
          <dt>Погода</dt><dd><b>{weather.title}.</b> {weather.note}</dd>
          <dt>Форма</dt><dd><b>{tone.title}.</b> {tone.note}</dd>
          <dd className="prog-quote"><b>Слово тренера · установка: {instr.title.toLowerCase()}</b>{instr.quote} {instr.note}</dd>
        </dl>
        <div className="prog-foot"><span>Безкоштовно · не для продажу</span><span>{carryoverNote ? carryoverNote.toLowerCase() : 'надруковано вчора'}</span></div>
      </div>
      <button className="primary prog-cta" onClick={onStart}>Вийти на поле</button>
    </div>
  );
}
