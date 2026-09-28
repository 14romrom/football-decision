import type { MatchConditions } from '../engine/conditions';
import type { Opponent } from '../content';
import { leagueOf } from '../engine/season';
import { WEATHER, matchDay, matchTime } from './prematch-text';

// Матчдей (27.09, макет «Матчдей Вальмари», варіант А з ярликами на полі): останній екран перед виходом.
// Було — кремовий лист із сімома рубриками, де половина пояснювала гравцеві його ж рішення. Стало —
// афіша: підкладка на весь екран, плашка ліги й туру, два імені, смуга з деталями, кнопка. Усе, що
// пояснює рішення (установка, форма, стан, пам'ять про суперника), живе на екрані Реєса перед цим.
//
// Правила екрана:
// **Факт, не наслідок.** Погода тут одним словом; що вона зробить із дриблінгом — на екрані Реєса.
// **Господар завжди перший**, гість — врізкою на кремовій плашці; ролі підписані латиницею на лівому
// полі (`home` / `away`), як службові позначки друкаря поза набором.
// **Плашка ліги завжди кирпична** — вона спільна для всієї гри, на виїзді теж.
// **Друк видно**: растр, зерно, приводочні хрести по кутах, рамка на полі аркуша і водяний знак
// MATCHDAY за назвами. Латиниця тільки тут: це маркування видання, а не мова гри.
// Підкладки — `public/img/programme_home.webp` і `programme_away.webp` (tools/optimize-images.ts).

type Props = {
  conditions: MatchConditions;
  opponent: Opponent;
  /** Назва нашого клубу в називному. */
  usName: string;
  /** Тур (1-based) і сезон — плашка ліги. */
  round: number;
  seasonNumber: number;
  /** Стикові (M19): один матч за вихід — плашка каже про це, а не про тур. */
  playoff?: boolean;
  onStart: () => void;
  /** Починаєш на лаві — кнопка не обіцяє поле (плейтест 21.09). */
  onBench?: boolean;
};

export function MatchdayScreen({ conditions, opponent, usName, round, seasonNumber, playoff, onStart, onBench }: Props) {
  const home = conditions.venue === 'home';
  const hostName = home ? usName : opponent.name.nom;
  const guestName = home ? opponent.name.nom : usName;
  const stadium = hostName;
  const weather = WEATHER[conditions.weather].title.toLowerCase();
  // Довгі назви («Портубланко») інакше не влізають у рядок: кегль падає, переносу немає ніколи.
  const size = (name: string) => (name.length > 10 ? 'md-name long' : 'md-name');

  return (
    <div className="matchday">
      <img className="md-bg" src={`./img/programme_${home ? 'home' : 'away'}.webp`} alt="" decoding="async" />
      <div className="md-scrim" />
      <div className="md-print" />
      <div className="md-frame" />
      <span className="md-cross tl" /><span className="md-cross tr" /><span className="md-cross bl" /><span className="md-cross br" />

      <div className="md-body">
        <div><span className="md-plate">{leagueOf(seasonNumber).name} · {playoff ? 'стикові' : `тур ${round}`}</span></div>
        <div className="md-spacer" />

        <div className="md-clubs">
          <div className="md-mark" aria-hidden="true">Matchday</div>
          <div className="md-club">
            <span className="md-role">home</span>
            <div className={size(hostName)}>{hostName}</div>
          </div>
          <div className="md-club">
            <span className="md-role">away</span>
            <span className={`${size(guestName)} md-guest`}>{guestName}</span>
          </div>
        </div>

        <div className="md-bar">{matchDay(round)} · {matchTime(conditions.venue)} · стадіон «{stadium}» · {weather}</div>

        {/* Назви, водяний знак і смуга стоять посередині висоти: дві розпірки навколо них. Кнопка
            лишається внизу — до неї дотягується палець, і вона не частина афіші (рішення 28.09). */}
        <div className="md-spacer md-below" />
        <button className="primary md-cta" onClick={onStart}>{onBench ? 'На лаву' : 'Вийти на поле'}</button>
      </div>
    </div>
  );
}
