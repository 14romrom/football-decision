import { leagueOf, ourRow, SEASON_ROUNDS, type Season } from '../engine/season';
import { pressLabel, type AdSet, type EspmColumn } from '../engine/espm';
import type { Career } from '../engine/career';
import type { Player } from '../engine/types';
import type { HistoryEntry } from '../telemetry/history';
import { Banner } from './SeasonScreen';
import { plural } from './pluralize';
import { t, tf } from '../content/i18n';

// Профіль гравця на ESPM (28.09, макет «Картка: було / стало») — друга половина листа персонажа.
// Правило поділу: **картка — це ти, профіль — це те, що про тебе знає місто**. Тому тут матчі, форма,
// бомбардири клубу, ярлик редакції і колонка, а характеристик немає: вони на картці, і дублювати їх
// у двох місцях означало б два джерела правди в очах гравця.
//
// Довіра тренера сюди не йде: її знає Реєс, а не місто (вона на екрані перед матчем).
// Це не новий «екран у екрані», а друга сторінка того самого сайту, що таблиця (SeasonScreen).
// Цифр, яких у грі немає, тут теж немає: ні віку, ні ноги, ні рангу по лізі — поіменних гравців у
// чужих клубах не існує, і вигаданий рейтинг зробив би сторінку брехливою.

const POSITION_LABEL: Record<Player['position'], string> = {
  AM: t('Атакувальний півзахисник'), CM: t('Центральний півзахисник'), ST: t('Нападник'), LW: t('Лівий вінгер'),
};
const RESULT_CLASS: Record<HistoryEntry['result'], string> = { W: 'w', D: 'd', L: 'l' };
const RESULT_LABEL: Record<HistoryEntry['result'], string> = { W: t('В'), D: t('Н'), L: t('П') };

const fmt = (n: number) => n.toFixed(1).replace('.', ',');

type Props = {
  player: Player;
  career: Career;
  season: Season | null;
  history: HistoryEntry[];
  /** Клуб у називному і родовому: «Вальмара» в шапці, «Бомбардири „Вальмари“» у віджеті. */
  club: string;
  clubGen: string;
  ads: AdSet;
  column?: EspmColumn;
  onBack: () => void;
};

export function EspmProfile({ player, career, season, history, club, clubGen, ads, column, onBack }: Props) {
  const league = leagueOf(season?.number ?? 1);
  const stats = season?.player;
  const scorers = Object.entries(season?.teamScorers ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const form = history.slice(-5);
  const wdl = history.reduce((acc, h) => { acc[h.result] += 1; return acc; }, { W: 0, D: 0, L: 0 });
  const row = season && season.round > 0 ? ourRow(season) : null;
  const press = pressLabel(career.useCounts);
  const last = career.lastSeason;

  return (
    <div className="result season">
      <div className="browser">
        <div className="chrome"><span className="chrome-tabs">3</span><span className="chrome-url"><b>espm.com</b>/football/players/reyes</span><span aria-hidden="true">⋮</span></div>
        <div className="espm">
          <div className="espm-mast"><span className="espm-logo"><b>ESPM</b><i>Футбол · {league.name}</i></span><span className="espm-burger" aria-hidden="true" /></div>
          <nav className="espm-nav"><span>{t('Головна')}</span><span>{t('Таблиця')}</span><span className="on">{t('Гравці')}</span><span>{t('Трансфери')}</span><span>{t('Відео')}</span></nav>
          <p className="espm-crumbs">Футбол › {league.name} › «{club}» › {player.name}</p>

          <div className="espm-phead">
            <img src="./img/portrait.webp" width="450" height="600" alt={player.name} decoding="async" />
            <div>
              <h1>{player.name}</h1>
              <p className="espm-pmeta">{POSITION_LABEL[player.position]} · 10 · «{club}»{row ? tf(' · {0}-е місце', row.position) : ''}</p>
              <span className="espm-label">{press.label}</span>
              <span className="espm-label-why">{press.why}. Ярлик редакції, не клубу.</span>
            </div>
          </div>

          <div className="espm-widget">
            <h4>Сезон {season?.number ?? 1} · {league.name}</h4>
            <table className="espm-tbl espm-own">
              <thead><tr><th>{t('Тур')}</th><th>{t('Матчі')}</th><th>{t('Голи')}</th><th>{t('Передачі')}</th><th>{t('Оцінка')}</th></tr></thead>
              <tbody>
                <tr className="us">
                  <td>{season ? tf('{0} з {1}', Math.min(season.round + 1, SEASON_ROUNDS), SEASON_ROUNDS) : '—'}</td>
                  <td>{stats?.matches ?? 0}</td>
                  <td>{stats?.goals ?? 0}</td>
                  <td>{stats?.assists ?? 0}</td>
                  <td>{stats && stats.matches ? fmt(stats.coachSum / stats.matches) : '—'}</td>
                </tr>
              </tbody>
            </table>
            <p className="espm-note">
              У кар’єрі — {career.matchesPlayed} {plural(career.matchesPlayed, t('матч'), t('матчі'), t('матчів'))}: {wdl.W} — {wdl.D} — {wdl.L}.
              {last ? tf(' Торік — {0}-е місце в {1}.', last.position, leagueOf(last.number).nameLoc) : ''}
            </p>
          </div>

          {form.length > 0 && (
            <div className="espm-widget">
              <h4>{t('Форма')}</h4>
              <div className="espm-form">
                {form.map((h, i) => (
                  <span key={`${h.at}-${i}`} className={RESULT_CLASS[h.result]}>{RESULT_LABEL[h.result]} {h.scoreUs}:{h.scoreThem}</span>
                ))}
              </div>
              <p className="espm-note">{t('Останні матчі, зліва — найстаріший.')}</p>
            </div>
          )}

          {scorers.length > 0 && (
            <div className="espm-widget">
              <h4>Бомбардири «{clubGen}»</h4>
              <p>{scorers.map(([name, g]) => `${name} — ${g}`).join(' · ')}</p>
              <p className="espm-note">{t('Тільки клуб: поіменної статистики по лізі сайт не веде.')}</p>
            </div>
          )}

          {column && (
            <div className="espm-col">
              <div className="espm-kicker">{column.kicker}</div>
              <h3>{column.title}</h3>
              <p>{column.text}</p>
              <div className="espm-by">{t('Редакція · сьогодні')}</div>
            </div>
          )}

          {ads.banners[0] && <Banner ad={ads.banners[0]} dark />}
        </div>
      </div>
      <button className="primary menu-primary" onClick={onBack}>{t('Назад до картки')}</button>
    </div>
  );
}
