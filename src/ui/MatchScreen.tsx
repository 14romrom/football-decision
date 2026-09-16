import type { ReactNode } from 'react';
import type { MatchState, TimelineEvent } from '../engine/types';
import type { Roster } from '../engine/names';

/** Полоска ресурса без числа: игрок видит объём, а не значение. */
function Bar({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bar">
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <span className={`bar-fill ${tone ?? ''}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
    </div>
  );
}

function Momentum({ value }: { value: number }) {
  return (
    <div className="bar momentum">
      <span className="bar-label">інерція</span>
      <span className="momentum-dots">
        {[-3, -2, -1, 0, 1, 2, 3].map((i) => (
          <i key={i} className={
            `dot${i === 0 ? ' zero' : ''}`
            + (value > 0 && i > 0 && i <= value ? ' on plus' : '')
            + (value < 0 && i < 0 && i >= value ? ' on minus' : '')
          } />
        ))}
      </span>
    </div>
  );
}

export function MatchScreen({
  state, roster, shown, waiting, onSkip, children,
}: {
  state: MatchState;
  roster: Roster;
  shown: TimelineEvent[];
  waiting: boolean;
  onSkip: () => void;
  children: ReactNode;
}) {
  return (
    <div className="match">
      <header className="scoreboard">
        <span className="teams">{roster.us.name.nom} <b>{state.scoreUs}:{state.scoreThem}</b> {roster.them.name.nom}</span>
        <span className="minute">{state.minute}′</span>
      </header>

      <div className="resources">
        <Bar label="сили" value={state.stamina} tone={state.stamina < 30 ? 'low' : ''} />
        <Bar label="тренер" value={state.coachTrust} tone={state.coachTrust < 30 ? 'low' : ''} />
        <Bar label="трибуни" value={state.fanHype} tone="hype" />
        <Momentum value={state.momentum} />
      </div>

      {state.flags.length > 0 && (
        <div className="flags">
          {state.flags.includes('tired') && <span className="flag">ноги важкі</span>}
          {state.flags.includes('booked') && <span className="flag warn">жовта</span>}
          {state.flags.includes('injured') && <span className="flag warn">пошкодження</span>}
        </div>
      )}

      {state.coachTrust < 30 && (
        <p className="coach-warning">Тренер дедалі частіше поглядає на брівку — там уже розминаються.</p>
      )}

      <div className="feed">
        {shown.map((e, i) => (
          <div key={i} className={`event ${e.kind}`}>
            <span className="ev-minute">{e.minute}′</span>
            <span className="ev-text">
              {e.badges && e.badges.length > 0 && (
                <span className="ev-badges">
                  {e.badges.map((b) => (
                    <span key={b.label} className={`badge badge-${b.tone} badge-sm`} title={b.label}>{b.icon}</span>
                  ))}
                </span>
              )}
              {e.text}
            </span>
          </div>
        ))}
      </div>

      {waiting && (
        <button className="skip" onClick={onSkip}>далі ⟶</button>
      )}

      {children}
    </div>
  );
}
