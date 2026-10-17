import { useState, type ReactNode } from 'react';
import { Film } from './Film';
import type { Episode, FlagRule, MatchState, ModLine, Player, TimelineEvent } from '../engine/types';
import type { Kit as KitT, Roster } from '../engine/names';
import type { MatchConditions } from '../engine/conditions';
import type { FinaleKind } from '../engine/finale';
import { computeContext } from '../engine/context';
import { availableOptions, sceneInsights } from '../engine/match';
import { VOICE_LABEL } from '../engine/voices';
import { Pitch } from './Pitch';
import { useEffect } from 'react';
import { ambience } from './sound';
import { Icon } from './icons';
import { plural, t, tf } from '../content/i18n';

// Экран матча по макету А2 (19.09): поле целиком сверху, под ним стрічка подій як діалог —
// старые строки гаснут и уходят под поле, — сцена (EpisodeCard) или бросок (RollView), внизу
// зона «на кубик»: факторы состояния, которые движок добавит к любому варианту, и сили.
// Тренер и трибуни — маленькие шкалы в углу поля: их место в игре не изменилось, только объём.
//
// **Два стани екрана** (22.09, макет «Лист моменту за згином», решение пользователя): поки лист відкритий
// (сцена з варіантами, вихід з лави, свисток) — поле згорнуте в смужку з великим рахунком і лінією сил, стрічки
// нема; так лист із голосами й варіантами влазить в один екран (плейтест: варіанти регулярно були за згином —
// поле 160 px і стрічка з’їдали половину висоти). Рахунок у смужці великий і кольоровий: він — перше, на що
// дивишся, обираючи форму ризику. Тренер/трибуни, хвилина й тайм у смужці не потрібні (хвилина — на ярлику листа);
// вони повертаються разом із полем після кидка. **Кидок — теж лист** (22.09, плейтест: кубики під стрічкою за згином):
// смужка й без стрічки, поки не натиснуто «далі»; поле повертається зі стрічкою, і розв’язка (finale) грає при монтуванні
// поля — тому поле під час стрічки стоїть за останньою сценою (`pitchEpisode`), а не за «нічим».

/** Кружок форми клубу — та сама схема, що на фішках поля (ui/pitchDirector.ts). */
function Kit({ kit }: { kit?: KitT }) {
  if (!kit) return null;
  const bg = kit.pattern === 'stripes' ? `repeating-linear-gradient(90deg, ${kit.a} 0 2px, ${kit.b} 2px 4px)`
    : kit.pattern === 'hoops' ? `repeating-linear-gradient(0deg, ${kit.a} 0 2px, ${kit.b} 2px 4px)`
    : kit.pattern === 'halves' ? `linear-gradient(90deg, ${kit.a} 4.5px, ${kit.b} 4.5px)`
    : kit.pattern === 'sash' ? `linear-gradient(45deg, ${kit.a} 4.8px, ${kit.b} 4.8px 7.8px, ${kit.a} 7.8px)`
    : kit.a;
  return <i className="strip-kit" style={{ background: bg, ...(kit.pattern === 'trim' ? { boxShadow: `inset 0 0 0 1.5px ${kit.b}` } : {}) }} aria-hidden="true" />;
}

const fmt = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');

/** Факторы, которые относятся к состоянию, а не к варианту: объединение по всем вариантам сцены
 *  без строки атрибута (первая) и без «<голос> веде» (зависит от того, кого слушаешь). При
 *  разных значениях одной подписи (ноги: дорогой/дешёвый вариант) — худшее. */
function stateMods(episode: Episode, state: MatchState, player: Player, conditions: MatchConditions, flagRules: FlagRule[]): ModLine[] {
  const seen = new Map<string, ModLine>();
  for (const o of availableOptions(episode, state, player)) {
    const ctx = computeContext(state, player, o, episode.phase, conditions, flagRules);
    for (const m of ctx.mods.slice(1)) {
      if (m.value === 0 || m.label.includes(t('веде'))) continue;
      const prev = seen.get(m.label);
      if (!prev || m.value < prev.value) seen.set(m.label, m);
    }
  }
  return [...seen.values()];
}

export function MatchScreen({
  state, roster, shown, waiting, onSkip, episode, pitchEpisode, sheetMinute, onBench, player, conditions, flagRules, hideDiceZone, finale, sheet, children,
}: {
  state: MatchState;
  roster: Roster;
  shown: TimelineEvent[];
  waiting: boolean;
  onSkip: () => void;
  /** Текущая сцена — для точки на поле и факторов «на кубик»; null между эпизодами. */
  episode: Episode | null;
  /** Остання сцена — позиція Реєса на полі між листами: розв’язка грає вже після «далі», з місця цієї сцени. */
  pitchEpisode?: Episode | null;
  /** Хвилина відкритого листа (сцена, кидок, вихід): годинник у шапці показує її, а між листами — хвилину
   *  останнього показаного рядка стрічки. Движок уже на 52′, поки стрічка дочитує 9′ (плейтест 21.09, Б-7). */
  sheetMinute?: number;
  /** Реєс ще на лаві за показаною стрічкою — точка стоїть біля тренера, на полі замість нього дублер. */
  onBench?: boolean;
  player: Player;
  conditions: MatchConditions;
  flagRules: FlagRule[];
  /** На экране броска зона «на кубик» прячется: она про следующее решение. */
  hideDiceZone?: boolean;
  /** Лист без епізоду — фінальний свисток (WhistleCard): та сама панель, без зони «на кубик». */
  sheet?: boolean;
  /** Розв’язка на поле — приходит со штампом вердикта (App → RollView.onVerdict). */
  finale?: { kind: FinaleKind; id: number } | null;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const VISIBLE = 4;
  const tape = expanded ? shown : shown.slice(-VISIBLE);
  const hidden = shown.length - tape.length;
  const mods = episode ? stateMods(episode, state, player, conditions, flagRules) : [];
  const insights = episode ? sceneInsights(episode, state, player) : [];
  // Сили — полоса по нижней кромке поля (19.09): сжимается влево, цвет по уровню.
  const stamina = Math.max(0, Math.min(100, state.stamina));
  const clock = sheetMinute ?? (shown.length ? shown[shown.length - 1].minute : state.minute);
  const staminaTone = stamina < 25 ? 'low' : stamina < 50 ? 'mid' : '';
  // Лист відкритий — сцена, кидок, вихід, свисток: поле й стрічка не потрібні, все в один екран.
  const moment = !!episode || !!sheet;
  // Рахунок — за показаною стрічкою, а не за станом рушія (17.10): рушій рахує матч до наступної сцени
  // наперед, і табло показувало гол раніше, ніж поле його розіграло, а стрічка — написала.
  const scoreUs = shown.filter((e) => e.kind === 'goalUs').length;
  const scoreThem = shown.filter((e) => e.kind === 'goalThem').length;
  const scoreTone = scoreUs > scoreThem ? 'lead' : scoreUs < scoreThem ? 'trail' : '';

  // Гул стадіону — поки відкритий матч, і під листами теж: стадіон не затихає, коли Реєс думає.
  useEffect(() => { ambience(true); return () => ambience(false); }, []);
  return (
    <div className="match de-match">
      <Film />

      {/* Смужка рахунку — завжди зверху (17.10): і над листом, і над полем. Кружок біля назви — форма
          клубу, та сама, що на фішках поля. Сили — тонка лінія по нижній кромці; на полі вони ще й кільцем
          навколо фішки Реєса. */}
      <div className="score-strip">
        <span className={`strip-team${roster.us.name.nom.length > 11 ? ' long' : ''}`}><Kit kit={roster.us.kit} />{roster.us.name.nom}</span>
        <b className={`strip-score ${scoreTone}`}>{scoreUs} : {scoreThem}</b>
        <span className={`strip-team r${roster.them.name.nom.length > 11 ? ' long' : ''}`}>{roster.them.name.nom}<Kit kit={roster.them.kit} /></span>
        <div className={`stamina-bar thin ${staminaTone}`} title={tf('сили {0}', Math.round(stamina))} aria-hidden="true"><i style={{ width: `${stamina}%` }} /></div>
      </div>
      {!moment && (
        <Pitch episode={pitchEpisode ?? episode} selfName={roster.us.players.self.nom} strength={conditions.strength} roster={roster} top={conditions.league === 'top'}
          finale={finale} pulse={shown.length ? shown[shown.length - 1] : null}
          // Заміна й червона ставляться кидком сцени — після нього поле вже без Реєса (match.ts: subbed_off / sent_off).
          onBench={onBench || state.flags.includes('subbed_off')} sentOff={state.flags.includes('sent_off')}
          stamina={stamina} momentum={state.momentum} minute={clock} />
      )}

      {!moment && <div className={`tape ${episode || sheet ? 'dimmed' : ''}`}>
        <div className="tape-shade" />
        {hidden > 0 && !expanded && (
          <button className="tape-more" onClick={() => setExpanded(true)}>{Icon.list()} {tf('ще {0} {1}', hidden, plural(hidden, t('подія'), t('події'), t('подій')))}</button>
        )}
        {expanded && <button className="tape-more" onClick={() => setExpanded(false)}>{t('згорнути')}</button>}
        {tape.map((e, i) => {
          const age = tape.length - 1 - i;   // 0 — последняя строка
          return (
            <p key={shown.length - tape.length + i} className={`tape-line kind-${e.kind} age-${Math.min(age, 3)}`}>
              <span className="tape-minute">{e.minute}′</span> — {e.text}
            </p>
          );
        })}
        {state.coachTrust < 30 && (
          <p className="tape-line say say-coach"><b>{t('Тренер')}</b> {t('— дедалі частіше поглядає на брівку: там уже розминаються.')}</p>
        )}
        {waiting && <button className="skip" onClick={onSkip}>{t('далі ⟶')}</button>}
      </div>}

      {/* Карточка момента отделена от таймлайна панелью: сцена, варианты и зона «на кубик» — одно целое.
          Пока эпизода нет (идёт лента), панели нет — пустая рамка с одной шкалой сил читалась как сбой. */}
      {(episode || sheet) && <section className="moment">
      {children}

      {!hideDiceZone && !sheet && <footer className="dice-zone">
        <span className="dice-zone-label">{t('на кубик')}</span>
        <span className="chips">
          {mods.map((m) => (
            <span key={m.label} className={`chip src-${m.source} ${m.value < 0 ? 'neg' : 'pos'}`} title={m.label} aria-label={`${m.label} ${fmt(m.value)}`}>
              <i className="chip-word">{m.short || m.label}</i><span>{fmt(m.value)}</span>
            </span>
          ))}
          {insights.map((v) => (
            <span key={v.who} className={`chip chip-insight voice-${v.who}`} title={tf('{0} бачить', VOICE_LABEL[v.who])}>{Icon.eye()}<span>{t('бачить')}</span></span>
          ))}
          {mods.length === 0 && insights.length === 0 && episode && <span className="chip chip-none">{t('без поправок')}</span>}
        </span>
      </footer>}
      </section>}
    </div>
  );
}
