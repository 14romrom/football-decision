import type { MatchSummary } from '../engine/match';
import { TEAM_THEM, TEAM_US } from '../engine/match';
import { exportLogs } from '../telemetry/log';

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export function ResultScreen({ summary, onRestart }: { summary: MatchSummary; onRestart: () => void }) {
  const gap = Math.abs(summary.coachRating - summary.fanRating);
  const low = Math.min(summary.coachRating, summary.fanRating);

  return (
    <div className="result">
      <h1>{TEAM_US} {summary.scoreUs}:{summary.scoreThem} {TEAM_THEM}</h1>

      <section className="stats">
        <Stat label="голы" value={summary.stats.goals} />
        <Stat label="передачи" value={summary.stats.assists} />
        <Stat label="ключевые пасы" value={summary.stats.keyPasses} />
        <Stat label="потери" value={summary.stats.losses} />
        <Stat label="единоборства" value={summary.stats.duelsWon} />
        <Stat label="фолы" value={summary.stats.fouls} />
        <Stat label="силы в конце" value={summary.staminaLeft} />
      </section>

      <section className="recap">
        <h2>Как это было</h2>
        {summary.recap.map((line, i) => (
          <p key={i} className={i === summary.recap.length - 1 ? 'recap-last' : ''}>{line}</p>
        ))}
      </section>

      <section className="ratings">
        <div className="rating coach">
          <span className="rating-value">{summary.coachRating.toFixed(1)}</span>
          <span className="rating-label">оценка тренера</span>
        </div>
        <div className="rating fan">
          <span className="rating-value">{summary.fanRating.toFixed(1)}</span>
          <span className="rating-label">оценка трибун</span>
        </div>
      </section>
      {gap >= 1.5 && low < 6 && (
        <p className="gap-note">
          {summary.fanRating > summary.coachRating
            ? 'Трибуны уходят довольными. Тренер — нет.'
            : 'Тренер доволен. На трибунах зевали.'}
        </p>
      )}
      {gap >= 1.5 && low >= 6 && (
        <p className="gap-note">Угодить обоим сразу получается редко. Сегодня получилось.</p>
      )}

      <div className="actions">
        <button className="primary" onClick={onRestart}>Ещё матч</button>
        <button onClick={exportLogs}>Выгрузить логи</button>
        <a className="link" href="#/stats">Распределение выборов</a>
      </div>
    </div>
  );
}
