import { useState } from 'react';
import { BROKEN_SHARE, FAST_DECISION_MS, choiceDistribution, clearLogs, exportLogs, readLogs } from '../telemetry/log';
import { EPISODES } from '../content';
import { dec, t, tf } from '../content/i18n';

// Единственный экран, где проценты уместны: это доля выборов живых тестеров,
// а не вероятность исхода. Ради неё телеметрия и собирается (п. 10 ТЗ).
export function StatsScreen() {
  const [version, setVersion] = useState(0);
  const logs = readLogs();
  const dist = choiceDistribution(logs);
  const setups = new Map(EPISODES.map((e) => [e.id, e.setup]));

  return (
    <div className="stats-screen" key={version}>
      <h1>{t('Розподіл виборів')}</h1>
      <p className="muted">
        {tf('Рішень записано: {0}. Епізод вважається зламаним, якщо одна опція забирає більше {1}% виборів: отже, рішення уявне і епізод треба переписати.', logs.length, Math.round(BROKEN_SHARE * 100))}
      </p>

      {dist.length === 0 && <p className="muted">{t('Поки порожньо — зіграйте матч.')}</p>}

      {dist.map((e) => (
        <section key={e.episodeId} className={`ep-stats${e.broken ? ' broken' : ''}`}>
          <h2>
            {e.episodeId} <span className="muted">{tf('· {0} рішень', e.total)}</span>
            {e.broken && <span className="broken-badge">{t('рішення уявне')}</span>}
          </h2>
          <p className="muted setup-quote">{setups.get(e.episodeId)}</p>
          {e.options.map((o) => (
            <div key={o.optionId} className="share-row">
              <span className="share-label">{o.optionLabel}</span>
              <span className="share-track">
                <span
                  className={`share-fill${o.share > BROKEN_SHARE ? ' over' : ''}`}
                  style={{ width: `${o.share * 100}%` }}
                />
              </span>
              <span className="share-num">{Math.round(o.share * 100)}%</span>
              <span className="share-time">{tf('{0} с', dec(o.medianMs / 1000))}</span>
            </div>
          ))}
          {e.fastShare > 0.3 && (
            <p className="warn-line">
              {tf('{0}% рішень швидше за {1} с — тиснуть за звичкою, а не думають.', Math.round(e.fastShare * 100), FAST_DECISION_MS / 1000)}
            </p>
          )}
        </section>
      ))}

      <div className="actions">
        <a className="link" href="#/settings">{t('⟵ до налаштувань')}</a>
        <button onClick={exportLogs}>{t('Вивантажити логи')}</button>
        <button onClick={() => { clearLogs(); setVersion((v) => v + 1); }}>{t('Очистити')}</button>
      </div>
    </div>
  );
}
