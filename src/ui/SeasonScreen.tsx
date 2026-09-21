import { useState } from 'react';
import { isSeasonOver, SEASON_ROUNDS, standings, US, type Season, type Verdict } from '../engine/season';
import { plural } from './pluralize';
import type { AdRule, AdSet, ClubName } from '../engine/espm';
import { playerLine, roundHeadline, type EspmColumn } from '../engine/espm';

// Экран сезона = сторінка таблиці на сайті ESPM (19.09, макет «Таблиця: ESPM», решение пользователя):
// рамка браузера с адресом делает страницу предметом; сама страница — светлый экран с чужой
// типографикой (Roboto Condensed + системный sans, не Lora/Oswald игры). Оммаж на известное издание:
// красный прямоугольный логотип латиницей. Заголовок тура — из данных (engine/espm.ts). Ирония над
// сайтом — пейвол «ESPM+» над «Аналітикою» (там ничего нужного) и cookies «Як і всі»; ниже сгиба —
// абсурдная реклама в форматах настоящей (content/ads.json). Вердикт сезона — блок под таблицей, как
// был, не трогаем. Это единственный «экран в экране» в игре.

type Props = {
  season: Season;
  club: (key: string) => ClubName;
  playerName: string;
  /** Родовий для підзаголовка («Дубль Реєса»). */
  playerGen: string;
  ads: AdSet;
  verdict?: Verdict;
  /** Колонка видання про Реєса за станом арки (M13, espm.ts:playerColumn); без неї — як раніше. */
  column?: EspmColumn;
  onNext: () => void;
  onNewSeason: () => void;
};

const fmt = (n: number) => n.toFixed(1).replace('.', ',');

function Banner({ ad, dark }: { ad: AdRule; dark?: boolean }) {
  return (
    <div className="espm-ad">
      <div className="espm-ad-tag">Реклама</div>
      <div className={`espm-banner ${dark ? 'dark' : ''}`}><div><div className="t">{ad.title}</div><div className="d">{ad.text}</div></div><span className="cta">{ad.cta}</span></div>
    </div>
  );
}

export function SeasonScreen({ season, club, playerName, playerGen, ads, verdict, column, onNext, onNewSeason }: Props) {
  const rows = standings(season);
  const over = isSeasonOver(season);
  const p = season.player;
  const scorers = Object.entries(season.teamScorers).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const [cookies, setCookies] = useState(true);
  const usGen = club(US).gen;

  return (
    <div className="result season">
      <div className="browser">
        <div className="chrome"><span className="chrome-tabs">3</span><span className="chrome-url"><b>espm.com</b>/football/liga/table</span><span aria-hidden="true">⋮</span></div>
        <div className="espm">
          <div className="espm-mast"><span className="espm-logo"><b>ESPM</b><i>Футбол · Ліга</i></span><span className="espm-burger" aria-hidden="true" /></div>
          <nav className="espm-nav"><span>Головна</span><span className="on">Таблиця</span><span>Результати</span><span>Трансфери</span><span>Відео</span></nav>

          <div className="espm-art">
            <div className="espm-kicker">Тур {season.round} з {SEASON_ROUNDS} · підсумки</div>
            <h1 className="espm-hl">{roundHeadline(season, club)}</h1>
            {(() => { const l = playerLine(season.rounds?.[season.rounds.length - 1], { nom: playerName, gen: playerGen }); return l ? <p className="espm-dek">{l}</p> : null; })()}
            <div className="espm-by">Редакція · 2 год тому</div>
            <table className="espm-tbl">
              <thead><tr><th>#</th><th>Клуб</th><th>І</th><th>В</th><th>Н</th><th>П</th><th>М</th><th>О</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.club} className={r.club === US ? 'us' : ''}>
                    <td>{r.position}</td><td>{club(r.club).nom}</td>
                    <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td>
                    <td>{r.goalsFor}:{r.goalsAgainst}</td><td>{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {scorers.length > 0 && (
            <div className="espm-widget"><h4>Бомбардири «{usGen}»</h4><p>{scorers.map(([name, g]) => `${name} — ${g}`).join(' · ')}</p></div>
          )}
          <div className="espm-widget">
            <h4>{playerName} за сезон</h4>
            <p><span className="num">{p.matches}</span>{plural(p.matches, 'матч', 'матчі', 'матчів')} · <span className="num">{p.goals}</span>{plural(p.goals, 'гол', 'голи', 'голів')} · <span className="num">{p.assists}</span>{plural(p.assists, 'передача', 'передачі', 'передач')} · оцінка {p.matches ? fmt(p.coachSum / p.matches) : '—'}</p>
          </div>

          {column && (
            <div className="espm-col">
              <div className="espm-kicker">{column.kicker}</div>
              <h3>{column.title}</h3>
              <p>{column.text}</p>
              <div className="espm-by">Редакція · сьогодні</div>
            </div>
          )}

          {ads.banners[0] && <Banner ad={ads.banners[0]} dark />}

          <div className="espm-pay">
            <div className="espm-kicker">Аналітика</div>
            <p className="blur">Чому «{club(US).nom}» грає саме так і до чого тут десятка. Наш оглядач порахував усе і не повірив.</p>
            <p className="blur">Три графіки, які пояснюють усе. Або нічого.</p>
            <div className="gate"><span>Читати з передплатою</span></div>
          </div>

          {ads.reco.length > 0 && (
            <div className="espm-ad"><div className="espm-ad-tag">Вам сподобається</div>
              <div className="espm-reco">
                {ads.reco.map((ad) => <div key={ad.id}><div className="pic">{ad.mark}</div>{ad.text}<small>{ad.tag}</small></div>)}
              </div>
            </div>
          )}
          {ads.banners[1] && <Banner ad={ads.banners[1]} />}
          {ads.classified.length > 0 && (
            <div className="espm-ad"><div className="espm-ad-tag">Оголошення</div>
              {ads.classified.map((ad) => <div key={ad.id} className="espm-classified">{ad.text} — <i>{ad.sign}</i></div>)}
            </div>
          )}

          {cookies && (
            <div className="espm-cookie">Цей сайт використовує cookies. Як і всі.<button type="button" onClick={() => setCookies(false)}>Добре</button></div>
          )}
        </div>
      </div>

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
