import type { MatchConditions } from '../engine/conditions';
import type { Player, VoiceKey } from '../engine/types';
import type { Career } from '../engine/career';
import type { Season } from '../engine/season';
import type { Opponent } from '../content';
import { SEASON_ROUNDS, monthOfRound } from '../engine/season';
import { Sticker } from './Sticker';
import { INSTRUCTION, WEATHER, toneLines } from './prematch-text';
import { plural } from './pluralize';
import { ord, t, tf } from '../content/i18n';

// Екран перед матчем (28.09, макет «Екран перед матчем», варіант А «Роздягальня»): один аркуш замість
// двох — меню кар'єри і брифінг злилися. Було: меню з карткою і турами, потім окремий екран зі станом.
//
// Порядок читання: **кого і де граєш → що сказав тренер → стан одним поглядом → дрібна проза**.
// Плитки форми, поля й погоди — єдине місце, де це видно, не вчитуючись: у рядках усе важило однаково
// і тому пролистувалося.
//
// **Що не дублюється з матчдеєм** (рішення 28.09): день і час лишилися тільки на афіші — Реєс квитка не
// купує. Суперник і «де граєш» навмисно є на обох: на цьому екрані це рішення, на афіші — те саме очима.
// Погода є на обох за правилом «факт / наслідок»: на афіші слово, тут — що воно зробить із силами.
//
// **Суперник і пам'ять — різні блоки**: риса суперника і його склад (Хантер) — довідка, торішні рахунки
// й колишній дублер — те, що пам'ятає Реєс. Склеєні в один абзац вони читалися так, ніби Хантер і є той
// молодий захисник (плейтест 28.09).

type Props = {
  conditions: MatchConditions;
  opponent: Opponent;
  player: Player;
  career: Career;
  season: Season;
  /** Тур (1-based) і місце в таблиці — положення в сезоні, якого на афіші немає. */
  round: number;
  position: number | null;
  points: number | null;
  /** Домінантний голос кар'єри — репліка під карткою (той самий стікер, що в меню). */
  dominant: VoiceKey | null;
  /** Стан прозою (engine/programme.ts: programmeNote) — минулий матч, серія, тиждень, статус у тренера. */
  note: string;
  /** Риса суперника голосом клубу. */
  trait: string | null;
  /** Іменний гравець у складі суперника (programme.ts:HUNTER). */
  guest?: string | null;
  /** Торішні рахунки з цим суперником. */
  lastYear?: { scoreUs: number; scoreThem: number; venue: 'home' | 'away' }[] | null;
  /** Колишній дублер у складі суперника. */
  subThere?: string | null;
  /** Слово тренера про мету клубу (programme.ts:coachGoalWord). */
  coachExtra?: string | null;
  onCard: () => void;
  onStart: () => void;
};

export function PrematchScreen({
  conditions, opponent, player, career, season, round, position, points, dominant,
  note, trait, guest, lastYear, subThere, coachExtra, onCard, onStart,
}: Props) {
  const instr = INSTRUCTION[conditions.instruction === 'none' ? 'free' : conditions.instruction];
  const tone = toneLines(conditions);
  const weather = WEATHER[conditions.weather];
  const home = conditions.venue === 'home';

  // Плитки: коротке слово згори, наслідок під ним. Довгі пояснення лишаються прозою нижче.
  const tiles: { label: string; value: string; note: string }[] = [
    { label: t('Форма'), value: tone.title, note: tone.note.split('.')[0] + '.' },
    { label: t('Поле'), value: home ? t('Вдома') : t('Виїзд'), note: home ? t('Трибуни за тебе.') : t('Свист замість підтримки.') },
    { label: t('Погода'), value: weather.title, note: weather.note },
  ];

  const about = [trait, guest].filter(Boolean).join(' ');
  const memory = [
    lastYear?.length ? tf('Торік: {0}.', lastYear.map((r) => tf('{0}:{1} {2}', r.scoreUs, r.scoreThem, r.venue === 'home' ? t('вдома') : t('на виїзді'))).join(', ')) : '',
    subThere ? tf('У їхній формі — {0}, торік ваш дублер.', subThere) : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="prematch">
      <div className="pm-head">
        <span>{t('Тур')} <b>{round}</b>{tf(' з {0} · {1}', SEASON_ROUNDS, monthOfRound(round))}</span>
        {position !== null && <span>{tf('{0} місце · {1} {2}', ord(position), points ?? 0, plural(points ?? 0, t('очко'), t('очки'), t('очок')))}</span>}
      </div>
      <h1 className="pm-fixture">{tf('«{0}»', opponent.name.nom)}<small>{home ? t('Вдома') : t('На виїзді')}</small></h1>

      <Sticker compact player={player} career={career} season={season} dominant={dominant} onOpen={onCard} />

      <div className="pm-coach">
        <b>{tf('Установка: {0}', instr.title.toLowerCase())}</b>
        <p className="pm-said">{instr.quote}</p>
        <p className="pm-means">{instr.note}{coachExtra ? ` ${coachExtra}` : ''}</p>
      </div>

      <dl className="pm-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="pm-tile">
            <dt>{t.label}</dt>
            <dd>{t.value}</dd>
            <p>{t.note}</p>
          </div>
        ))}
      </dl>

      <p className="pm-prose"><b>{t('Стан')}</b>{note}</p>
      {about && <p className="pm-prose"><b>{t('Суперник')}</b>{about}</p>}
      {memory && <p className="pm-prose"><b>{t('Пам’ять')}</b>{memory}</p>}

      <button className="primary menu-primary pm-cta" onClick={onStart}>{t('До матчу')}</button>
    </div>
  );
}
