import { useEffect, useRef } from 'react';
import type { Episode, TimelineEvent } from '../engine/types';
import { FORMATION_BY_STRENGTH, type Strength } from '../engine/conditions';
import type { FinaleKind } from '../engine/finale';
import { scenePlace, type ReyesAction } from '../engine/action';
import type { Roster } from '../engine/names';
import { motionReduced } from '../telemetry/settings';
import { Director, LABEL_ROLES, PH, PW, formationOf, placePoint, type P } from './pitchDirector';

// Поле матчу (17.10, макет «Постановка стрічки»; до того — схема 19.09 з трьома шарами руху).
// Камера показує третину поля, де гра, фішки — у формах команд, м'яч чорно-білий. Кожен рядок стрічки
// розігрується за своєю постановкою (feed.json → TimelineEvent.stage), розв'язка після кидка — за видом
// ісходу (engine/finale.ts). Самі рухи — ui/pitchDirector.ts; тут лише склеювання з React.

export type Spot = [number, number];

/** Где на поле происходит сцена: доля ширины (0 — свои ворота, 1 — чужие) и высоты.
 *  Экспорт — для дошки аналітика (BoardScreen): магниты моментов стоят там же, где шла сцена. */
export const FAMILY_SPOT: Record<string, Spot> = {
  edge_shot: [0.74, 0.5], one_on_one: [0.86, 0.5], finishing: [0.9, 0.48], penalty: [0.88, 0.5],
  free_kick: [0.72, 0.42], corner_attack: [0.96, 0.92], through: [0.62, 0.5], wing: [0.7, 0.14],
  counter: [0.5, 0.5], partner: [0.55, 0.5], press: [0.42, 0.5], duel: [0.34, 0.5], last_man: [0.2, 0.5],
  corner_defense: [0.04, 0.94], coach: [0.5, 0.97], referee: [0.5, 0.5], body: [0.5, 0.5],
};
export const PHASE_SPOT: Record<NonNullable<Episode['phase']>, Spot> = { attack: [0.7, 0.5], defense: [0.3, 0.5], transition: [0.5, 0.5], setpiece: [0.8, 0.4] };

// Місце сцени — зі слів сетапу (engine/action.ts, actions.json); немає — точка сім'ї, як раніше.
const spotOf = (episode: Episode | null): P => {
  const own = episode ? placePoint(scenePlace(episode.id)) : null;
  if (own) return own;
  const s = (episode?.family && FAMILY_SPOT[episode.family]) || PHASE_SPOT[episode?.phase ?? 'transition'];
  return [s[0] * PW, s[1] * PH];
};

type Props = {
  episode: Episode | null; selfName: string; strength?: Strength;
  roster: Roster;
  /** Вища ліга — рев великого стадіону на гол. */
  top?: boolean;
  /** Розв’язка: вид и порядковый номер броска — новый номер запускает хореографию. */
  finale?: { kind: FinaleKind; id: number; action?: ReyesAction } | null;
  /** Последняя строка ленты — поле разыгрывает её постановку. */
  pulse?: TimelineEvent | null;
  /** Реєс на лаві: фішка біля лави, на полі дублер. Так само після заміни по ходу матчу. */
  onBench?: boolean;
  /** Реєса вилучено: фішка біля лави, команда вдесятьох. */
  sentOff?: boolean;
  /** Сили — кільце навколо фішки Реєса; кураж ≥ 2 — фішка світиться. */
  stamina: number;
  momentum: number;
  minute: number;
};

export function Pitch({ episode, selfName, strength = 'even', roster, top = false, finale, pulse, onBench = false, sentOff = false, stamina, momentum, minute }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dir = useRef<Director | null>(null);

  // Поле збирається один раз на монтування: форми, розстановка суперника, підписи.
  useEffect(() => {
    if (!svgRef.current) return;
    const names: Record<string, string> = {};
    for (const [id, role] of Object.entries(LABEL_ROLES)) {
      const team = id.startsWith('u') || id === 'sub' ? roster.us : roster.them;
      const n = team.players[role]?.nom;
      if (n) names[id] = n;
    }
    names.u10 = selfName;
    const d = new Director(svgRef.current, {
      usKit: roster.us.kit, themKit: roster.them.kit, formation: formationOf(FORMATION_BY_STRENGTH[strength]), names, reduced: motionReduced(), top,
    });
    d.setBench(onBench, sentOff);
    dir.current = d;
    // Лише в dev-збірці: щоб прогнати кожну постановку стрічки руками, не чекаючи її в матчі.
    if (import.meta.env.DEV) (window as unknown as { __pitch?: Director }).__pitch = d;
    // Поле з'являється після листа — усі від місця останньої сцени, а розв'язка грає вже звідти.
    // Дія Реєса — шаблоном руху з місця сцени; без неї (старі збереження) — загальна розв'язка за видом.
    if (finale?.action) void d.action({ template: finale.action.template, result: finale.action.result, place: placePoint(finale.action.place) ?? spotOf(episode), target: placePoint(finale.action.target) });
    else if (finale) void d.finale(finale.kind, spotOf(episode));
    else if (episode) void d.toSpot(spotOf(episode));
    return () => { d.stop(); dir.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { dir.current?.setBench(onBench, sentOff); }, [onBench, sentOff]);
  useEffect(() => { dir.current?.setStamina(stamina); }, [stamina]);
  useEffect(() => { dir.current?.setGlow(momentum >= 2); }, [momentum]);

  // Рядок стрічки — його постановка. Сцена в стрічці (kind `episode`) уже розіграна розв'язкою.
  const first = useRef(true);
  useEffect(() => {
    const d = dir.current;
    if (!d || !pulse || pulse.kind === 'episode') return;
    // На монтуванні після листа останній показаний рядок — старий: його вже бачили.
    if (first.current) { first.current = false; if (finale || episode) return; }
    if (pulse.stage) void d.play(pulse.stage, pulse.kind);
    else if (pulse.kind === 'goalUs' || pulse.kind === 'goalThem') void d.play({ act: 'echo', tags: [] }, pulse.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse?.minute, pulse?.text]);

  return (
    <div className="pitch-cam">
      <svg ref={svgRef} className="pitch" preserveAspectRatio="xMidYMid slice" aria-hidden="true" />
      <span className="pitch-clock">{minute}′</span>
    </div>
  );
}
