import { isSeasonOver, ourRow, SEASON_ROUNDS, standings, US, type Season, type Verdict } from '../engine/season';
import { plural } from './pluralize';

// Экран сезона после каждого матча: таблица, наша строка, бомбардиры своих.
// В конце сезона — вердикт. Ставка между матчами — то, чего не хватало «игре на 15 минут».

type Props = {
  season: Season;
  clubName: (key: string) => string;
  /** Своя команда в родительном: «Бомбардири „Вальмари“». */
  teamGen: string;
  playerName: string;
  verdict?: Verdict;
  onNext: () => void;
  onNewSeason: () => void;
};

const ORDINAL = ['', '1-е', '2-е', '3-є', '4-е', '5-е', '6-е'];

export function SeasonScreen({ season, clubName, teamGen, playerName, verdict, onNext, onNewSeason }: Props) {
  const rows = standings(season);
  const us = ourRow(season);
  const over = isSeasonOver(season);
  const left = SEASON_ROUNDS - season.round;
  const p = season.player;
  const scorers = Object.entries(season.teamScorers).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="result season">
      <h1>Сезон {season.number} · тур {season.round} з {SEASON_ROUNDS}</h1>
      <p className="season-line">
        <b>{ORDINAL[us.position]} місце</b> · {us.points} {plural(us.points, 'очко', 'очки', 'очок')}
        {over ? ' · сезон завершено' : ` · до кінця ${left} ${plural(left, 'тур', 'тури', 'турів')}`}
      </p>

      <table className="table">
        <thead>
          <tr><th>#</th><th>клуб</th><th>І</th><th>В</th><th>Н</th><th>П</th><th>М</th><th>О</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.club} className={r.club === US ? 'us' : ''}>
              <td>{r.position}</td>
              <td>{clubName(r.club)}</td>
              <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td>
              <td>{r.goalsFor}:{r.goalsAgainst}</td>
              <td><b>{r.points}</b></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Строка сезона персонажа — протоколом, как когда-то итог матча (теперь его заменила дошка, BoardScreen). */}
      <p className="stat-line">
        <span className="stat-name">{playerName}</span>
        <span><b>{p.matches}</b> матчів</span>
        <span className={p.goals === 0 ? 'zero' : ''}><b>{p.goals}</b> голи</span>
        <span className={p.assists === 0 ? 'zero' : ''}><b>{p.assists}</b> передачі</span>
        <span><b>{p.matches ? (p.coachSum / p.matches).toFixed(1) : '—'}</b> сер. оцінка тренера</span>
      </p>
      {scorers.length > 0 && (
        <p className="muted small">
          Бомбардири «{teamGen}»: {scorers.map(([name, g]) => `${name} — ${g}`).join(', ')}
        </p>
      )}

      {verdict && (
        <section className="verdict">
          <h2>{verdict.title}</h2>
          <p>{verdict.text}</p>
        </section>
      )}

      <div className="actions">
        {over
          ? <button className="primary" onClick={onNewSeason}>Новий сезон</button>
          : <button className="primary" onClick={onNext}>Далі</button>}
      </div>
    </div>
  );
}
