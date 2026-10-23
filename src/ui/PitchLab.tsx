import { useState } from 'react';
import { ADS, EPISODES, rosterFor } from '../content';
import { reyesAction } from '../engine/action';
import type { Resolution, TimelineEvent } from '../engine/types';
import { parseStage } from '../engine/feed';
import type { ActionResult, ActionTemplate } from '../engine/action';
import type { Weather } from '../engine/conditions';
import { Pitch, spotOf } from './Pitch';
import { placePoint, type Celebration, type Director } from './pitchDirector';

// Лабораторія поля (M52, 19.10) — лише в dev-збірці (`#/pitchlab`, App перевіряє import.meta.env.DEV):
// поле в заданій погоді, часі й лізі та кнопки, що розігрують будь-який рядок стрічки чи дію Реєса з
// будь-яким підсумком. Для записів «було / стало» і для перевірки постановок ісходів без проходження матчу.
// Текстів гравця тут немає — тому й перекладу немає (i18n-skip у рядках, що лишилися кирилицею).

const STAGES = [
  'shot theirBox:C us.striker saved', 'shot theirBox:L self post', 'shot their:C self over', 'cross their:L us.winger>us.striker',
  'long own:C', 'dribble mid:C self', 'foul mid:C them.mid>self', 'corner theirBox:L', 'build mid:C', 'switch their:R',
];
const TEMPLATES: ActionTemplate[] = ['shot', 'pass', 'cross', 'through', 'switch', 'dribble', 'tackle', 'header', 'run', 'shield', 'hold', 'line', 'mark', 'cover', 'wait', 'calm'];
const CELEBRATIONS: Celebration[] = ['jump', 'knees', 'flag', 'plane'];
const RESULTS: ActionResult[] = ['goal', 'ok', 'meh', 'fail', 'lost', 'foul', 'red', 'concede'];

/** Зіграти ісход сцени за ключем «епізод/варіант/ярус» так, як його зіграє матч (App → reyesAction).
 *  `plain` — без подій кінцівки з тексту: так поле грало до M52, для записів «було / стало». */
function playOutcome(d: Director | undefined, key: string, plain = false): Promise<void> | false {
  const [eid, oid, tier] = key.split('/');
  const e = EPISODES.find((x) => x.id === eid); const o = e?.options.find((x) => x.id === oid);
  if (!d || !e || !o) return false;
  const oc = tier === 'crit' ? o.outcomes.crit! : o.outcomes[tier as 'clean'];
  const res = { tier: tier === 'crit' ? 'clean' : tier, critical: tier === 'crit' ? 'success' : undefined } as unknown as Resolution;
  const ap = oc.apply ?? {};
  const events = [...(ap.goal || ap.teamGoal || ap.assist ? [{ kind: 'goalUs' }] : []), ...(ap.concede ? [{ kind: 'goalThem' }] : [])] as TimelineEvent[];
  const act = reyesAction(e, o, res, events);
  // Ті самі прапорці стандартів, що в Pitch.tsx: стінка, кутовий, пенальті з позначки.
  return d.action({ template: act.template, result: act.result, place: placePoint(act.place) ?? spotOf(e), target: placePoint(act.target), end: plain ? [] : act.end, by: act.by, counter: act.counter,
    freeKick: e.family === 'free_kick', corner: e.family === 'corner_attack' && e.id !== 'ep_long_throw_box' ? 'us' : e.family === 'corner_defense' ? 'them' : undefined, penalty: e.id.startsWith('fin_penalty') });
}

export function PitchLab() {
  const [weather, setWeather] = useState<Weather>('clear');
  const [night, setNight] = useState(false);
  const [cold, setCold] = useState(false);
  const [top, setTop] = useState(false);
  const [key, setKey] = useState(0);
  const [tpl, setTpl] = useState<ActionTemplate>('shot');
  const roster = rosterFor('sandorea');
  const d = () => (window as unknown as { __pitch?: Director }).__pitch;
  (window as unknown as { __outcome?: (k: string, plain?: boolean) => boolean }).__outcome = (k, plain) => playOutcome(d(), k, plain) !== false;
  (window as unknown as { __outcomeRun?: (k: string) => Promise<void> | false }).__outcomeRun = (k) => playOutcome(d(), k);
  const rebuild = (f: () => void) => { f(); setKey((k) => k + 1); };
  return (
    <div className="pitchlab">
      <Pitch key={key} episode={null} selfName={roster.us.players.self.nom} roster={roster} top={top}
        scene={{ weather, night, cold, league: top ? 'top' : 'second', boards: ADS.flatMap((a) => (a.title ? [a.title] : [])) }} minute={34} stamina={80} momentum={0} />
      <div className="pitchlab-row">
        {(['clear', 'rain', 'wind', 'heat'] as Weather[]).map((w) => <button key={w} className={w === weather ? 'on' : ''} onClick={() => rebuild(() => setWeather(w))}>{w}</button>)}
        <button className={night ? 'on' : ''} onClick={() => rebuild(() => setNight(!night))}>night</button>
        <button className={cold ? 'on' : ''} onClick={() => rebuild(() => setCold(!cold))}>cold</button>
        <button className={top ? 'on' : ''} onClick={() => rebuild(() => setTop(!top))}>top</button>
      </div>
      <div className="pitchlab-row">{STAGES.map((s) => <button key={s} onClick={() => void d()?.play(parseStage(s))}>{s}</button>)}</div>
      <div className="pitchlab-row">{TEMPLATES.map((x) => <button key={x} className={x === tpl ? 'on' : ''} onClick={() => setTpl(x)}>{x}</button>)}</div>
      <div className="pitchlab-row">{RESULTS.map((r) => (
        <button key={r} onClick={() => void d()?.action({ template: tpl, result: r, place: placePoint('their:C')!, target: null })}>{r}</button>
      ))}</div>
      <div className="pitchlab-row">{CELEBRATIONS.map((c) => (
        <button key={c} onClick={() => { const p = d(); if (!p) return; p.forceCelebration = c; void p.action({ template: 'shot', result: 'goal', place: placePoint('theirBox:L')!, target: null }); }}>{`gol:${c}`}</button>
      ))}</div>
    </div>
  );
}
