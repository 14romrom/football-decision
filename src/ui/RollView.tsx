import { useEffect, useMemo, useState } from 'react';
import type { EpisodeOption, ModLine, Resolution, ResultBadge } from '../engine/types';
import { VOICE_LABEL } from '../engine/voices';
import { pickOutcome, POSITION_LABEL, TIER_LABEL } from '../engine/resolve';
import { modIcon, Icon } from './icons';
import { motionReduced, readSettings, vibrate } from '../telemetry/settings';

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

type Props = {
  option: EpisodeOption; res: Resolution; flavor?: string; flavorVoice?: string; badges?: ResultBadge[];
  /** Цепочка сработала: куда ведёт сцена — подпись на кнопке. */
  continues?: string;
  onNext: () => void;
};

const fmt = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');
/** Шаги драматургии: время от старта, мс. Чипы — по одному после суммы. */
const T_DIE1 = 900; const T_DIE2 = 1800; const T_SUM = 2100; const T_CHIP = 180; const T_VERDICT = 350; const T_OUTCOME = 400;
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

export function RollView({ option, res, flavor, flavorVoice, badges, continues, onNext }: Props) {
  const mods = useMemo<ModLine[]>(() => res.mods.filter((m, i) => i === 0 || m.value !== 0), [res]);
  // Расписание: 0 — крутятся оба, 1 — первый встал, 2 — второй встал, 3 — сумма,
  // 4..4+n — чипы, потом вердикт, потом исход.
  const schedule = useMemo(() => {
    const t = [0, T_DIE1, T_DIE2, T_SUM];
    for (let i = 0; i < mods.length; i++) t.push(T_SUM + T_CHIP * (i + 1));
    t.push(T_SUM + T_CHIP * mods.length + T_VERDICT);
    t.push(T_SUM + T_CHIP * mods.length + T_VERDICT + T_OUTCOME);
    return t;
  }, [mods]);
  const LAST = schedule.length - 1;
  const S_VERDICT = LAST - 1;
  // «Одразу» в налаштуваннях — кубики стоят с первого кадра, дальше та же драматургия.
  const instant = readSettings().dice === 'instant';
  const [stage, setStage] = useState(instant ? 2 : 0);
  const [spin, setSpin] = useState<[number, number]>([0, 0]);

  useEffect(() => { setStage(instant ? 2 : 0); }, [option.id, res.roll, instant]);
  useEffect(() => { if (stage === S_VERDICT) vibrate(HAPTIC[res.tier] ?? 30); }, [stage, S_VERDICT, res.tier]);
  useEffect(() => {
    if (stage >= LAST) return;
    const t = setTimeout(() => setStage((s) => s + 1), schedule[stage + 1] - schedule[stage]);
    return () => clearTimeout(t);
  }, [stage, schedule, LAST]);
  // Барабан: у каждого кубика свой — первый встаёт на T_DIE1, второй на T_DIE2. Один запуск на
  // бросок, не на стадию: иначе замедление сбрасывалось бы при каждом шаге расписания.
  useEffect(() => {
    if (motionReduced() || instant) { setSpin([0, 0]); return; }
    const stop1 = reel(res.dice[0], T_DIE1, (v) => setSpin((s) => [v, s[1]]));
    const stop2 = reel(res.dice[1], T_DIE2, (v) => setSpin((s) => [s[0], v]));
    return () => { stop1(); stop2(); };
  }, [option.id, res.roll, res.dice, instant]);

  // Один источник истины с applyChoice (resolve.ts:pickOutcome).
  const outcome = pickOutcome(option, res);
  const shownChips = Math.max(0, Math.min(mods.length, stage - 3));
  const running = res.rawRoll + mods.slice(0, shownChips).reduce((s, m) => s + m.value, 0);
  const critBad = res.critical === 'fail' && stage >= 2;
  const [labels, setLabels] = useState(false);

  return (
    <div className="scene roll" onClick={() => setStage(LAST)}>
      <div className={`choice chosen risk-${res.position}`}>
        <span className="choice-text">
          <span className="bracket">[{POSITION_LABEL[res.position]} {res.target}]</span> {option.label}
        </span>
      </div>

      <div className="check-card">
        <div className={`dice-stage ${critBad ? 'crit-bad' : ''}`}>
          <i className={`die ${stage >= 1 ? 'stopped' : 'spinning'}`}>{stage >= 1 ? res.dice[0] : spin[0] || '·'}</i>
          <span className={`dice-sum ${stage >= 3 ? 'shown' : ''}`}>{stage >= 3 ? res.rawRoll : ''}</span>
          <i className={`die ${stage >= 2 ? 'stopped' : 'spinning'}`}>{stage >= 2 ? res.dice[1] : spin[1] || '·'}</i>
        </div>
        {critBad && stage >= 3 && (
          <p className="crit-note">{res.dice[0]} і {res.dice[1]} — на такому ризику це катастрофа, навичка тут не рятує.</p>
        )}
        {res.critical === 'success' && stage >= 3 && <p className="crit-note">Двадцять. Таке не пояснюють.</p>}

        {stage >= 3 && (
          <div className="formula" onClick={(e) => { e.stopPropagation(); setLabels((v) => !v); }}>
            <span className="chips">
              {mods.slice(0, shownChips).map((m, i) => (
                <span key={m.label} className={`chip src-${m.source} ${m.value > 0 ? 'pos' : m.value < 0 ? 'neg' : 'zero'} chip-in`}>
                  {i === 0 ? Icon.target() : modIcon(m.label, m.source)}<span>{fmt(m.value)}</span>
                </span>
              ))}
            </span>
            <span className="formula-total">
              {res.rawRoll} <b>{fmt(running - res.rawRoll)}</b> = <b className="tick">{running}</b>
              {stage >= S_VERDICT && <> проти {res.target}</>}
            </span>
          </div>
        )}
        {stage >= 3 && labels && (
          <ul className="mod-labels">
            {mods.map((m) => <li key={m.label}><span>{m.label}</span><b className={m.value > 0 ? 'pos' : m.value < 0 ? 'neg' : ''}>{fmt(m.value)}</b></li>)}
          </ul>
        )}

        {stage >= S_VERDICT && (
          <div className={`verdict tier-${res.tier}`}>{TIER_LABEL[res.tier]}</div>
        )}

        {stage >= LAST && (
          <div className="after">
            <p className="outcome">{outcome.text}</p>
            {flavor && <p className="say say-second"><b>{flavorVoice ?? 'ТРИБУНИ'}</b> — {flavor}</p>}
            {(option.insight || option.requires?.flags?.some((f) => f.startsWith('week_'))) && (
              <p className="origin-note">
                {option.insight
                  ? <>{VOICE_LABEL[option.insight.who]} побачив цей варіант — без нього кнопки не було б.</>
                  : <>Цей варіант з’явився завдяки тижню між матчами.</>}
              </p>
            )}
            {badges && badges.length > 0 && (
              <ul className="badges">
                {badges.map((b) => (
                  <li key={b.label} className={`badge badge-${b.tone}`}><span className="badge-icon">{b.icon}</span>{b.label}</li>
                ))}
              </ul>
            )}
            {continues && <p className="continues">Момент триває — наступне рішення на цій же хвилині.</p>}
            <button className="primary de-next" onClick={onNext}>{continues ? `Далі → ${continues}` : 'Граємо далі'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
