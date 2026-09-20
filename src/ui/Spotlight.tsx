import { useLayoutEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

// Прожектор (M12, 20.09, макет «Здобутки і підказки», варіант А, решение пользователя): підказка першого
// матчу не абзацом у листі, а пальцем — усе гасне, крім однієї деталі (смуга варіантів, формула кидка,
// колонка голосів, штамп), поруч виноска на кремовому папері з однією кнопкою. Курсив під сетапом
// (перша версія) читався як частина сцени й говорив про дужки, яких на екрані ще не було видно.
//
// Механіка: портал у body — шар затемнення з «діркою» (clip-path evenodd по прямокутнику цілі),
// золота рамка навколо цілі, прозорий блокувальник кліків і виноска. Не box-shadow на цілі: лист
// моменту має overflow: hidden, і затемнення обрізалось би по його краю. Ціль прокручується в центр
// перед виміром; на скрол/ресайз перемірюємо. Затемнення тапом не закривається — тільки «Зрозуміло»:
// інакше тестер закриє, не прочитавши (плейтест «не знайшов кнопки»).

export type HintTarget = 'choices' | 'formula' | 'voices' | 'verdict';
export type Hint = { target: HintTarget; title: string; text: string; step: number; total: number };

type Props = { hint: Hint; target: RefObject<HTMLElement>; onDone: () => void };

/** Слова-ярлики в тексті — у кольорі форми ризику чи голосу, як у дужках і на листі. */
const KEYWORDS: [RegExp, string][] = [
  [/вийшло, але/gi, 'kw-r'], [/упевнено/gi, 'kw-c'], [/ризиковано/gi, 'kw-r'], [/відчайдушно/gi, 'kw-d'], [/Тіло/g, 'kw-body'],
];
function renderText(text: string) {
  const out: (string | JSX.Element)[] = [];
  const re = new RegExp(KEYWORDS.map(([r]) => `(${r.source})`).join('|'), 'gi');
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const cls = KEYWORDS.find(([r]) => new RegExp(r.source, 'i').test(m![0]))?.[1] ?? '';
    out.push(<span key={k++} className={`kw ${cls}`}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Box = { top: number; left: number; width: number; height: number };

export function Spotlight({ hint, target, onDone }: Props) {
  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    const el = target.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
    };
    el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); };
  }, [target, hint.step]);

  if (!box) return null;
  const vh = window.innerHeight;
  const { top, left, width, height } = box;
  // Дірка в затемненні: зовнішній прямокутник за годинниковою, внутрішній — проти (evenodd).
  const clip = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left}px ${top}px, ${left}px ${top + height}px, ${left + width}px ${top + height}px, ${left + width}px ${top}px, ${left}px ${top}px)`;
  const above = top + height / 2 > vh / 2;
  const pos = above ? { bottom: vh - top + 12 } : { top: top + height + 12 };
  return createPortal(
    <div className="spotlight" role="dialog" aria-label={hint.title}>
      <div className="spot-dim" style={{ clipPath: clip }} />
      <div className="spot-ring" style={{ top, left, width, height }} />
      <div className="spot-block" />
      <div className={`spot-callout ${above ? 'above' : 'below'}`} style={pos}>
        <span className="spot-step">{hint.step} / {hint.total}</span>
        <b>{hint.title}</b>
        <p>{renderText(hint.text)}</p>
        <div className="spot-ok">
          <span>{hint.step === 1 ? 'підказки можна вимкнути в налаштуваннях' : ''}</span>
          <button type="button" onClick={onDone}>Зрозуміло</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
