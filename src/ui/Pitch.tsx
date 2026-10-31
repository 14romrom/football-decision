import { useEffect, useRef } from 'react';
import type { Episode, TimelineEvent } from '../engine/types';
import { FORMATION_BY_STRENGTH, type Strength } from '../engine/conditions';
import type { FinaleKind } from '../engine/finale';
import { scenePlace, type ReyesAction } from '../engine/action';
import type { Roster } from '../engine/names';
import { motionReduced } from '../telemetry/settings';
import { Director, LABEL_ROLES, PH, PW, formationOf, placePoint, type P, type PitchScene } from './pitchDirector';

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
/** Розв'язки, які поле вже зіграло (об'єкт `finale` з App — один на кидок). */
const PLAYED = new WeakSet<object>();

export const spotOf = (episode: Episode | null): P => {
  const own = episode ? placePoint(scenePlace(episode.id)) : null;
  if (own) return own;
  const s = (episode?.family && FAMILY_SPOT[episode.family]) || PHASE_SPOT[episode?.phase ?? 'transition'];
  // Атакувальна сцена без місця в тексті не стоїть на своїй половині (22.10: `ep_between_lines` — сім'я
  // «дуель» із точкою 0.34, хоча «між лініями» — це біля чужого штрафного).
  const x = episode?.phase === 'attack' ? Math.max(s[0], PHASE_SPOT.attack[0]) : s[0];
  return [x * PW, s[1] * PH];
};

type Props = {
  episode: Episode | null; selfName: string; strength?: Strength;
  roster: Roster;
  /** Вища ліга — рев великого стадіону на гол. */
  top?: boolean;
  /** Погода, час і ліга — газон, світло, трибуни (M52). */
  scene?: PitchScene;
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
  /** Сід матчу для варіацій рухів (M52). */
  seed?: number;
  /** Сцена, що ось-ось відкриється: камера до її місця, Реєс спалахує (передчуття, 22.10). */
  cue?: Episode | null;
  /** Установка тренера й рахунок за показаною стрічкою (+ — ведемо): форма команди на полі (23.10). */
  instruction?: 'hold' | 'press' | 'free' | 'none';
  lead?: number;
  /** Останній показаний рядок — перерва: перший рядок другого тайму почнеться з розводу. */
  afterBreak?: boolean;
  /** Перерва вже була — поле збирається з командами, що помінялися воротами. */
  secondHalf?: boolean;
  /** Постановку рядка доіграно (або її немає) — стрічка чекає на це, щоб наступний рядок не обривав поле. */
  onPlayed?: (e: TimelineEvent) => void;
};

export function Pitch({ episode, selfName, strength = 'even', roster, top = false, scene, finale, pulse, onBench = false, sentOff = false, stamina, momentum, minute, seed = 0, cue, instruction = 'free', lead = 0, afterBreak = false, secondHalf = false, onPlayed }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dir = useRef<Director | null>(null);
  /** Розв'язка сцени на полі — стрічка чекає на неї так само, як на постановку рядка (onPlayed). */
  const resolved = useRef<Promise<void> | null>(null);

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
      usKit: roster.us.kit, themKit: roster.them.kit, formation: formationOf(FORMATION_BY_STRENGTH[strength]), names, reduced: motionReduced(), top, scene, seed, secondHalf,
    });
    d.setBench(onBench, sentOff);
    d.setMinute(minute);
    d.setPlay({ instruction, lead, strength });
    if (afterBreak) d.afterBreak();
    dir.current = d;
    // Лише в dev-збірці: щоб прогнати кожну постановку стрічки руками, не чекаючи її в матчі.
    if (import.meta.env.DEV) (window as unknown as { __pitch?: Director }).__pitch = d;
    // Поле з'являється після листа — усі від місця останньої сцени, а розв'язка грає вже звідти.
    // Дія Реєса — шаблоном руху з місця сцени; без неї (старі збереження) — загальна розв'язка за видом.
    // Розв'язка грає один раз (плейтест 19.10: святкування гола при 0:0 без сцени). Поле перемонтовується
    // після кожного листа — виходу, паузи, свистка, — а `finale` у App лишається тим самим об'єктом аж до
    // наступного кидка, тож без цієї позначки кожен лист повторював останній гол, навіть із минулого матчу.
    const fresh = !!finale && !PLAYED.has(finale);
    if (finale) PLAYED.add(finale);
    if (fresh && finale?.action) resolved.current = d.action({ template: finale.action.template, result: finale.action.result, place: placePoint(finale.action.place) ?? spotOf(episode), target: placePoint(finale.action.target), end: finale.action.end, by: finale.action.by, counter: finale.action.counter, freeKick: episode?.family === 'free_kick',
      corner: episode?.family === 'corner_attack' && episode.id !== 'ep_long_throw_box' ? 'us' : episode?.family === 'corner_defense' ? 'them' : undefined,
      penalty: !!episode?.id.startsWith('fin_penalty') });
    else if (fresh && finale) resolved.current = d.finale(finale.kind, spotOf(episode));
    else if (episode) void d.toSpot(spotOf(episode));
    // Поле, зняте одразу (подвійний монтаж StrictMode у dev), розв'язку не бачило — позначку знімаємо.
    const born = performance.now();
    return () => { d.stop(); dir.current = null; if (fresh && finale && performance.now() - born < 300) PLAYED.delete(finale); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { dir.current?.setBench(onBench, sentOff); }, [onBench, sentOff]);
  useEffect(() => { dir.current?.setStamina(stamina); }, [stamina]);
  useEffect(() => { dir.current?.setGlow(momentum >= 2); }, [momentum]);

  // Рядок стрічки — його постановка. Сцена в стрічці (kind `episode`) уже розіграна розв'язкою.
  const first = useRef(true);
  useEffect(() => {
    const d = dir.current;
    if (!pulse) return;
    const done = () => onPlayed?.(pulse);
    if (!d) { done(); return; }
    // Рядок сцени — це її розв'язка, вона вже грає. Позначку «перший рядок — старий» знімаємо: інакше
    // наступний рядок стрічки після кожної сцени вважався «уже баченим» і на полі не грався (знайдено 23.10).
    if (pulse.kind === 'episode') { first.current = false; void (resolved.current ?? Promise.resolve()).then(done); return; }
    // На монтуванні після листа останній показаний рядок — старий: його вже бачили.
    if (first.current) { first.current = false; if (finale || episode) { done(); return; } }
    // Хвилина рядка — до розіграшу: від неї варіація постановки (M52), а ефект хвилини нижче спрацює пізніше.
    if (pulse.minute !== undefined) d.setMinute(pulse.minute);
    if (pulse.stage) void d.play(pulse.stage, pulse.kind).then(done);
    // Фінальний свисток — у тунель, як на перерві (плейтест 31.10): раніше рядок не мав постановки,
    // і фішки лишалися там, де застав останній розіграш.
    else if (pulse.kind === 'fulltime') void d.play({ act: 'half', tags: ['final'] }).then(done);
    else if (pulse.kind === 'goalUs' || pulse.kind === 'goalThem') void d.play({ act: 'echo', tags: [] }, pulse.kind).then(done);
    else done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse?.minute, pulse?.text]);
  useEffect(() => { dir.current?.setMinute(minute); }, [minute]);
  useEffect(() => { dir.current?.setPlay({ instruction, lead }); }, [instruction, lead]);
  useEffect(() => { if (cue) void dir.current?.cue(spotOf(cue)); }, [cue?.id]);

  return (
    <div className="pitch-cam">
      <svg ref={svgRef} className="pitch" preserveAspectRatio="xMidYMid slice" aria-hidden="true" />
      {scene?.weather === 'rain' && <div className="pitch-rain" aria-hidden="true" />}
    </div>
  );
}
