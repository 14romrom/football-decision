import { useState } from 'react';
import type { MatchSession } from '../engine/match';

// Панель для нас, а не для игрока: сырые ресурсы и сид, чтобы воспроизвести матч.
// Вероятностей здесь нет намеренно — иначе соблазн подглядеть появится и у тестера.
export function DebugPanel({ session }: { session: MatchSession | null }) {
  const [open, setOpen] = useState(false);
  if (!session) return null;
  const s = session.state;

  return (
    <div className={`debug${open ? ' open' : ''}`}>
      <button className="debug-toggle" onClick={() => setOpen((v) => !v)}>debug</button>
      {open && (
        <dl>
          <div><dt>seed</dt><dd>{session.seed}</dd></div>
          <div><dt>minute</dt><dd>{s.minute}</dd></div>
          <div><dt>stamina</dt><dd>{s.stamina.toFixed(1)}</dd></div>
          <div><dt>composure</dt><dd>{Math.round(s.composureNow)}</dd></div>
          <div><dt>coachTrust</dt><dd>{Math.round(s.coachTrust)}</dd></div>
          <div><dt>fanHype</dt><dd>{Math.round(s.fanHype)}</dd></div>
          <div><dt>momentum</dt><dd>{s.momentum}</dd></div>
          <div><dt>flags</dt><dd>{s.flags.join(', ') || '—'}</dd></div>
          <div><dt>эпизоды</dt><dd>{session.nextIndex}/{session.schedule.length}</dd></div>
          <div><dt>расписание</dt><dd>{session.schedule.join(' ')}</dd></div>
        </dl>
      )}
    </div>
  );
}
