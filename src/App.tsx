import { useCallback, useEffect, useRef, useState } from 'react';
import { EPISODES_RAW, FLAG_RULES, FLAVOR, OPPONENTS, PLAYER, ROSTER, rosterFor } from './content';
import { generateConditions, toneFromHistory } from './engine/conditions';
import { readHistory, recentEpisodes, recordResult } from './telemetry/history';
import { BALANCE } from './engine/balance';
import { BriefingScreen } from './ui/BriefingScreen';
import { PlayerCard } from './ui/PlayerCard';
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
  | { k: 'briefing' }
  | { k: 'feed' }
  | { k: 'episode'; episode: Episode; minute: number }
  | { k: 'roll'; episode: Episode; option: EpisodeOption; res: Resolution; events: TimelineEvent[] }
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
    const next = nextEpisode(session, rng);
    if (next) {
      pendingRef.current = { kind: 'episode', episode: next.episode, minute: next.minute };
      setQueue([...lead, ...next.events]);
    } else {
      const { events, summary } = finishMatch(session, rng);
      recordResult(summary.scoreUs, summary.scoreThem, session.usedEpisodeIds);   // тонус и память следующего матча
      pendingRef.current = { kind: 'result', summary };
      setQueue([...lead, ...events]);
    }
    setStage({ k: 'feed' });
  }, []);

  const start = useCallback(() => {
    // ?seed= воспроизводит конкретный матч, но только первый: иначе «Ще матч»
    // раз за разом даёт ту же игру, и кажется, что эпизодов всего десять.
    const params = new URLSearchParams(location.search);
    const fromUrl = Number(params.get('seed'));
    const seed = Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : Math.floor(Math.random() * 1e9);
    if (params.has('seed')) history.replaceState(null, '', location.pathname + location.hash);
    const rng = makeRng(seed);
    // Условия матча — по сиду, тонус — из истории этого устройства.
    const conditions = generateConditions(rng, OPPONENTS, toneFromHistory(readHistory().map((h) => h.result)));
    const session = createMatch(
      `${Date.now().toString(36)}-${seed}`, seed, PLAYER, rng, EPISODES_RAW, rosterFor(conditions.opponentKey), conditions,
      recentEpisodes(BALANCE.match.recentMatches), FLAG_RULES,
    );
    rngRef.current = rng;
    sessionRef.current = session;
    setShown([]);
    setStage({ k: 'briefing' });
  }, []);

  const kickoff = useCallback(() => {
    proceed(sessionRef.current!.state.log.slice());   // стартовый свисток уже лежит в логе
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
    const res = resolveOption(session.state, session.player, option, stage.episode.phase, rng, session.conditions, session.flagRules);

    logDecision({
      matchId: session.matchId,
      seed: session.seed,
      episodeId: stage.episode.id,
      optionId: option.id,
      optionLabel: option.label,
      minute: stage.minute,
      conditions: `${session.conditions.venue}/${session.conditions.strength}/${session.conditions.instruction}/${session.conditions.weather}`,
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

    // Исход применяется сразу: реплика после броска должна знать счёт и минуту
    // уже с учётом этого исхода. В ленту события попадают по кнопке «Далі».
    const { events } = applyChoice(session, stage.episode, option, res, rng, FLAVOR);
    setStage({ k: 'roll', episode: stage.episode, option, res, events });
  }, [stage]);

  const afterRoll = useCallback(() => {
    if (stage.k !== 'roll') return;
    setShown((s) => [...s, ...stage.events]);
    proceed();
  }, [stage, proceed]);

  if (stage.k === 'menu') {
    return (
      <div className="menu">
        <h1>Один матч</h1>
        <p>
          Ти — {PLAYER.name}, {PLAYER.position} «{ROSTER.us.name.gen}». Дев’яносто хвилин, десять моментів,
          і в кожному треба обирати. Переграти не можна.
        </p>
        <p className="muted">
          Тренер і трибуни хочуть від тебе різного. Сили майже не відновлюються — хіба що в перерві.
        </p>
        <button className="primary" onClick={start}>До матчу</button>
        <a className="link" href="#/player">Картка гравця</a>
        <a className="link" href="#/stats">Розподіл виборів</a>
      </div>
    );
  }

  if (stage.k === 'briefing') {
    const session = sessionRef.current!;
    return (
      <>
        <BriefingScreen
          conditions={session.conditions}
          opponent={OPPONENTS[session.conditions.opponentKey]}
          player={session.player}
          onStart={kickoff}
        />
        <DebugPanel session={session} />
      </>
    );
  }

  if (stage.k === 'result') {
    return (
      <>
        <ResultScreen summary={stage.summary} roster={sessionRef.current!.roster} onRestart={start} />
        <DebugPanel session={sessionRef.current} />
      </>
    );
  }

  const session = sessionRef.current!;
  return (
    <>
      <MatchScreen
        state={session.state}
        roster={session.roster}
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
            conditions={session.conditions}
            flagRules={session.flagRules}
            onChoose={choose}
          />
        )}
        {stage.k === 'roll' && (
          <RollView
            option={stage.option}
            res={stage.res}
            flavor={stage.events.find((e) => e.kind === 'episode')?.flavor}
            badges={stage.events.find((e) => e.kind === 'episode')?.badges}
            onNext={afterRoll}
          />
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
  if (route.startsWith('#/stats')) return <StatsScreen />;
  if (route.startsWith('#/player')) return <PlayerCard player={PLAYER} onBack={() => { location.hash = '#/'; }} />;
  return <Game />;
}
