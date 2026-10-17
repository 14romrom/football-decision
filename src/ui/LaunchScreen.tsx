import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Film } from './Film';
import { Logo } from './Logo';
import { readSettings } from '../telemetry/settings';
import { titleFilmLabels } from './TitleScreen';
import { sfxLaunch } from './sound';

// Екран запуску «Звук першим» (17.10, макет «Заставка „Звук первым“», варіант А; затверджено
// з поправкою «на секунду довше»). Задача заставки — не показати логотип, а задати тон і стати
// ритуалом: перші секунди гру чути, а не видно. Гул трибуни здалеку, барабан і два стуки кубиків —
// той самий звук, що в кожному кидку матчу, тому він повторюється і запам'ятовується, — удар штампа,
// і назва впечатується в кадр. Далі кадр сам стає титулом: підкладка заставки гасне, крізь неї
// проявляється справжній титул, логотип заставки їде точно на місце свого двійника, меню піднімається.
//
// Показується тільки при запуску з іконки (`launched` в App), не при переходах усередині сесії.
// Тап у будь-який момент — одразу титул. Без звуку (вимкнені «Звуки» або браузер не дав грати без
// дотику) — та сама заставка, але кубики більші й телефон дрижить у такт: штамп відчувається долонею.
// «Менше руху» — без барабана й тряски: штамп і розчинення.

/** Розклад, мс. Звук у `sfxLaunch` стоїть на тих самих моментах — правити обидва разом. */
const T = { dice: 1600, dieA: 2600, dieB: 2900, stamp: 3300, reveal: 3700, settle: 4700, done: 5800 };
const CALM = { stamp: 300, reveal: 700, settle: 1200, done: 2000 };
const REEL_TICK = 60;

const face = () => 1 + Math.floor(Math.random() * 10);

type Props = { onDone: () => void };

export function LaunchScreen({ onDone }: Props) {
  const calm = readSettings().reduceMotion;
  const [roll] = useState(() => [face(), face()]);
  const [shown, setShown] = useState<(number | string)[]>(['·', '·']);
  const [stage, setStage] = useState<'dark' | 'dice' | 'a' | 'b' | 'stamp' | 'reveal' | 'settle'>(calm ? 'stamp' : 'dark');
  const [silent, setSilent] = useState(false);
  const [target, setTarget] = useState<{ top: number; left: number; width: number } | null>(null);
  const timers = useRef<number[]>([]);
  const finished = useRef(false);
  /** Скільки кубиків уже лягло: барабан перебирає грані лише тих, що ще котяться. */
  const stopped = useRef(0);

  // Поки йде заставка, логотип і меню титулу сховані — їх «приносить» заставка.
  useLayoutEffect(() => {
    document.documentElement.classList.add('launching');
    const el = document.querySelector('.title-logo .logo');
    if (el) { const r = el.getBoundingClientRect(); setTarget({ top: r.top, left: r.left, width: r.width }); }
    return () => document.documentElement.classList.remove('launching');
  }, []);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    timers.current.forEach((id) => { window.clearTimeout(id); window.clearInterval(id); });
    document.documentElement.classList.remove('launching');
    onDone();
  };

  useEffect(() => {
    const add = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* немає мотора */ } };
    if (calm) {
      const played = sfxLaunch(true);
      if (!played) buzz(70);
      setShown(roll);
      add(() => setStage('reveal'), CALM.reveal);
      add(() => setStage('settle'), CALM.settle);
      add(finish, CALM.done);
    } else {
      const played = sfxLaunch(false);
      setSilent(!played);
      add(() => {
        setStage('dice');
        const reel = window.setInterval(() => setShown([stopped.current >= 1 ? roll[0] : face(), face()]), REEL_TICK);
        timers.current.push(reel);
        if (!played) for (let i = 0; i < 8; i++) add(() => buzz(6), i * 125);
        add(() => { stopped.current = 1; setStage('a'); if (!played) buzz(18); }, T.dieA - T.dice);
        add(() => { window.clearInterval(reel); setStage('b'); setShown(roll); if (!played) buzz(18); }, T.dieB - T.dice);
      }, T.dice);
      add(() => { setStage('stamp'); if (!played) buzz(70); }, T.stamp);
      add(() => setStage('reveal'), T.reveal);
      add(() => setStage('settle'), T.settle);
      add(finish, T.done);
    }
    return () => { timers.current.forEach((id) => { window.clearTimeout(id); window.clearInterval(id); }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stamped = stage === 'stamp' || stage === 'reveal' || stage === 'settle';
  // Логотип: до переїзду — по центру на 42 % висоти, тієї ж ширини, що на титулі; на `settle` — на місці двійника.
  const w = target?.width ?? Math.min(window.innerWidth - 64, 330);
  const h = w * 118 / 300;
  const logoStyle = {
    width: w,
    left: target?.left ?? (window.innerWidth - w) / 2,
    top: stage === 'settle' && target ? target.top : window.innerHeight * 0.42 - h / 2,
  };
  const crit = roll[0] === roll[1];

  return (
    <div
      className={`launch is-${stage}${silent ? ' silent' : ''}${calm ? ' calm' : ''}${crit ? ' crit' : ''}`}
      onClick={finish}
      aria-label="Inside the Box"
    >
      <div className="launch-ground" />
      <Film labels={titleFilmLabels()} />
      <div className="launch-dice" aria-hidden="true">
        <i className={`die launch-die${stage === 'a' || stage === 'b' ? ' stop' : ''}`}>{shown[0]}</i>
        <i className={`die launch-die${stage === 'b' ? ' stop' : ''}`}>{shown[1]}</i>
      </div>
      <div className={`launch-logo${stamped ? ' on' : ''}`} style={logoStyle}><Logo id="launch-logo" /></div>
    </div>
  );
}
