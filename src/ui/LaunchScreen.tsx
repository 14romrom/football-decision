import { useEffect, useRef, useState } from 'react';
import { Film } from './Film';
import { readSettings } from '../telemetry/settings';
import { activeSlot } from '../telemetry/slots';
import { t, tf } from '../content/i18n';

// Екран запуску (16.10, референс користувача — кінетика на темному). Перший кадр гри: два кубики
// дрижать і лягають, поверх них впечатується назва, далі все розчиняється в титул.
//
// Три рішення, і кожне має причину.
//
// **Складено з гри, не з чужого словника.** Кубики — ті самі `.die`, що в `RollView`: та сама
// геометрія, та сама дрож, те саме приземлення зі `scale(1.25)`, грані перебираються, поки кубик не
// став. Плівка по краях — той самий `Film` із тими самими підписами, що на титулі, тому при
// розчиненні рамка не сіпається: вона просто лишається на місці, а всередині неї міняється кадр.
//
// **Тексту, крім назви, немає** (рішення користувача). Перший варіант цитував головне речення гри —
// те саме, що через секунду читається на титулі цілком; виходило заїкання, а не враження.
//
// **Площі штрафного тут не малюємо**, хоча вона є в логотипі: інакше титул показував би те саме
// вдруге. Так він читається як «улігся» кадр того, що щойно сталося.
//
// Затримка тут **навмисна**: гра вантажиться з локальних файлів за частки секунди, і без паузи
// екран ніхто не встигне побачити. Рішення користувача 16.10: «у гравця має бути емоція при
// запуску». При «Менше руху» анімації немає — лишається останній кадр і те саме розчинення.

/** Моменти збігаються з `.launch-*` у styles.css: правити треба обидва разом. */
const STOP_A = 600, STOP_B = 840, HOLD = 1900, FADE = 420;
const REEL_TICK = 60;

const face = () => 1 + Math.floor(Math.random() * 10);

type Props = { onDone: () => void };

export function LaunchScreen({ onDone }: Props) {
  const calm = readSettings().reduceMotion;
  // Грані кидаємо один раз при монтуванні: клас дубля має стояти ще до старту анімації.
  const [roll] = useState(() => [face(), face()]);
  const [shown, setShown] = useState<(number | string)[]>(calm ? roll : ['·', '·']);
  const [out, setOut] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const add = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    if (!calm) {
      // Перебір граней, як `reel` у RollView: кубик крутиться, поки не настав його момент.
      const reel = window.setInterval(() => setShown([face(), face()]), REEL_TICK);
      timers.current.push(reel);
      add(() => setShown((s) => [roll[0], s[1]]), STOP_A);
      add(() => { window.clearInterval(reel); setShown(roll); }, STOP_B);
    }
    add(() => setOut(true), calm ? HOLD - 700 : HOLD);
    add(onDone, (calm ? HOLD - 700 : HOLD) + FADE);
    return () => { timers.current.forEach((id) => { window.clearTimeout(id); window.clearInterval(id); }); };
  }, [calm, roll, onDone]);

  // Дубль — кубики лягають золотом (`--v-instinct`, як на криті в матчі). Кидок при цьому чесний:
  // дубль на двох d10 випадає раз на десять, і підкручувати нічого не треба.
  const crit = roll[0] === roll[1];

  return (
    <div className={`launch${out ? ' out' : ''}${crit ? ' crit' : ''}${calm ? ' calm' : ''}`} aria-label="Inside the Box">
      <Film labels={{ left: [0, 1, 2].map((d) => `01A0${d}`), right: ['Inside the Box', t('тестова'), tf('слот {0}', activeSlot() + 1)] }} />
      <div className="launch-dice">
        <i className="die launch-die-a">{shown[0]}</i>
        <i className="die launch-die-b">{shown[1]}</i>
      </div>
      <div className="launch-name">
        <span className="launch-kicker">Inside the</span>
        <span className="launch-box">BOX</span>
      </div>
    </div>
  );
}
