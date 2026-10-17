import { Fragment } from 'react';
import { CHAPTERS, EPISODES, ROSTER, clubName } from '../content';
import { BALANCE } from '../engine/balance';
import { fillNames } from '../engine/names';
import {
  PLAYOFF_SPOTS, PROMOTION_SPOTS, SEASON_ROUNDS, US, WINTER_BREAK_AFTER,
  leagueOf, monthOfRound, standings, type OurResult, type Season,
} from '../engine/season';
import type { Career } from '../engine/career';
import { currentChapter } from './ChapterHead';
import { t, tf } from '../content/i18n';

// Екран «Сезон» (17.10, макет «Пауза, сезон і головне меню»). До нього таблицю можна було побачити
// тільки після матчу на ESPM, а календаря не було ніде: перед матчем гравець не знав, скільки
// лишилося до стикових. Тут — свій погляд, не сайт: таблиця з зонами, десять турів і де ти у двох
// сезонах. Відкривається з паузи на місці, тож у матчі його можна подивитися, не виходячи з матчу.
//
// Нового тексту немає: під кожним зіграним туром — момент, який гра вже зберегла для стрічки
// (`OurResult.moments`). Після перемоги — найкращий, після поразки — найгірший, після нічиї — той,
// що є. Цифр, крім рахунку й очок, немає — правило «ніяких відсотків» тест перевіряє й тут.

type Props = { season: Season; career: Career; onBack: () => void };

const ours = (season: Season, round: number) =>
  season.fixtures.find((f) => f.round === round && (f.home === US || f.away === US));

const nameOf = (key: string) => (key === US ? ROSTER.us.name.nom : clubName(key).nom);

type StoredMoment = NonNullable<NonNullable<OurResult['moments']>['best']> & { episodeId?: string; optionId?: string };

/** Текст моменту мовою, якою гра йде зараз. У збереженні він лежить мовою, якою матч зіграно, — тому
 *  беремо його зі сцени за id (вони збережені поруч), а збережений лишається запасним: сцену могли
 *  прибрати з пулу. */
function momentText(m: StoredMoment): { past: string; recap: string } {
  const opt = m.episodeId ? EPISODES.find((e) => e.id === m.episodeId)?.options.find((o) => o.id === m.optionId) : undefined;
  const out = opt?.outcomes[m.tier as keyof typeof opt.outcomes];
  return opt && out?.recap ? { past: opt.past, recap: out.recap } : { past: m.past, recap: m.recap };
}

/** Момент туру для рядка календаря — той, що пасує до результату. Розминка на лаві моментом матчу не
 *  вважається: «розминався спокійно» під рахунком читається як знущання. */
function momentLine(r: OurResult): string | null {
  const ms = r.moments ?? {};
  const order = r.scoreUs > r.scoreThem ? [ms.best, ms.worst] : r.scoreUs < r.scoreThem ? [ms.worst, ms.best] : [ms.best, ms.worst];
  const m = order.find((x): x is StoredMoment => !!x && (x as StoredMoment).episodeId !== BALANCE.bench.callEpisode);
  if (!m) return null;
  const { past, recap } = momentText(m);
  return tf('{0}′ {1} — {2}', m.minute, fillNames(past, ROSTER), fillNames(recap, ROSTER).replace(/[.]$/, ''));
}

export function SeasonOverview({ season, career, onBack }: Props) {
  const table = standings(season);
  const league = leagueOf(season.number);
  // Зони — лише в першому сезоні: там мета клубу оголошена (двоє нагору, третє й четверте — стикові).
  const zones = season.number === 1;
  const here = currentChapter(career, season).id;
  const hereIndex = CHAPTERS.findIndex((c) => c.id === here);

  return (
    <div className="season-ov plain-screen">
      <button className="back-link" onClick={onBack}>{t('Пауза')}</button>
      <h1 className="ov-title">{tf('Сезон {0} · {1}', season.number, league.name)}</h1>
      {zones && <p className="ov-sub">{t('двоє нагору, третє й четверте — стикові')}</p>}

      <ol className="ov-ladder" aria-label={t('Глави')}>
        {CHAPTERS.map((c, i) => (
          <li key={c.id} className={i < hereIndex ? 'done' : i === hereIndex ? 'here' : ''}>{c.rom || c.title}</li>
        ))}
      </ol>
      <div className="ov-months" aria-hidden="true">
        {Array.from({ length: SEASON_ROUNDS }, (_, i) => (
          <i key={i} className={`${i < season.round ? 'done' : i === season.round ? 'now' : ''}${i === WINTER_BREAK_AFTER ? ' gap' : ''}`} />
        ))}
      </div>
      <div className="ov-mlbl" aria-hidden="true"><span>{monthOfRound(1)}</span><span>{t('зимова перерва')}</span><span>{monthOfRound(SEASON_ROUNDS)}</span></div>

      <table className="ov-tbl">
        <thead><tr><th /><th /><th>{t('І')}</th><th>{t('О')}</th></tr></thead>
        <tbody>
          {table.map((r) => {
            const zone = !zones ? '' : r.position <= PROMOTION_SPOTS ? 'up' : PLAYOFF_SPOTS.includes(r.position) ? 'po' : '';
            return (
              <tr key={r.club} className={r.club === US ? 'us' : ''}>
                <td className="n">{r.position}</td>
                <td><i className={`zone ${zone}`} />{nameOf(r.club)}</td>
                <td className="c">{r.played}</td>
                <td className="p">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 className="ov-sec">{t('Календар')}</h2>
      <ol className="ov-cal">
        {Array.from({ length: SEASON_ROUNDS }, (_, i) => {
          const f = ours(season, i);
          if (!f) return null;
          const home = f.home === US;
          const opp = nameOf(home ? f.away : f.home);
          const r = season.rounds?.[i];
          const res = r ? (r.scoreUs > r.scoreThem ? 'w' : r.scoreUs < r.scoreThem ? 'l' : 'd') : '';
          const line = r ? momentLine(r) : null;
          return (<Fragment key={i}>
            {i === WINTER_BREAK_AFTER && <li className="winter">{t('зимова перерва')}</li>}
            <li className={r ? 'played' : i === season.round ? 'next' : 'future'}>
              <span className="when">{i + 1} · {monthOfRound(i + 1)}<br />{home ? t('вдома') : t('виїзд')}</span>
              <span className="opp">{opp}</span>
              <span className={`res ${res}`}>{r ? `${r.scoreUs}:${r.scoreThem}` : i === season.round ? t('наступний') : ''}</span>
              {line && <span className="mo">{line}</span>}
            </li>
          </Fragment>);
        })}
        {season.playoff && (
          <li className={season.playoff.result ? 'played' : 'next'}>
            <span className="when">{t('стикові')}<br />{season.playoff.venue === 'home' ? t('вдома') : t('виїзд')}</span>
            <span className="opp">{nameOf(season.playoff.opponent)}</span>
            <span className="res">{season.playoff.result ? `${season.playoff.result.scoreUs}:${season.playoff.result.scoreThem}` : t('наступний')}</span>
          </li>
        )}
      </ol>
    </div>
  );
}
