import { BALANCE } from '../engine/balance';
import type { MatchSummary } from '../engine/match';
import type { Roster } from '../engine/names';
import { exportLogs } from '../telemetry/log';

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

type Props = { summary: MatchSummary; roster: Roster; playerName: string; xpEarned?: number; onRestart: () => void };

/** Протокол: «Реєс 63′, Кнапп 78′ — їхній ветеран 12′». Персонаж по фамилии рядом с партнёрами —
 *  плейтест 17.09: герой нигде не звучал, кроме брифинга. */
function protocol(summary: MatchSummary): string | null {
  if (summary.goals.length === 0) return null;
  const side = (s: 'us' | 'them') => summary.goals.filter((g) => g.side === s).map((g) => `${g.scorer} ${g.minute}′`).join(', ');
  const us = side('us');
  const them = side('them');
  return [us, them].filter(Boolean).join(' — ');
}

export function ResultScreen({ summary, roster, playerName, xpEarned, onRestart }: Props) {
  const gap = Math.abs(summary.coachRating - summary.fanRating);
  const low = Math.min(summary.coachRating, summary.fanRating);
  const goals = protocol(summary);

  return (
    <div className="result">
      <h1>{roster.us.name.nom} {summary.scoreUs}:{summary.scoreThem} {roster.them.name.nom}</h1>
      {goals && <p className="protocol">{goals}</p>}
      <p className="season-line"><b>{playerName}</b> · тренер {summary.coachRating.toFixed(1)} · трибуни {summary.fanRating.toFixed(1)}</p>

      <section className="stats">
        <Stat label="голи" value={summary.stats.goals} />
        <Stat label="передачі" value={summary.stats.assists} />
        <Stat label="ключові паси" value={summary.stats.keyPasses} />
        <Stat label="втрати" value={summary.stats.losses} />
        <Stat label="єдиноборства" value={summary.stats.duelsWon} />
        <Stat label="фоли" value={summary.stats.fouls} />
        <Stat label="сили наприкінці" value={summary.staminaLeft} />
      </section>

      <section className="recap">
        <h2>Як це було</h2>
        {summary.recap.map((line, i) => (
          <p key={i} className={i === summary.recap.length - 1 ? 'recap-last' : ''}>{line}</p>
        ))}
      </section>

      <section className="ratings">
        <div className="rating coach">
          <span className="rating-value">{summary.coachRating.toFixed(1)}</span>
          <span className="rating-label">оцінка тренера</span>
        </div>
        <div className="rating fan">
          <span className="rating-value">{summary.fanRating.toFixed(1)}</span>
          <span className="rating-label">оцінка трибун</span>
        </div>
      </section>
      {gap >= 1.5 && low < 6 && (
        <p className="gap-note">
          {summary.fanRating > summary.coachRating
            ? 'Трибуни йдуть задоволеними. Тренер — ні.'
            : 'Тренер задоволений. На трибунах позіхали.'}
        </p>
      )}
      {gap >= 1.5 && low >= 6 && (
        <p className="gap-note">Догодити обом одразу вдається рідко. Сьогодні вдалося.</p>
      )}

      {/* Уровни выключены (BALANCE.growth.levels) — опыт не показываем: цифра без последствий только путает. */}
      {BALANCE.growth.levels && xpEarned !== undefined && <p className="xp-earned">+{xpEarned} досвіду за матч</p>}

      <div className="actions">
        <button className="primary" onClick={onRestart}>Далі</button>
        <button onClick={exportLogs}>Вивантажити логи</button>
        <a className="link" href="#/stats">Розподіл виборів</a>
      </div>
    </div>
  );
}
