import { useState } from 'react';
import { isSeasonOver, leagueOf, monthOfRound, SEASON_ROUNDS, standings, US, type Season, type Verdict, PLAYOFF_SPOTS, PROMOTION_SPOTS } from '../engine/season';
import { plural } from './pluralize';
import type { AdRule, AdSet, ClubName } from '../engine/espm';
import { playerLine, roundHeadline, type EspmColumn } from '../engine/espm';
import { dec, t, tf } from '../content/i18n';

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
  /** Після другого сезону — не «Новий сезон», а «Далі» (M16). */
  nextLabel?: string;
};

const fmt = (n: number) => dec(n);

/** Рекламный блок страницы — общий с профилем игрока (ui/EspmProfile.tsx): формат один и тот же. */
export function Banner({ ad, dark }: { ad: AdRule; dark?: boolean }) {
  return (
    <div className="espm-ad">
      <div className="espm-ad-tag">{t('Реклама')}</div>
      <div className={`espm-banner ${dark ? 'dark' : ''}`}><div><div className="t">{ad.title}</div><div className="d">{ad.text}</div></div><span className="cta">{ad.cta}</span></div>
    </div>
  );
}

export function SeasonScreen({ season, club, playerName, playerGen, ads, verdict, column, onNext, onNewSeason, nextLabel = t('Новий сезон') }: Props) {
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
          <div className="espm-mast"><span className="espm-logo"><b>ESPM</b><i>{tf('Футбол · {0}', leagueOf(season.number).name)}</i></span><span className="espm-burger" aria-hidden="true" /></div>
          <nav className="espm-nav"><span>{t('Головна')}</span><span className="on">{t('Таблиця')}</span><span>{t('Результати')}</span><span>{t('Трансфери')}</span><span>{t('Відео')}</span></nav>

          <div className="espm-art">
            <div className="espm-kicker">{over ? tf('Підсумки сезону · {0}', leagueOf(season.number).name) : tf('Тур {0} з {1} · {2}', season.round, SEASON_ROUNDS, monthOfRound(season.round))}</div>
            <h1 className="espm-hl">{roundHeadline(season, club)}</h1>
            {(() => { const l = playerLine(season.rounds?.[season.rounds.length - 1], { nom: playerName, gen: playerGen }); return l ? <p className="espm-dek">{l}</p> : null; })()}
            <div className="espm-by">{t('Редакція · 2 год тому')}</div>
            <table className="espm-tbl">
              <thead><tr><th>#</th><th>{t('Клуб')}</th><th>{t('І')}</th><th>{t('В')}</th><th>{t('Н')}</th><th>{t('П')}</th><th>{t('М')}</th><th>{t('О')}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  // Зони регламенту (M19): двоє прямо нагору, третє-четверте — стикові. Тільки перший сезон.
                  <tr key={r.club} className={[r.club === US ? 'us' : '', season.number === 1 && r.position <= PROMOTION_SPOTS ? 'zone-up' : '', season.number === 1 && PLAYOFF_SPOTS.includes(r.position) ? 'zone-po' : ''].filter(Boolean).join(' ')}>
                    <td>{r.position}</td><td>{club(r.club).nom}</td>
                    <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td>
                    <td>{r.goalsFor}:{r.goalsAgainst}</td><td>{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {season.number === 1 && <p className="espm-rule">{t('Регламент: нагору виходять двоє; третє і четверте грають стикові — один матч, переможець третій.')}</p>}
          </div>

          {scorers.length > 0 && (
            <div className="espm-widget"><h4>{tf('Бомбардири «{0}»', usGen)}</h4><p>{scorers.map(([name, g]) => `${name} — ${g}`).join(' · ')}</p></div>
          )}
          <div className="espm-widget">
            <h4>{tf('{0} за сезон', playerName)}</h4>
            <p><span className="num">{p.matches}</span>{plural(p.matches, t('матч'), t('матчі'), t('матчів'))} · <span className="num">{p.goals}</span>{plural(p.goals, t('гол'), t('голи'), t('голів'))} · <span className="num">{p.assists}</span>{plural(p.assists, t('передача'), t('передачі'), t('передач'))} · {tf('оцінка {0}', p.matches ? fmt(p.coachSum / p.matches) : '—')}</p>
          </div>

          {column && (
            <div className="espm-col">
              <div className="espm-kicker">{column.kicker}</div>
              <h3>{column.title}</h3>
              <p>{column.text}</p>
              <div className="espm-by">{t('Редакція · сьогодні')}</div>
            </div>
          )}

          {ads.banners[0] && <Banner ad={ads.banners[0]} dark />}

          <div className="espm-pay">
            <div className="espm-kicker">{t('Аналітика')}</div>
            <p className="blur">{tf('Чому «{0}» грає саме так і до чого тут десятка. Наш оглядач порахував усе і не повірив.', club(US).nom)}</p>
            <p className="blur">{t('Три графіки, які пояснюють усе. Або нічого.')}</p>
            <div className="gate"><span>{t('Читати з передплатою')}</span></div>
          </div>

          {ads.reco.length > 0 && (
            <div className="espm-ad"><div className="espm-ad-tag">{t('Вам сподобається')}</div>
              <div className="espm-reco">
                {ads.reco.map((ad) => <div key={ad.id}><div className="pic">{ad.mark}</div>{ad.text}<small>{ad.tag}</small></div>)}
              </div>
            </div>
          )}
          {ads.banners[1] && <Banner ad={ads.banners[1]} />}
          {ads.classified.length > 0 && (
            <div className="espm-ad"><div className="espm-ad-tag">{t('Оголошення')}</div>
              {ads.classified.map((ad) => <div key={ad.id} className="espm-classified">{ad.text} — <i>{ad.sign}</i></div>)}
            </div>
          )}

          {cookies && (
            <div className="espm-cookie">{t('Цей сайт використовує cookies. Як і всі.')}<button type="button" onClick={() => setCookies(false)}>{t('Добре')}</button></div>
          )}
        </div>
      </div>

      {verdict && (
        <section className="verdict">
          <h2>{verdict.title}</h2>
          <p>{verdict.text}</p>
        </section>
      )}

      {/* Кнопка прилипає до низу, як на решті екранів (22.09, плейтест: до «Далі» доводилось гортати всю рекламу). */}
      {over
        ? <button className="primary menu-primary" onClick={onNewSeason}>{nextLabel}</button>
        : <button className="primary menu-primary" onClick={onNext}>{t('Далі')}</button>}
    </div>
  );
}
