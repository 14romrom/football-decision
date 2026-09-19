import type { MatchSummary } from '../engine/match';
import type { Roster } from '../engine/names';
import type { BoardMoment } from '../engine/board';
import { FAMILY_SPOT, PHASE_SPOT } from './Pitch';

// Дошка аналітика (19.09, макет «Після матчу», кадр 1Б «магнітна дошка») — итог матча вместо
// протокола с плитками: серо-белая магнитная доска в роздягальні, маркер Neucha (синий — разбор,
// красный — их, чёрный — поле и числа), три момента-магнита на поле там, где шла сцена, записи
// телеграфом из past/recap, оценка тренера крупно, «з трибун» — приклеенная записка, числа
// аналитика без процентов, стёртый прошлый счёт, маркер и губка на полке.

const W = 340; const H = 150; const PAD = 6;
const px = (s: [number, number]): [number, number] => [PAD + s[0] * (W - 2 * PAD), PAD + s[1] * (H - 2 * PAD)];

/** Их голы — маленькие красные магниты у наших ворот; разброс по минуте, чтобы не слипались. */
const wrap = (n: number, m: number) => n - Math.floor(n / m) * m;
const theirGoalSpot = (minute: number): [number, number] => [16 + wrap(minute * 7, 26), 42 + wrap(minute * 13, 66)];

/** Магниты по месту сцены; две сцены одной семьи (два удари з-під штрафного) стояли бы один на другом —
 *  второй уходит на шаг вниз или вверх, куда есть место. */
function placeMagnets(moments: BoardMoment[]): { m: BoardMoment; cx: number; cy: number }[] {
  const placed: { m: BoardMoment; cx: number; cy: number }[] = [];
  for (const m of moments) {
    const spot = (m.family && FAMILY_SPOT[m.family]) || (m.phase && PHASE_SPOT[m.phase]) || [0.5, 0.5];
    const [cx, cy0] = px(spot as [number, number]);
    const free = (y: number) => y > PAD + 9 && y < H - PAD - 9 && !placed.some((p) => Math.hypot(p.cx - cx, p.cy - y) < 20);
    const cy = [0, 22, -22, 44, -44, 66, -66].map((d) => cy0 + d).find(free) ?? cy0;
    placed.push({ m, cx, cy });
  }
  return placed;
}

/** Телеграф: «Пробив з двадцяти метрів — суддя нічого не побачив». Союз и точка recap — в пересказе, не на доске. */
function telegraph(m: BoardMoment): string {
  const past = m.past.charAt(0).toUpperCase() + m.past.slice(1);
  const recap = m.recap.replace(/^(і|й|а|та|але)\s+/i, '').replace(/[.]+$/, '');
  return `${past} — ${recap}`;
}

const fmt = (n: number) => n.toFixed(1).replace('.', ',');

type Props = {
  summary: MatchSummary; roster: Roster; moments: BoardMoment[]; round: number;
  /** Счёт прошлого матча — стёртая надпись под записями. */
  prev?: { us: number; them: number } | null;
  onNext: () => void;
};

export function BoardScreen({ summary, roster, moments, round, prev, onNext }: Props) {
  const st = summary.stats;
  const theirGoals = summary.goals.filter((g) => g.side === 'them');
  const nums: [string, number][] = [
    ...(st.goals > 0 ? [['голів', st.goals] as [string, number]] : []),
    ...(st.assists > 0 ? [['передач', st.assists] as [string, number]] : []),
    ['ключових пасів', st.keyPasses], ['втрат', st.losses], ['єдиноборств', st.duelsWon], ['сили в кінці', summary.staminaLeft],
  ];
  const lost = summary.scoreUs < summary.scoreThem;

  return (
    <div className="board-screen">
      <div className="wb">
        {prev && <div className="wb-ghost" aria-hidden="true">{prev.us}:{prev.them}</div>}
        {/* Правый угол занят запиской «з трибун» — надпись одна, слева. */}
        <div className="wb-top mk black"><span>Роздягальня · розбір · тур {round}</span></div>
        <h1 className="mk">{roster.us.name.nom} <span className={lost ? 'red' : ''}>{summary.scoreUs}:{summary.scoreThem}</span> {roster.them.name.nom}</h1>

        <svg className="wb-pitch" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <defs>
            <filter id="wb-rough"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="4" result="t" /><feDisplacementMap in="SourceGraphic" in2="t" scale="2.4" /></filter>
          </defs>
          <g className="wb-lines" filter="url(#wb-rough)">
            <rect x="6" y="6" width="328" height="138" rx="2" /><line x1="170" y1="6" x2="170" y2="144" /><circle cx="170" cy="75" r="20" />
            <rect x="6" y="38" width="44" height="74" /><rect x="290" y="38" width="44" height="74" /><rect x="6" y="56" width="14" height="38" /><rect x="320" y="56" width="14" height="38" />
          </g>
          {theirGoals.map((g, i) => {
            const [cx, cy] = theirGoalSpot(g.minute + i);
            return <circle key={`t${i}`} className="mag them" cx={cx} cy={cy} r="5" />;
          })}
          {placeMagnets(moments).map(({ m, cx, cy }) => {
            const tone = m.concede || m.role === 'worst' ? 'them' : m.goal ? 'goal' : 'us';
            return (
              <g key={m.role}>
                <circle className={`mag ${tone}`} cx={cx} cy={cy} r="9" />
                <text className="mag-n" x={cx} y={cy + 3}>{m.minute}′</text>
              </g>
            );
          })}
          <text className="wb-dir" x="12" y="140">МИ →</text>
        </svg>

        <ul className="wb-notes mk">
          {moments.map((m) => (
            <li key={m.role} className={m.concede || m.role === 'worst' ? 'red' : ''}>
              <span>{m.minute}′</span><span>{telegraph(m)}{m.concede || m.goal ? `. ${m.score.us}:${m.score.them}` : ''}</span>
            </li>
          ))}
          {moments.length === 0 && <li><span>90′</span><span>Розбирати нема чого — рівний матч</span></li>}
        </ul>

        <div className="wb-rating mk">
          <div className="big black">{fmt(summary.coachRating)}<small>оцінка тренера</small></div>
          <div className="nums black">
            {nums.map(([label, value]) => <span key={label}>{label} — {value}</span>)}
          </div>
        </div>

        <div className="wb-sticky">з трибун<b>{fmt(summary.fanRating)}</b></div>
        <div className="wb-tray" aria-hidden="true" /><div className="wb-pen" aria-hidden="true" /><div className="wb-sponge" aria-hidden="true" />
      </div>
      <button className="primary menu-primary" onClick={onNext}>Далі</button>
    </div>
  );
}
