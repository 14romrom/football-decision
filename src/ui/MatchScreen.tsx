import { useState, type ReactNode } from 'react';
import type { Episode, FlagRule, MatchState, ModLine, Player, TimelineEvent } from '../engine/types';
import type { Roster } from '../engine/names';
import type { MatchConditions } from '../engine/conditions';
import { computeContext } from '../engine/context';
import { availableOptions, sceneInsights } from '../engine/match';
import { VOICE_LABEL } from '../engine/voices';
import { Pitch } from './Pitch';
import { Icon, modIcon } from './icons';

// Экран матча по макету А2 (19.09): поле целиком сверху, под ним стрічка подій як діалог —
// старые строки гаснут и уходят под поле, — сцена (EpisodeCard) или бросок (RollView), внизу
// зона «на кубик»: факторы состояния, которые движок добавит к любому варианту, и сили.
// Тренер и трибуни — маленькие шкалы в углу поля: их место в игре не изменилось, только объём.

const fmt = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');

/** Факторы, которые относятся к состоянию, а не к варианту: объединение по всем вариантам сцены
 *  без строки атрибута (первая) и без «<голос> веде» (зависит от того, кого слушаешь). При
 *  разных значениях одной подписи (ноги: дорогой/дешёвый вариант) — худшее. */
function stateMods(episode: Episode, state: MatchState, player: Player, conditions: MatchConditions, flagRules: FlagRule[]): ModLine[] {
  const seen = new Map<string, ModLine>();
  for (const o of availableOptions(episode, state, player)) {
    const ctx = computeContext(state, player, o, episode.phase, conditions, flagRules);
    for (const m of ctx.mods.slice(1)) {
      if (m.value === 0 || m.label.includes('веде')) continue;
      const prev = seen.get(m.label);
      if (!prev || m.value < prev.value) seen.set(m.label, m);
    }
  }
  return [...seen.values()];
}

function Meter({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const n = Math.round(Math.max(0, Math.min(100, value)) / 20);
  return (
    <span className={`meter ${tone ?? ''}`} title={label}>
      <span className="meter-label">{label}</span>
      {[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < n ? 'on' : ''} />)}
    </span>
  );
}

export function MatchScreen({
  state, roster, shown, waiting, onSkip, episode, player, conditions, flagRules, tour, children,
}: {
  state: MatchState;
  roster: Roster;
  shown: TimelineEvent[];
  waiting: boolean;
  onSkip: () => void;
  /** Текущая сцена — для точки на поле и факторов «на кубик»; null между эпизодами. */
  episode: Episode | null;
  player: Player;
  conditions: MatchConditions;
  flagRules: FlagRule[];
  tour?: number;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const VISIBLE = 4;
  const tape = expanded ? shown : shown.slice(-VISIBLE);
  const hidden = shown.length - tape.length;
  const mods = episode ? stateMods(episode, state, player, conditions, flagRules) : [];
  const insights = episode ? sceneInsights(episode, state, player) : [];
  const staminaSegs = Math.round(Math.max(0, Math.min(100, state.stamina)) / 20);

  return (
    <div className="match de-match">
      <aside className="film film-left" aria-hidden="true">
        {[-1, 0, 1].map((d) => <span key={d}>{`01A${String(Math.max(0, state.minute + d)).padStart(2, '0')}`}</span>)}
      </aside>
      <aside className="film film-right" aria-hidden="true">
        <span>{tour ? `тур ${tour}` : 'матч'}</span>
        <span>{roster.us.name.nom.slice(0, 3)} — {roster.them.name.nom.slice(0, 3)}</span>
        <span>{state.minute}′</span>
      </aside>

      <div className="pitch-wrap">
        <Pitch episode={episode} selfName={roster.us.players.self.nom} />
        <div className="score-overlay">
          <span className="score-line">{state.minute}′ &nbsp; {roster.us.name.nom} <b>{state.scoreUs} : {state.scoreThem}</b> {roster.them.name.nom}</span>
          <span className="meters">
            <Meter label="тренер" value={state.coachTrust} tone={state.coachTrust < 30 ? 'low' : ''} />
            <Meter label="трибуни" value={state.fanHype} tone="hype" />
          </span>
        </div>
      </div>

      <div className="tape">
        <div className="tape-shade" />
        {hidden > 0 && !expanded && (
          <button className="tape-more" onClick={() => setExpanded(true)}>{Icon.list()} ще {hidden} {hidden === 1 ? 'подія' : hidden < 5 ? 'події' : 'подій'}</button>
        )}
        {expanded && <button className="tape-more" onClick={() => setExpanded(false)}>згорнути</button>}
        {tape.map((e, i) => {
          const age = tape.length - 1 - i;   // 0 — последняя строка
          return (
            <p key={shown.length - tape.length + i} className={`tape-line kind-${e.kind} age-${Math.min(age, 3)}`}>
              <span className="tape-minute">{e.minute}′</span> — {e.text}
            </p>
          );
        })}
        {state.coachTrust < 30 && (
          <p className="tape-line say say-coach"><b>Тренер</b> — дедалі частіше поглядає на брівку: там уже розминаються.</p>
        )}
        {waiting && <button className="skip" onClick={onSkip}>далі ⟶</button>}
      </div>

      {children}

      <footer className="dice-zone">
        <span className="dice-zone-label">на кубик</span>
        <span className="chips">
          {mods.map((m) => (
            <span key={m.label} className={`chip src-${m.source} ${m.value < 0 ? 'neg' : 'pos'}`} title={m.label}>
              {modIcon(m.label, m.source)}<span>{fmt(m.value)}</span>
            </span>
          ))}
          {insights.map((v) => (
            <span key={v.who} className={`chip chip-insight voice-${v.who}`} title={`${VOICE_LABEL[v.who]} бачить`}>{Icon.eye()}<span>бачить</span></span>
          ))}
          {mods.length === 0 && insights.length === 0 && episode && <span className="chip chip-none">без поправок</span>}
        </span>
        <span className="stamina" title={`сили ${Math.round(state.stamina)}`}>
          {Icon.energy()}
          {[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < staminaSegs ? 'on' : ''} />)}
        </span>
      </footer>
    </div>
  );
}
