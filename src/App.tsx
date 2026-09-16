import { useCallback, useEffect, useRef, useState } from 'react';
import { EPISODES, PLAYER } from './content';
import { makeRng, type Rng } from './engine/rng';
import { resolveOption } from './engine/resolve';
import {
  applyChoice, createMatch, finishMatch, nextEpisode,
  type MatchSession, type MatchSummary,
} from './engine/match';
import type { Episode, EpisodeOption, Resolution, TimelineEvent } from './engine/types';
import { logDecision } from './telemetry/log';
import { MatchScreen } from './ui/MatchScreen';
import { EpisodeCard } from './ui/EpisodeCard';
import { RollView } from './ui/RollView';
import { ResultScreen } from './ui/ResultScreen';
import { StatsScreen } from './ui/StatsScreen';
import { DebugPanel } from './ui/DebugPanel';

type Stage =
  | { k: 'menu' }
  | { k: 'feed' }
  | { k: 'episode'; episode: Episode; minute: number }
  | { k: 'roll'; episode: Episode; option: EpisodeOption; res: Resolution }
  | { k: 'result'; summary: MatchSummary };

type Pending =
  | { kind: 'episode'; episode: Episode; minute: number }
  | { kind: 'result'; summary: MatchSummary };

/** Пауза на событие ленты: гол должен успеть прозвучать, проходной момент — нет. */
function delayFor(e: TimelineEvent): number {
  if (e.kind === 'goalUs' || e.kind === 'goalThem') return 2400;
  if (e.kind === 'halftime' || e.kind === 'kickoff') return 1800;
  if (e.kind === 'episode') return 0;   // исход уже показан на экране броска
  return 1900;
}

function Game() {
  const sessionRef = useRef<MatchSession | null>(null);
  const rngRef = useRef<Rng | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const shownAtRef = useRef(0);

  const [stage, setStage] = useState<Stage>({ k: 'menu' });
  const [shown, setShown] = useState<TimelineEvent[]>([]);
  const [queue, setQueue] = useState<TimelineEvent[]>([]);

  const proceed = useCallback((lead: TimelineEvent[] = []) => {
    const session = sessionRef.current!;
    const rng = rngRef.current!;
    const next = nextEpisode(session, EPISODES, rng);
    if (next) {
      pendingRef.current = { kind: 'episode', episode: next.episode, minute: next.minute };
      setQueue([...lead, ...next.events]);
    } else {
      const { events, summary } = finishMatch(session, rng);
      pendingRef.current = { kind: 'result', summary };
      setQueue([...lead, ...events]);
    }
    setStage({ k: 'feed' });
  }, []);

  const start = useCallback(() => {
    const fromUrl = Number(new URLSearchParams(location.search).get('seed'));
    const seed = Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : Math.floor(Math.random() * 1e9);
    const rng = makeRng(seed);
    const session = createMatch(`${Date.now().toString(36)}-${seed}`, seed, PLAYER, rng, EPISODES);
    rngRef.current = rng;
    sessionRef.current = session;
    setShown([]);
    proceed(session.state.log.slice());   // стартовый свисток уже лежит в логе
  }, [proceed]);

  // Проигрывание ленты: по одному событию, пока очередь не опустеет.
  useEffect(() => {
    if (stage.k !== 'feed') return;
    if (queue.length === 0) {
      const p = pendingRef.current;
      pendingRef.current = null;
      if (!p) return;
      if (p.kind === 'episode') {
        shownAtRef.current = performance.now();
        setStage({ k: 'episode', episode: p.episode, minute: p.minute });
      } else {
        setStage({ k: 'result', summary: p.summary });
      }
      return;
    }
    const t = setTimeout(() => {
      setShown((s) => [...s, queue[0]]);
      setQueue((q) => q.slice(1));
    }, delayFor(queue[0]));
    return () => clearTimeout(t);
  }, [stage.k, queue]);

  const skip = useCallback(() => {
    setShown((s) => [...s, ...queue]);
    setQueue([]);
  }, [queue]);

  const choose = useCallback((option: EpisodeOption) => {
    if (stage.k !== 'episode') return;
    const session = sessionRef.current!;
    const rng = rngRef.current!;
    const res = resolveOption(session.state, session.player, option, stage.episode.phase, rng);

    logDecision({
      matchId: session.matchId,
      seed: session.seed,
      episodeId: stage.episode.id,
      optionId: option.id,
      optionLabel: option.label,
      minute: stage.minute,
      stamina: Math.round(session.state.stamina),
      scoreDiff: session.state.scoreUs - session.state.scoreThem,
      momentum: session.state.momentum,
      roll: res.roll,
      totalScore: res.totalScore,
      position: res.position,
      tier: res.tier,
      msToDecide: Math.round(performance.now() - shownAtRef.current),
      at: Date.now(),
    });

    setStage({ k: 'roll', episode: stage.episode, option, res });
  }, [stage]);

  const afterRoll = useCallback(() => {
    if (stage.k !== 'roll') return;
    const { events } = applyChoice(sessionRef.current!, stage.episode, stage.option, stage.res, rngRef.current!);
    setShown((s) => [...s, ...events]);
    proceed();
  }, [stage, proceed]);

  if (stage.k === 'menu') {
    return (
      <div className="menu">
        <h1>Один матч</h1>
        <p>
          Ты — {PLAYER.name}, {PLAYER.position} в «Вальмаре». Девяносто минут, десять моментов,
          и в каждом надо выбрать. Переиграть нельзя.
        </p>
        <p className="muted">
          Тренер и трибуны хотят от тебя разного. Силы не восстанавливаются.
        </p>
        <button className="primary" onClick={start}>Выйти на поле</button>
        <a className="link" href="#/stats">Распределение выборов</a>
      </div>
    );
  }

  if (stage.k === 'result') {
    return (
      <>
        <ResultScreen summary={stage.summary} onRestart={start} />
        <DebugPanel session={sessionRef.current} />
      </>
    );
  }

  const session = sessionRef.current!;
  return (
    <>
      <MatchScreen
        state={session.state}
        shown={shown}
        waiting={stage.k === 'feed' && queue.length > 0}
        onSkip={skip}
      >
        {stage.k === 'episode' && (
          <EpisodeCard
            episode={stage.episode}
            minute={stage.minute}
            state={session.state}
            player={session.player}
            onChoose={choose}
          />
        )}
        {stage.k === 'roll' && (
          <RollView option={stage.option} res={stage.res} onNext={afterRoll} />
        )}
      </MatchScreen>
      <DebugPanel session={session} />
    </>
  );
}

export function App() {
  const [route, setRoute] = useState(() => location.hash);
  useEffect(() => {
    const onHash = () => setRoute(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route.startsWith('#/stats') ? <StatsScreen /> : <Game />;
}
