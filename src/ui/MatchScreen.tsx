import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Film } from './Film';
import type { Episode, FlagRule, MatchState, Player, TimelineEvent } from '../engine/types';
import type { Kit as KitT, Roster } from '../engine/names';
import type { MatchConditions } from '../engine/conditions';
import type { FinaleKind } from '../engine/finale';
import type { ReyesAction } from '../engine/action';
import { sceneSplit } from '../engine/tokens';
import { TokenStack } from './Tokens';
import { Pitch } from './Pitch';
import { ADS } from '../content';
import { periodOfRound } from '../engine/season';
import { floodlit } from './prematch-text';
import type { PitchScene } from './pitchDirector';
import { useEffect } from 'react';
import { matchAudio } from './sound';
import { t, tf } from '../content/i18n';

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

export function MatchScreen({
  state, roster, shown, waiting, onSkip, onReading, onPlayed, cue, episode, pitchEpisode, sheetMinute, onBench, player, conditions, round, seed, flagRules, hideDiceZone, finale, sheet, children,
}: {
  state: MatchState;
  roster: Roster;
  shown: TimelineEvent[];
  waiting: boolean;
  onSkip: () => void;
  /** Гравець гортає стрічку вгору — матч чекає (App не подає нових рядків), повернувся вниз — далі. */
  onReading?: (on: boolean) => void;
  /** Поле доіграло постановку рядка — стрічка може йти далі (App чекає на це, див. PLAY_WAIT_MAX). */
  onPlayed?: (e: TimelineEvent) => void;
  /** Сцена, що ось-ось відкриється (App, передчуття): поле показує її місце до листа. */
  cue?: Episode | null;
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
  /** Тур (як на афіші): місяць вирішує, чи вже темно о часі свистка і чи холодно (M52). */
  round?: number;
  /** Сід матчу — від нього (і хвилини) варіації рухів на полі (M52): перезавантаження покаже те саме. */
  seed?: number;
  flagRules: FlagRule[];
  /** На экране броска зона «на кубик» прячется: она про следующее решение. */
  hideDiceZone?: boolean;
  /** Лист без епізоду — фінальний свисток (WhistleCard): та сама панель, без зони «на кубик». */
  sheet?: boolean;
  /** Розв’язка на поле — приходит со штампом вердикта (App → RollView.onVerdict). */
  finale?: { kind: FinaleKind; id: number; action?: ReyesAction } | null;
  children: ReactNode;
}) {
  // Стрічка — як чат (плейтест 22.10: «хз як вручну почитати/поскролити лог»): уся історія матчу в ній,
  // гортається пальцем; поки гравець читає вище останнього рядка, нові не приходять (App, `reading`), а
  // старі рядки не гаснуть — їх же читають. Кнопки «ще N подій» більше немає: жест, який знає кожен.
  const [reading, setReading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const read = (on: boolean) => { if (on !== reading) { setReading(on); onReading?.(on); } };
  // Висота вікна стрічки — до низу екрана, з місцем під «далі ⟶»: так гортається стрічка, а не сторінка.
  useLayoutEffect(() => {
    const el = scrollRef.current; if (!el) return;
    // Під стрічкою — «далі ⟶» і рядок тренера: їхню висоту міряємо, а не вгадуємо, щоб сторінка не гортилась.
    const fit = () => {
      const r = el.getBoundingClientRect();
      const below = document.documentElement.scrollHeight - (r.bottom + window.scrollY);
      el.style.maxHeight = `${Math.max(130, window.innerHeight - r.top - window.scrollY - below)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });
  // Новий рядок — стрічка внизу, якщо гравець і так був унизу; читає вище — не смикаємо.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [shown.length]);
  const onScroll = () => {
    const el = scrollRef.current; if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 12;
    read(!atBottom.current);
  };
  const skip = () => {
    const el = scrollRef.current;
    if (el) { atBottom.current = true; el.scrollTop = el.scrollHeight; }
    read(false);
    onSkip();
  };
  // Що навколо поля (M52): тільки те, що вже сказано гравцеві — погода з афіші, час свистка з афіші,
  // місяць туру. Іній — у холодні місяці й не під дощем: афіша каже «дощ», і поле не має сперечатися.
  const scene: PitchScene = {
    weather: conditions.weather,
    night: round ? floodlit(round, conditions.venue) : conditions.venue !== 'home',
    cold: !!round && periodOfRound(round) === 'cold' && conditions.weather !== 'rain',
    league: conditions.league === 'top' ? 'top' : 'second',
    boards: ADS.flatMap((a) => (a.title ? [a.title] : [])),
  };
  const tokens = episode ? sceneSplit(episode, state, player, conditions, flagRules).tokens : [];
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
  // Тема меню на матчі поступається гулу і повертається після свистка (коли матч знято з екрана).
  useEffect(() => { matchAudio(true); return () => matchAudio(false); }, []);
  return (
    <div className="match de-match">
      <Film />

      {/* Смужка рахунку — завжди зверху (17.10): і над листом, і над полем. Кружок біля назви — форма
          клубу, та сама, що на фішках поля. Сили — тонка лінія по нижній кромці; на полі вони ще й кільцем
          навколо фішки Реєса. */}
      {/* Господарі зліва, як на будь-якому табло (плейтест 22.10: «табло не показує, виїзд чи домашній»):
          на виїзді «Вальмара» справа, і рахунок теж «їхні : наші». Колір рахунку — як і раніше, за нами. */}
      <div className="score-strip">
        {(() => {
          const away = conditions.venue === 'away';
          const L = away ? roster.them : roster.us, R = away ? roster.us : roster.them;
          return <>
            <span className={`strip-team${L.name.nom.length > 11 ? ' long' : ''}`}><Kit kit={L.kit} />{L.name.nom}</span>
            <b className={`strip-score ${scoreTone}`}>{away ? `${scoreThem} : ${scoreUs}` : `${scoreUs} : ${scoreThem}`}</b>
            <span className={`strip-team r${R.name.nom.length > 11 ? ' long' : ''}`}>{R.name.nom}<Kit kit={R.kit} /></span>
          </>;
        })()}
        <div className={`stamina-bar thin ${staminaTone}`} title={tf('сили {0}', Math.round(stamina))} aria-hidden="true"><i style={{ width: `${stamina}%` }} /></div>
      </div>
      {!moment && (
        <Pitch episode={pitchEpisode ?? episode} selfName={roster.us.players.self.nom} strength={conditions.strength} roster={roster} top={conditions.league === 'top'} scene={scene}
          finale={finale} pulse={shown.length ? shown[shown.length - 1] : null}
          // Заміна й червона ставляться кидком сцени — після нього поле вже без Реєса (match.ts: subbed_off / sent_off).
          onBench={onBench || state.flags.includes('subbed_off')} sentOff={state.flags.includes('sent_off')}
          stamina={stamina} momentum={state.momentum} minute={clock} seed={seed} cue={cue}
          instruction={conditions.instruction} lead={scoreUs - scoreThem} afterBreak={shown[shown.length - 1]?.kind === 'halftime'} secondHalf={shown.some((e) => e.kind === 'halftime')} onPlayed={onPlayed} />
      )}

      {!moment && <div className={`tape ${episode || sheet ? 'dimmed' : ''}${reading ? ' reading' : ''}`}>
        <div className="tape-shade" />
        <div className="tape-scroll" ref={scrollRef} onScroll={onScroll}>
          {shown.map((e, i) => {
            const age = shown.length - 1 - i;   // 0 — последняя строка
            return (
              <p key={i} className={`tape-line kind-${e.kind} age-${Math.min(age, 4)}`}>
                <span className="tape-minute">{e.minute}′</span> — {e.text}
              </p>
            );
          })}
        </div>
        {state.coachTrust < 30 && (
          <p className="tape-line say say-coach"><b>{t('Тренер')}</b> {t('— дедалі частіше поглядає на брівку: там уже розминаються.')}</p>
        )}
        {waiting && <button className="skip" data-swipe="next" onClick={skip}>{t('далі ⟶')}</button>}
      </div>}

      {/* Карточка момента отделена от таймлайна панелью: сцена, варианты и зона «на кубик» — одно целое.
          Пока эпизода нет (идёт лента), панели нет — пустая рамка с одной шкалой сил читалась как сбой. */}
      {(episode || sheet) && <section className="moment">
      {children}

      {/* Лоток «на кубик» (27.10, макет «Жетони на кубик»): жетони сцени — однакові для будь-якого ходу, рівно те,
          що піде в кидок; різниця між ходами вже в цілі на кнопці (engine/tokens.ts). Нульова група не лягає.
          Значка «бачить» тут немає (28.10): варіант від голосу бонусу до кидка не дає, а про нього вже кажуть
          репліка голосу й підпис «відкрив …» на кнопці. */}
      {!hideDiceZone && !sheet && <footer className="dice-zone tk-tray" aria-label={t('на кубик')}>
        {tokens.map((tk) => <TokenStack key={tk.group} token={tk} />)}
        {tokens.length === 0 && episode && <span className="chip chip-none">{t('без поправок')}</span>}
      </footer>}
      </section>}
    </div>
  );
}
