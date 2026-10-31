import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Kit } from '../engine/names';
import { motionReduced } from '../telemetry/settings';
import { t, tf } from '../content/i18n';

// Табло матчу (31.10, макет «Табло матчу»; плейтест: «у вікні події іноді не видно хвилини»). Розміщення —
// як на табло трансляцій: команди на крилах, хвилина й рахунок у плашці по центру, плашка попереду крил.
// Зібране з того, що в грі вже є: крило — основний колір форми клубу (другий колір — смугою-кантом на
// зовнішньому краю, назва — кольором номера, як на фішці поля), плашка — папір листа сцени з глибиною
// жетона «на кубик», перерва й фінал — штампом, основа — полоса сил. Рахунок завжди білий (рішення
// користувача: колір за станом матчу відкинуто). Табло закріплене згори (`.sb-pin`): лист сцени, прокручений
// до варіантів, їде під ним, і хвилина лишається на місці.
//
// Хвилина біжить (варіант 1 того ж макета): новий рядок стрічки — число пробігає до його хвилини не довше
// ніж за 0,6 с, хоч на 3, хоч на 15 хвилин; штрих мигає, поки йде стрічка, і стоїть, поки відкритий лист —
// час на паузі, хід за тобою. Справжніх секунд немає навмисно: ігровий час не неперервний, і годинник, що
// йде, поки читаєш, а потім стрибає, читався б як помилка.

/** Хвилина як у футболі: перша — 1′ (у стрічці стартовий свисток на нульовій), після 90-ї — 90+N′. */
export const clockLabel = (m: number) => (m > 90 ? `90+${m - 90}′` : `${Math.max(1, m)}′`);

/** Пробіг хвилин до нової: уперед — по одній, назад чи «менше руху» — одразу. Під штампом перерви годинник
 *  уже на 46′: другий тайм починається з неї, а не з 45′, що на мить виринала після штампа. */
function useRunningMinute(target: number, halfTime: boolean): number {
  const [shown, setShown] = useState(target);
  const at = useRef(target);
  useEffect(() => { if (halfTime) { at.current = 46; setShown(46); } }, [halfTime]);
  useEffect(() => {
    const from = at.current;
    if (target <= from || motionReduced()) { at.current = target; setShown(target); return; }
    const n = target - from, dt = Math.min(70, 600 / n);
    const timers = Array.from({ length: n }, (_, i) => setTimeout(() => { at.current = from + i + 1; setShown(from + i + 1); }, dt * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [target]);
  return shown;
}

type Side = { name: string; kit?: Kit };

function Wing({ side, at }: { side: Side; at: 'l' | 'r' }) {
  const a = side.kit?.a ?? '#3a353e';
  const b = side.kit?.b ?? a;
  const style = {
    '--k': a,
    '--edge': b.toLowerCase() === a.toLowerCase() ? `color-mix(in srgb, ${a} 60%, #000)` : b,
    color: side.kit?.num ?? 'var(--cream)',
  } as CSSProperties;
  // Довга назва (понад десять знаків: «Сьєрра-Бланка», «Porto Blanco») — у два рядки по дефісу чи пробілу.
  return <span className={`sb-wing ${at}${side.name.length > 10 ? ' long' : ''}`} style={style}><b>{side.name}</b></span>;
}

export function Scoreboard({ left, right, score, minute, live, stamp, stamina }: {
  left: Side; right: Side;
  /** Рахунок у порядку крил: господарі зліва. */
  score: [number, number];
  minute: number;
  /** Стрічка йде — штрих мигає. */
  live: boolean;
  /** Перерва чи фінал — штамп замість хвилини. */
  stamp?: 'half' | 'full';
  stamina: number;
}) {
  const shown = useRunningMinute(minute, stamp === 'half');
  const tone = stamina < 25 ? 'low' : stamina < 50 ? 'mid' : '';
  const label = clockLabel(shown);
  return (
    <div className="sb">
      <Wing side={left} at="l" />
      <span className={`sb-plate${live ? ' live' : ''}`}>
        {stamp
          ? <span className="sb-stamp">{stamp === 'half' ? t('Перерва') : t('Фінал')}</span>
          : <small className="sb-clock">{label.slice(0, -1)}<span className="sb-prime">′</span></small>}
        <b className="sb-score">{score[0]}<i>:</i>{score[1]}</b>
      </span>
      <Wing side={right} at="r" />
      <span className={`sb-shelf ${tone}`} title={tf('сили {0}', Math.round(stamina))} aria-hidden="true"><i style={{ width: `${stamina}%` }} /></span>
    </div>
  );
}
