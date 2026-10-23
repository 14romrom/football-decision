// Покриття ісходів постановкою на полі (23.10, питання користувача: «більша частина ісходів сцен не буде
// відповідати анімації»). Для кожного ісходу виділяємо з тексту ключові події — удар, фол, картка, суддя,
// передача партнера, боротьба вгорі, крик, ривок, воротар, стандарт — і перевіряємо, чи показує їх поле:
// шаблон дії Реєса (actions.json) + кінцівка з тексту (action-ends.json) + результат кидка (гол — сам собою).
// Ісход «покритий», якщо показано кожну названу подію. Це межа знизу: «показано» тут — «є чим показати»,
// а не «показано гарно»; очима — `window.__outcome(key)` у #/pitchlab.
//   npx tsx tools/anim-coverage.ts            — частка покритих і що найчастіше не показано
//   npx tsx tools/anim-coverage.ts --list card — ісходи, де не показано цю подію
import { readFileSync } from 'node:fs';

type Outcome = { text: string; apply?: { goal?: boolean; assist?: boolean; teamGoal?: boolean; concede?: boolean; corner?: boolean; foul?: boolean; addFlags?: string[] } };
type Ep = { id: string; options: { id: string; label: string; outcomes: Record<string, Outcome> }[] };
const EPISODES = JSON.parse(readFileSync('src/content/episodes.json', 'utf8')) as Ep[];
const TEMPLATES = (JSON.parse(readFileSync('src/content/actions.json', 'utf8')) as { options: Record<string, string> }).options;
const ENDS = JSON.parse(readFileSync('src/content/action-ends.json', 'utf8')) as Record<string, string>;

const SHOT_END = ['whiff', 'bar', 'post', 'over', 'wide', 'tip', 'held', 'parry', 'block', 'line'];
/** Подія: як упізнати в тексті, чим поле її показує. */
const EVENTS: { id: string; text: RegExp; shown: (t: string, beats: string[], o: Outcome) => boolean }[] = [
  { id: 'card', text: /жовт|червон|картк(?!и)/, shown: (_t, b) => b.includes('card') || b.includes('cardme') },
  { id: 'ref', text: /суддя|судді|арбітр|VAR|екран|свисток|свистить/, shown: (t, b, o) => b.includes('ref') || b.includes('card') || b.includes('cardme') || b.includes('pen') || b.includes('fk') || b.includes('offside') || t === 'foul' || !!o.apply?.foul },
  { id: 'foul', text: /фол|сфол|збива|валить|зносить|підсікає/, shown: (t, b, o) => t === 'foul' || b.includes('fk') || b.includes('pen') || b.includes('card') || b.includes('cardme') || !!o.apply?.foul },
  { id: 'shot', text: /б’є|б'є|удар|пробив|добива|з льоту|черпак/, shown: (t, b, o) => t === 'shot' || t === 'header' || b.some((x) => SHOT_END.includes(x) || x === 'rebound') || !!(o.apply?.goal || o.apply?.assist || o.apply?.teamGoal || o.apply?.concede) },
  { id: 'keeper', text: /воротар/, shown: (t, b, o) => b.some((x) => ['held', 'parry', 'tip', 'line'].includes(x)) || t === 'shot' || !!(o.apply?.goal || o.apply?.concede || o.apply?.assist || o.apply?.teamGoal) },
  { id: 'cross', text: /навіс|простріл|подає|подача/, shown: (t, b) => t === 'cross' || b.includes('cross') },
  { id: 'aerial', text: /головою|у верх|верхом|стрибає|стрибок/, shown: (t, b) => t === 'header' || b.includes('aerial') },
  { id: 'tackle', text: /підкат|відбира|відбір|перехоп|вибива|виносить/, shown: (t, b) => ['tackle', 'mark', 'cover'].includes(t) || b.includes('cut') },
  { id: 'dribble', text: /обігру|обводиш|обвів|прокидає|між ніг|фінт/, shown: (t, b) => t === 'dribble' || b.includes('beat') },
  { id: 'shout', text: /крикн|кричиш|кричить|махаєш|показуєш рукою|жестом/, shown: (t, b) => t === 'talk' || b.includes('shout') },
  { id: 'run', text: /ривок|біжиш|вривається|забігає|наздоган|рвонув/, shown: (t, b) => ['run', 'through', 'mark', 'line'].includes(t) || b.includes('run') },
  // «Без офсайду», «офсайду немає» — заперечення, події нема.
  { id: 'setpiece', text: /кутов|(^|[^а-яіїєґ])аут|(?<!без |від )офсайд(?! (немає|не було|нема))|пенальті/, shown: (_t, b, o) => b.some((x) => ['corner', 'out', 'offside', 'pen', 'ref'].includes(x)) || !!o.apply?.corner },
];

let total = 0, covered = 0;
const missed: Record<string, number> = {}, seen: Record<string, number> = {};
const listWant = process.argv.includes('--list') ? process.argv[process.argv.indexOf('--list') + 1] : null;
const rows: string[] = [];
for (const e of EPISODES) for (const o of e.options) {
  const t = TEMPLATES[`${e.id}/${o.id}`] ?? 'hold';
  for (const [tier, oc] of Object.entries(o.outcomes)) {
    if (!oc) continue;
    total++;
    const s = oc.text.toLowerCase();
    const beats = (ENDS[`${e.id}/${o.id}/${tier}`] ?? '').split(' ').filter(Boolean);
    let ok = true;
    for (const ev of EVENTS) {
      if (!ev.text.test(s)) continue;
      seen[ev.id] = (seen[ev.id] ?? 0) + 1;
      if (!ev.shown(t, beats, oc)) { ok = false; missed[ev.id] = (missed[ev.id] ?? 0) + 1; if (listWant === ev.id) rows.push(`${t.padEnd(8)} ${(beats.join(' ') || '—').padEnd(16)} ${e.id}/${o.id}/${tier}\n    ${oc.text.slice(0, 180)}`); }
    }
    if (ok) covered++;
  }
}
console.log(`ісходів ${total}, усе назване показано: ${covered} (${Math.round((100 * covered) / total)}%)`);
console.log('не показано (з усіх, де подію названо):');
for (const ev of EVENTS) console.log(`  ${ev.id.padEnd(9)} ${String(missed[ev.id] ?? 0).padStart(4)} з ${seen[ev.id] ?? 0}`);
if (listWant) console.log(rows.join('\n'));
