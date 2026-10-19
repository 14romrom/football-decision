import { useState } from 'react';
import { ADS, rosterFor } from '../content';
import { parseStage } from '../engine/feed';
import type { ActionResult, ActionTemplate } from '../engine/action';
import type { Weather } from '../engine/conditions';
import { Pitch } from './Pitch';
import { placePoint, type Director } from './pitchDirector';

// Лабораторія поля (M52, 19.10) — лише в dev-збірці (`#/pitchlab`, App перевіряє import.meta.env.DEV):
// поле в заданій погоді, часі й лізі та кнопки, що розігрують будь-який рядок стрічки чи дію Реєса з
// будь-яким підсумком. Для записів «було / стало» і для перевірки постановок ісходів без проходження матчу.
// Текстів гравця тут немає — тому й перекладу немає (i18n-skip у рядках, що лишилися кирилицею).

const STAGES = [
  'shot theirBox:C us.striker saved', 'shot theirBox:L self post', 'shot their:C self over', 'cross their:L us.winger>us.striker',
  'long own:C', 'dribble mid:C self', 'foul mid:C them.mid>self', 'corner theirBox:L', 'build mid:C', 'switch their:R',
];
const TEMPLATES: ActionTemplate[] = ['shot', 'pass', 'cross', 'through', 'switch', 'dribble', 'tackle', 'header', 'run', 'shield', 'hold'];
const RESULTS: ActionResult[] = ['goal', 'ok', 'meh', 'fail', 'lost', 'foul', 'red', 'concede'];

export function PitchLab() {
  const [weather, setWeather] = useState<Weather>('clear');
  const [night, setNight] = useState(false);
  const [cold, setCold] = useState(false);
  const [top, setTop] = useState(false);
  const [key, setKey] = useState(0);
  const [tpl, setTpl] = useState<ActionTemplate>('shot');
  const roster = rosterFor('sandorea');
  const d = () => (window as unknown as { __pitch?: Director }).__pitch;
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
    </div>
  );
}
