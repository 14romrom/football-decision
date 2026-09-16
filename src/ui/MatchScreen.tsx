import type { ReactNode } from 'react';
import type { MatchState, TimelineEvent } from '../engine/types';
import { TEAM_THEM, TEAM_US } from '../engine/match';

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
      <span className="bar-label">инерция</span>
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
  state, shown, waiting, onSkip, children,
}: {
  state: MatchState;
  shown: TimelineEvent[];
  waiting: boolean;
  onSkip: () => void;
  children: ReactNode;
}) {
  return (
    <div className="match">
      <header className="scoreboard">
        <span className="teams">{TEAM_US} <b>{state.scoreUs}:{state.scoreThem}</b> {TEAM_THEM}</span>
        <span className="minute">{state.minute}′</span>
      </header>

      <div className="resources">
        <Bar label="силы" value={state.stamina} tone={state.stamina < 30 ? 'low' : ''} />
        <Bar label="тренер" value={state.coachTrust} tone={state.coachTrust < 30 ? 'low' : ''} />
        <Bar label="трибуны" value={state.fanHype} tone="hype" />
        <Momentum value={state.momentum} />
      </div>

      {state.flags.length > 0 && (
        <div className="flags">
          {state.flags.includes('tired') && <span className="flag">ноги тяжёлые</span>}
          {state.flags.includes('booked') && <span className="flag warn">жёлтая</span>}
          {state.flags.includes('injured') && <span className="flag warn">повреждение</span>}
        </div>
      )}

      {state.coachTrust < 30 && (
        <p className="coach-warning">Тренер всё чаще поглядывает на бровку — там уже разминаются.</p>
      )}

      <div className="feed">
        {shown.map((e, i) => (
          <div key={i} className={`event ${e.kind}`}>
            <span className="ev-minute">{e.minute}′</span>
            <span className="ev-text">{e.text}</span>
          </div>
        ))}
      </div>

      {waiting && (
        <button className="skip" onClick={onSkip}>дальше ⟶</button>
      )}

      {children}
    </div>
  );
}
