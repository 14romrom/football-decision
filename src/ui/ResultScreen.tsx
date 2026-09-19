import { BALANCE } from '../engine/balance';
import type { MatchSummary } from '../engine/match';
import type { Roster } from '../engine/names';

/** Строка протокола вместо плиток (19.09): семь одинаковых карточек с нулями читались как дашборд,
 *  а героем экрана должен быть пересказ «Як це було». Цифры — моноширинным, как табло на поле. */
function StatLine({ name, items }: { name: string; items: [string, number][] }) {
  return (
    <p className="stat-line">
      <span className="stat-name">{name}</span>
      {items.map(([label, value]) => (
        <span key={label} className={value === 0 ? 'zero' : ''}><b>{value}</b> {label}</span>
      ))}
    </p>
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
      {/* Оценки — только в плитках ниже и в вердикте пересказа: три повтора одной цифры на экране — перебор. */}
      <StatLine name={playerName} items={[
        ['голи', summary.stats.goals], ['передачі', summary.stats.assists], ['ключові', summary.stats.keyPasses],
        ['втрати', summary.stats.losses], ['єдиноборства', summary.stats.duelsWon], ['фоли', summary.stats.fouls],
        ['сил наприкінці', summary.staminaLeft],
      ]} />

      <section className="recap">
        <h2>Як це було</h2>
        {summary.recap.map((line, i) => (
          <p key={i} className={i === summary.recap.length - 1 ? 'recap-last' : ''}>{line}</p>
        ))}
      </section>

      <section className="ratings">
        <div className="rating coach">
          <span className="rating-value">{summary.coachRating.toFixed(1)}</span>
          <span className="rating-label">тренер</span>
        </div>
        <div className="rating fan">
          <span className="rating-value">{summary.fanRating.toFixed(1)}</span>
          <span className="rating-label">трибуни</span>
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
        {/* «Вивантажити логи» переехала в Налаштування (19.09): на итоге матча она мешала. */}
        <a className="link" href="#/stats">Розподіл виборів</a>
      </div>
    </div>
  );
}
