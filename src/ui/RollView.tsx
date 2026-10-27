import { useEffect, useMemo, useRef, useState } from 'react';
import { Spotlight, type Hint } from './Spotlight';
import type { EpisodeOption, ModLine, Resolution, ResultBadge } from '../engine/types';
import type { Token } from '../engine/tokens';
import { SkillCoin, TokenStack } from './Tokens';
import { VOICE_LABEL } from '../engine/voices';
import { pickOutcome, POSITION_LABEL, TIER_LABEL } from '../engine/resolve';
import { motionReduced, readSettings, vibrate } from '../telemetry/settings';
import { sfxCoin, sfxDie, sfxReel, sfxStamp } from './sound';
import { t, tf } from '../content/i18n';

// Кидок і результат (правка 19.09 после первой версии Г: «дубли и сложно»). Карточка строится
// вокруг кубиков — ключевой зоны азарта: цифры бегут барабаном, первый кубик останавливается
// раньше, второй — позже, чем ждёшь; потом сумма, поправки прилетают чипами и итог тикает,
// вердикт впечатывается штампом, и только затем текст исхода. Баннера атрибута и заголовка
// формы нет — они уже в полосе выбора; таблицы факторов нет — чипы, подписи по тапу.
// Подсказка «потрібно N+» под вторым кубиком отвергнута пользователем — лишнее число.
//
// Барабан — с «почти» (near-miss из гемблинга, 19.09): перед остановкой кубик замедляется и
// проходит через грани выше итоговой, чтобы девятка мелькнула перед семёркой. Случайные грани
// до этого — шум, азарт делают ожидание, раздельная остановка и штамп после суммы. Поэтому при
// prefers-reduced-motion барабана нет (пустые грани), а тайминги те же: убираем мельтешение,
// не драматургию.
//
// Жетони (27.10, макет «Жетони на кубик», анімація «політ у суму»): після суми кубиків монета навички й
// жетони сцени по черзі злітають у число, воно відлічує по одиниці, монета дзенькає (плюс вище, мінус
// глухіше). Ціль — із поправками ходу, та сама, що на кнопці; жетони — ті самі, що лежали на лотку.
// Пауза перед штампом довша (650 мс): після рахунку штамп не наступає на останній жетон.

type Props = {
  option: EpisodeOption; res: Resolution; flavor?: string; flavorVoice?: string; badges?: ResultBadge[];
  /** Цепочка сработала: куда ведёт сцена — подпись на кнопке. */
  /** Ім'я наступної ланки для підпису кнопки; без імені кнопка каже просто «Далі». */
  continues?: string;
  /** Ланцюжок триває (наступне рішення на цій же хвилині) — навіть якщо імені ланки немає. */
  chained?: boolean;
  onNext: () => void;
  /** Штамп вердикта появился — поле разыгрывает розв’язку (App → Pitch). */
  onVerdict?: () => void;
  /** Підказка-прожектор (перший матч, M12): formula — після жетонів, verdict — штамп з ісходом; обидві — коли все показано. */
  hint?: Hint;
  /** Жетони сцени — ті, що лежали на лотку «на кубик» (engine/tokens.ts). */
  tokens: Token[];
  /** Поправки ходу, що сидять у цілі: ціль на екрані = ціль форми − shift (як на кнопці). */
  shift: number;
  /** Поправки сцени рядками — розбір по тапу. */
  scene: ModLine[];
};

const fmt = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');
/** Шаги драматургии: время от старта, мс. Чипы — по одному после суммы. */
const T_DIE1 = 900; const T_DIE2 = 1800; const T_SUM = 2100; const T_VERDICT = 650; const T_OUTCOME = 400;
/** Жетон: політ у суму, потім відлік по одиниці і коротка пауза. */
const T_FLY = 480; const T_TICK = 70; const T_GAP = 110;
const itemTime = (v: number) => T_FLY + T_TICK * Math.abs(v) + T_GAP;
/** Грань d10 по кругу: 11 → 1, 0 → 10 (без оператора остатка — тест «никаких процентов» ищет «%»). */
const wrap = (v: number) => (v > 10 ? v - 10 : v < 1 ? v + 10 : v);
/** Барабан одного кубика: до `stopAt` мс случайные грани каждые 70 мс, в последние полсекунды —
 *  замедление через две соседние грани: сверху (`final+2`, `final+1` — девятка мелькнула перед
 *  семёркой), а для 9 и 10, где выше некуда, снизу — барабан «дотягивает». */
function reel(final: number, stopAt: number, set: (v: number) => void): () => void {
  const start = Date.now();
  const dir = final <= 8 ? 1 : -1;
  let t: ReturnType<typeof setTimeout>;
  const tick = () => {
    const left = stopAt - (Date.now() - start);
    if (left <= 0) return;
    if (left > 520) { set(1 + Math.floor(Math.random() * 10)); t = setTimeout(tick, 70); return; }
    if (left > 260) { set(wrap(final + 2 * dir)); t = setTimeout(tick, Math.min(left - 260 + 1, 260)); return; }
    set(wrap(final + dir)); t = setTimeout(tick, left);
  };
  tick();
  return () => clearTimeout(t);
}
/** Вибрация по вердикту (Налаштування → «Вібрація на штампі»). */
const HAPTIC: Record<string, number | number[]> = { clean: 30, cost: [20, 40, 20], fail: 60, badFail: [80, 40, 80] };

/** Цвет подписи второй реплики — как у голоса на листе; тренер и трибуны — своими цветами. */
const FLAVOR_CLASS: Record<string, string> = {
  [t('ЕГО')]: 'voice-ego', [t('КОМАНДА')]: 'voice-team', [t('СПОКІЙ')]: 'voice-composure', [t('БАЧЕННЯ')]: 'voice-vision', [t('ІНСТИНКТ')]: 'voice-instinct', [t('ТІЛО')]: 'voice-body',
  [t('ТРЕНЕР')]: 'say-coach', [t('ТРИБУНИ')]: 'say-fans',
};

export function RollView({ option, res, flavor, flavorVoice, badges, continues, chained = false, onNext, onVerdict, hint, tokens, shift, scene }: Props) {
  const formulaRef = useRef<HTMLDivElement>(null);
  const verdictRef = useRef<HTMLDivElement>(null);
  const [hintOpen, setHintOpen] = useState(true);
  // Монети кидка: спершу навичка, далі жетони сцени.
  const items = useMemo(() => [res.attrMod, ...tokens.map((tk) => tk.value)], [res.attrMod, tokens]);
  const target = res.target - shift;
  const final = res.rawRoll + items.reduce((s, v) => s + v, 0);
  // Расписание: 0 — крутятся оба, 1 — первый встал, 2 — второй встал, 3 — сумма,
  // 4..4+n — монети по одній, потом вердикт, потом исход.
  const schedule = useMemo(() => {
    const t = [0, T_DIE1, T_DIE2, T_SUM];
    let at = T_SUM + 300;
    for (const v of items) { t.push(at); at += itemTime(v); }
    t.push(at - T_GAP + T_VERDICT);
    t.push(at - T_GAP + T_VERDICT + T_OUTCOME);
    return t;
  }, [items]);
  const LAST = schedule.length - 1;
  const S_VERDICT = LAST - 1;
  // «Одразу» в налаштуваннях — кубики стоят с первого кадра, дальше та же драматургия.
  const instant = readSettings().dice === 'instant';
  const [stage, setStage] = useState(instant ? 2 : 0);
  const [spin, setSpin] = useState<[number, number]>([0, 0]);

  useEffect(() => { setStage(instant ? 2 : 0); }, [option.id, res.roll, instant]);
  // Критический успех (две десятки) — свой штамп, своя вибрация; движок уже даёт ему крит-исход (pickOutcome).
  const critGood = res.critical === 'success';
  useEffect(() => {
    if (stage < S_VERDICT) return;
    if (stage === S_VERDICT || stage === LAST) { vibrate(critGood ? [30, 40, 30, 40, 70] : (HAPTIC[res.tier] ?? 30)); sfxStamp(res.tier, critGood); onVerdict?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage >= S_VERDICT]);
  // Звук кубиків іде за тим самим розкладом, що й картинка: кожен кубик стукає, коли встає. «Одразу» —
  // обидва стоять із першого кадру, тож і стук один подвійний, без барабана.
  useEffect(() => {
    if (!instant && (stage === 1 || stage === 2)) sfxDie();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);
  useEffect(() => {
    if (instant) { sfxDie(); setTimeout(sfxDie, 90); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option.id, res.roll]);
  useEffect(() => {
    if (stage >= LAST) return;
    const t = setTimeout(() => setStage((s) => s + 1), schedule[stage + 1] - schedule[stage]);
    return () => clearTimeout(t);
  }, [stage, schedule, LAST]);
  // Штамп і вихід — у кадр. На 812 px блок `.after` починався з y≈850: sticky-кнопка не піднімається вище
  // свого контейнера, і новачок після кидка бачив «нічого не сталося» (плейтест 21.09, Б-1). Прожектор на
  // формулу/штамп скролить сам — йому не заважаємо.
  useEffect(() => {
    if (stage < LAST || (hint && hintOpen && (hint.target === 'formula' || hint.target === 'verdict'))) return;
    verdictRef.current?.scrollIntoView({ block: 'start', behavior: motionReduced() ? 'instant' as ScrollBehavior : 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage >= LAST]);
  // Барабан: у каждого кубика свой — первый встаёт на T_DIE1, второй на T_DIE2. Один запуск на
  // бросок, не на стадию: иначе замедление сбрасывалось бы при каждом шаге расписания.
  useEffect(() => {
    if (motionReduced() || instant) { setSpin([0, 0]); return; }
    sfxReel(T_DIE2 / 1000);
    const stop1 = reel(res.dice[0], T_DIE1, (v) => setSpin((s) => [v, s[1]]));
    const stop2 = reel(res.dice[1], T_DIE2, (v) => setSpin((s) => [s[0], v]));
    return () => { stop1(); stop2(); };
  }, [option.id, res.roll, res.dice, instant]);

  // Політ монети в суму і відлік (анімація «політ у суму»). Стадія 4+i — монета i злітає; число
  // відлічує після приземлення. Тап по екрану (setStage(LAST)) — одразу підсумок.
  const coinRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const totalRef = useRef<HTMLElement>(null);
  const [running, setRunning] = useState(res.rawRoll);
  const [ticking, setTicking] = useState(false);
  const item = stage - 4;
  useEffect(() => {
    if (stage < 3) { setRunning(res.rawRoll); return; }
    if (stage >= S_VERDICT) { setRunning(final); setTicking(false); return; }
    if (item < 0 || item >= items.length) return;
    const v = items[item];
    const from = res.rawRoll + items.slice(0, item).reduce((s, x) => s + x, 0);
    setRunning(from);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const reduced = motionReduced();
    const coin = coinRefs.current[item], total = totalRef.current;
    if (!reduced && coin && total) {
      const a = coin.getBoundingClientRect(), b = total.getBoundingClientRect();
      const fly = coin.cloneNode(true) as HTMLElement;
      fly.classList.add('tk-flyer');
      Object.assign(fly.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
      fly.style.setProperty('--pile', '0 0 0 transparent');
      document.body.appendChild(fly);
      const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      fly.animate([
        { transform: 'none' },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(1.15)`, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(.5)`, opacity: 0.2 },
      ], { duration: T_FLY, easing: 'cubic-bezier(.4,0,.2,1)' }).finished.then(() => fly.remove(), () => fly.remove());
      timers.push(setTimeout(() => fly.remove(), T_FLY + 50));
    }
    const land = reduced ? 0 : T_FLY;
    timers.push(setTimeout(() => sfxCoin(item === 0 ? 'skill' : v > 0 ? 'plus' : 'minus'), land));
    const step = v > 0 ? 1 : -1;
    for (let i = 1; i <= Math.abs(v); i++) {
      timers.push(setTimeout(() => { setRunning(from + step * i); setTicking(true); }, land + T_TICK * i));
    }
    timers.push(setTimeout(() => setTicking(false), land + T_TICK * Math.abs(v) + 40));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Один источник истины с applyChoice (resolve.ts:pickOutcome).
  const outcome = pickOutcome(option, res);
  const critBad = res.critical === 'fail' && stage >= 2;
  const [labels, setLabels] = useState(false);
  const spent = (i: number) => stage >= S_VERDICT || i < item || (i === item && stage >= 4);

  return (
    <div className="scene roll" onClick={() => setStage(LAST)}>
      <div className={`choice chosen risk-${res.position}`}>
        <span className="choice-text">
          {option.label}
          <span className="bracket">[{POSITION_LABEL[res.position]} {target}]</span>
        </span>
      </div>

      <div className="check-card">
        <div className={`dice-stage ${critBad ? 'crit-bad' : ''} ${critGood && stage >= 2 ? 'crit-good' : ''}`}>
          <i className={`die ${stage >= 1 ? 'stopped' : 'spinning'}`}>{stage >= 1 ? res.dice[0] : spin[0] || '·'}</i>
          <span className={`dice-sum ${stage >= 3 ? 'shown' : ''}`}>{stage >= 3 ? res.rawRoll : ''}</span>
          <i className={`die ${stage >= 2 ? 'stopped' : 'spinning'}`}>{stage >= 2 ? res.dice[1] : spin[1] || '·'}</i>
        </div>
        {critBad && stage >= 3 && (
          <p className="crit-note">{tf('{0} і {1} — на такому ризику це катастрофа, навичка тут не рятує.', res.dice[0], res.dice[1])}</p>
        )}
        {res.critical === 'success' && stage >= 3 && <p className="crit-note">{t('Двадцять. Таке не пояснюють.')}</p>}

        {stage >= 3 && (
          <div className="roll-tray" ref={formulaRef} onClick={(e) => { e.stopPropagation(); setLabels((v) => !v); }}>
            <div className="roll-total"><b ref={totalRef} className={ticking ? 'tick' : ''}>{running}</b><span>{tf('ціль {0}', target)}</span></div>
            <div className="tk-tray">
              <SkillCoin attribute={option.attribute} value={res.attrMod} spent={spent(0)} coinRef={(el) => { coinRefs.current[0] = el; }} />
              {tokens.map((tk, i) => <TokenStack key={tk.group} token={tk} spent={spent(i + 1)} coinRef={(el) => { coinRefs.current[i + 1] = el; }} />)}
            </div>
          </div>
        )}
        {stage >= 3 && labels && (
          <ul className="mod-labels">
            {[res.mods[0], ...scene].map((m) => <li key={m.label}><span>{m.label}</span><b className={m.value > 0 ? 'pos' : m.value < 0 ? 'neg' : ''}>{fmt(m.value)}</b></li>)}
          </ul>
        )}

        <div ref={verdictRef}>
        {stage >= S_VERDICT && (
          <div className={`verdict tier-${res.tier} ${critGood ? 'crit' : ''}`}>{critGood ? t('Критичний успіх') : TIER_LABEL[res.tier]}</div>
        )}

        {stage >= LAST && (
          <div className="after">
            <p className="outcome">{outcome.text}</p>
            {flavor && (() => {
              // Ключ FLAVOR_CLASS — перекладена назва голосу (CLAUDE.md, M47): і сам голос, і ключ
              // мапи беруться з того самого t(), інакше англійський голос не знайде свій колір.
              const who = flavorVoice ?? t('ТРИБУНИ');
              return <p className={`say say-second ${FLAVOR_CLASS[who] ?? ''}`}><b>{who}</b>{tf(' — {0}', flavor)}</p>;
            })()}
            {(option.insight || option.requires?.flags?.some((f) => f.startsWith('week_'))) && (
              <p className="origin-note">
                {option.insight
                  ? <>{tf('{0} побачив цей варіант — без нього кнопки не було б.', VOICE_LABEL[option.insight.who])}</>
                  : <>{t('Цей варіант з’явився завдяки тижню між матчами.')}</>}
              </p>
            )}
            {badges && badges.length > 0 && (
              <ul className="badges">
                {badges.map((b) => (
                  <li key={b.label} className={`badge badge-${b.tone}`}><span className="badge-icon">{b.icon}</span>{b.label}</li>
                ))}
              </ul>
            )}
            {(chained || continues) && <p className="continues">{t('Момент триває — наступне рішення на цій же хвилині.')}</p>}
            <button className="primary de-next" onClick={onNext}>{continues ? tf('Далі → {0}', continues) : chained ? t('Далі') : t('Граємо далі')}</button>
          </div>
        )}
        </div>
      </div>
      {hint && hintOpen && stage >= LAST && (hint.target === 'formula' || hint.target === 'verdict') && (
        <Spotlight hint={hint} target={hint.target === 'formula' ? formulaRef : verdictRef} onDone={() => setHintOpen(false)} />
      )}
    </div>
  );
}
