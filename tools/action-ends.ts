// Кінцівка дії Реєса за текстом ісходу (M52, 19.10). Шаблон руху (tools/actions.ts) каже, ЩО робить
// Реєс — б'є, віддає, обводить; ярус кидка — вийшло чи ні. Але ісход називає більше: «у перекладину,
// і {cb} добиває», «кінчиками на кутовий», «в стінку і в аут», «прапорець угору». Поле має показувати
// саме це, бо інакше гравець читає одне, а бачить інше (фідбек 19.10: «бачиш схематично наслідки своїх
// дій, а не лише текстом»). Розмічати 2440 ісходів руками не будемо — інструмент виводить із тексту
// короткий ланцюжок подій (`ACTION_BEATS`) по реченнях, у порядку, в якому їх називає текст.
// **Правило: поле показує лише те, що є в тексті.** Нема слова — нема події, кінцівку вирішує ярус.
//
// Виводимо з української бази й заздалегідь, як шаблони: в англійській збірці слів уже немає.
// Результат — src/content/action-ends.json; де автомат помилився — src/content/action-ends-override.json
// (рядок подій або "" — «нічого не показувати понад ярус»), переживає перегенерацію.
//
//   npx tsx tools/action-ends.ts               — перегенерувати й показати розподіл
//   npx tsx tools/action-ends.ts --list post   — усі ісходи з подією (для перевірки очима)

import { maskNoCard } from './card-words';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ACTION_BEATS, type ActionBeat } from '../src/engine/action';

type Outcome = { text: string; apply?: { corner?: boolean; goal?: boolean; teamGoal?: boolean; assist?: boolean } };
type Opt = { id: string; outcomes: Record<string, Outcome> };
type Ep = { id: string; options: Opt[] };

const EPISODES = JSON.parse(readFileSync('src/content/episodes.json', 'utf8')) as Ep[];
const TEMPLATES = (JSON.parse(readFileSync('src/content/actions.json', 'utf8')) as { options: Record<string, string> }).options;
const OVERRIDE_PATH = 'src/content/action-ends-override.json';
const override = existsSync(OVERRIDE_PATH) ? JSON.parse(readFileSync(OVERRIDE_PATH, 'utf8')) as Record<string, string> : {};

const SHOT_END: ActionBeat[] = ['whiff', 'bar', 'post', 'over', 'wide', 'tip', 'held', 'parry', 'block', 'line'];
const KEEPER = /воротар|\{keeper|\{them\.keeper/;
/** Речення про удар: тільки в ньому «стійка», «повз», «в руки» — про м'яч, що летить у ворота.
 *  «На ближню стійку» в обороні стандарту — місце, а не удар. */
const SHOT = /б’є|б'є|б’ють|удар|бити|пробив|добива|заштовх|пропиха|головою|з льоту|черпак|м’яч іде|м’яч летить|м’яч зачіпає|влуча|завершу|підсіка|скидає .*в .*кут/;

/** Подія → перевірка речення. `s` — речення (малими), `shot` — чи це речення про удар. */
const RULES: [ActionBeat, (s: string, shot: boolean) => number][] = [
  ['whiff', (s) => s.search(/по повітрю|повз м’яч|не влучаєш по м’ячу/)],
  ['bar', (s, shot) => shot ? s.search(/(?<!під )(перекладин|поперечин)/) : -1],
  ['post', (s, shot) => shot ? s.search(/(?<!повз |біля |від )(стійк[уиа]|штанг|стулк[уиа])(?! прапор)/) : -1],
  ['over', (s, shot) => shot ? s.search(/—\s*вище|, вище|вище воріт|над ворітьми|над поперечиною|над перекладиною|(в|у|на) трибун|свічк|(іде|йде|летить) вище|м’яч вище/) : -1],
  ['wide', (s, shot) => shot ? s.search(/повз (ворота|стійку|стулку|дальн|ближн|порожн|кут|воротар)|мимо|бічн\S* сітк|метрів на \S+ (правіше|лівіше)|(іде|йде|летить) повз|б’єш повз|б’є повз|удар повз|— повз/) : -1],
  ['tip', (s, shot) => shot || KEEPER.test(s) ? (KEEPER.test(s) && /кутов|кінчик|за лицьову|переводить/.test(s) ? s.search(KEEPER) : -1) : -1],
  ['held', (s) => KEEPER.test(s) && !/кутов|кінчик|переводить|відбива|відбив|витяг|вибива/.test(s) ? (s.match(/(в|у) руки|ловить|забира|знімає|накрива|в ноги|у ноги|(в|у) воротаря/)?.index ?? -1) : -1],
  ['parry', (s) => KEEPER.test(s) && !/кутов|кінчик/.test(s) ? (s.match(/відбива|відбив|витяг|вибива|кулак|рятує|дістає|дотягу|тягне/)?.index ?? -1) : -1],
  ['block', (s, shot) => (shot || /рикошет|стінк/.test(s)) ? s.search(/(в|у) захисника|підстав\S* ногу|блоку|заблок|рикошет|(в|у) стінку|влучає в неї|стінка (підстрибує|стрибає)|накри\S* удар|— у тебе|блок,/) : -1],
  // «З лінії штрафного» — це край штрафного, не лінія воріт.
  ['line', (s, shot) => shot && !KEEPER.test(s) ? s.search(/(з|на) лінії(?! штрафн)/) : -1],
  ['rebound', (s) => s.search(/добива|заштовх|пропиха|на підборі|відскакує в поле|відскок|у відскок/)],
  ['pen', (s) => s.search(/свистить пенальті|показує на (позначку|точку)|призначає пенальті|пенальті є|несуть на позначку|(^|— |\. )пенальті[.,]|пенальті стоїть|(палець|пальцем) на точку/)],
  ['fk', (s) => s.search(/зносить тебе|збиває тебе|збивають тебе|тебе .*збивають|фол на тобі|штрафний наш|влітаєш у підкат|валить тебе|валять|зачепи\S* тебе|чіпляє тебе|фол на нашу користь|свисток, штрафний/)],
  // «Без офсайду», «у метрі від офсайду», «офсайду немає» — заперечення, прапорця нема.
  ['offside', (s) => /без офсайду|від офсайду|офсайду (немає|не було|нема)|не (в|у) офсайді/.test(s) ? -1 : s.search(/офсайд|поза грою|прапорець (піднято|угору|вгору)|піднімає прапорець/)],
  ['cut', (s) => KEEPER.test(s) ? -1 : s.search(/перехоп|читає (передачу|пас)|накривають|вибивають|вибиває (м’яч|його)|виносить|виносять|відбира|забирають м’яч|забирає м’яч|в ноги захисник|захисник\S* вибива|вибиває з-під|вибиває в аут/)],
  ['corner', (s) => s.search(/на кутовий|ще (один )?кутовий|заробля\S* кутовий|рикошет, кутовий|кутовий у компенсований|кутовий\.|— кутовий|кутовий (їхній|наш)/)],
  ['out', (s) => s.search(/(в|у) аут|за бокову|за брівку|за бровку|за лицьову|(^|[\s—])аут[.,:]|аут на |нам аут/)],
  ['down', (s) => s.search(/на газоні ти|ти лежиш|лежиш|падаєш|валишся|ти лишаєшся сидіти|лишаєшся сидіти на газоні/)],
  // 23.10. Картка: кому — у beatsOf (cardme / card); заперечення й стара картка — maskNoCard (card-words.ts).
  ['card', (s) => maskNoCard(s).search(/жовт|червон|картк/)],
  ['red', (s) => maskNoCard(s).search(/червон/)],
  ['ref', (s) => s.search(/суддя|судді|арбітр|var(?![a-z])|екран|монітор/)],
  ['cross', (s) => s.search(/навіс|простріл|подач|подає/)],
  ['aerial', (s) => s.search(/головою|у верх|верхом|стриба/)],
  ['shout', (s) => s.search(/крикн|кричиш|кричить|кричать|махаєш|показуєш рукою|жестом/)],
  ['run', (s) => s.search(/ривок|біжиш|вривається|забігає|наздоган|рвонув|біжить (у|в|на|за|повз)/)],
  ['beat', (s) => s.search(/обігру|обводить|обвів|прокидає|між ніг|фінт|проходить повз/)],
];
/** Події, які вже показує сам шаблон дії Реєса: не дублювати. */
const BY_TEMPLATE: Record<string, ActionBeat[]> = { cross: ['cross'], header: ['aerial'], talk: ['shout'], run: ['run'], through: ['run'], dribble: ['beat'], foul: ['ref'] };

const OURS = /\{(striker|partner|cb2?|dm|winger|lb|rb)[}.]/;
const FOE = /\{keeper[}.]|\{them\.\w+[}.]? ?(б’є|вдаряє|пробиває|добиває|бʼє)|їхн\S+ \S+ (б’є|і б’є)|опорник і б’є/;
/** Хто б'є в реченні з подією удару: `@them` — суперник по наших воротах (наш воротар у реченні —
 *  завжди їхній удар), `@<роль>` — наш партнер, '' — Реєс, null — речення не каже. Дивимось лише на текст
 *  до слова-події: «ти б'єш, воротар відбиває, {striker} заштовхує» — удар Реєса, а не нападника. */
function shooterOf(s: string, i: number): string | null {
  if (/\{keeper[}.]/.test(s)) return '@them';
  const pre = s.slice(0, i);
  if (FOE.test(pre)) return '@them';
  const m = pre.match(OURS);
  if (m) return `@${m[1]}`;
  if (/(^|[^а-яіїєґ’])ти |б’єш|добиваєш/.test(pre)) return '';
  return null;
}

/** Ланцюжок подій ісходу в порядку тексту. Одна подія удару на ісход — перша названа. Попереду —
 *  хто б'є (`@them` / `@<роль>`), якщо не Реєс. */
export function beatsOf(o: Outcome, template: string): string[] {
  const found: [number, ActionBeat][] = [];
  let at = 0, who: string | null = null;
  const sentences = o.text.toLowerCase().split(/(?<=[.!?…])\s+/);
  sentences.forEach((raw, n) => {
    // «Він б'є у дальній. {keeper} стрибає із запізненням — стійка»: удар названо реченням раніше.
    const shot = SHOT.test(raw) || template === 'shot' || (n > 0 && SHOT.test(sentences[n - 1]));
    const here = RULES.map(([beat, test]) => [test(raw, shot), beat] as [number, ActionBeat]).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0]);
    for (const [i, beat] of here) {
      found.push([at + i, beat]);
      // Хто б'є — з першої події удару в тексті; якщо в реченні тільки воротар, — з попереднього речення.
      if (who === null && SHOT_END.includes(beat)) who = shooterOf(raw, i) ?? (n ? shooterOf(sentences[n - 1], sentences[n - 1].length) : null) ?? '';
    }
    at += raw.length + 1;
  });
  if (o.apply?.corner && !found.some(([, b]) => b === 'corner')) found.push([1e9, 'corner']);
  // Шаблон уже показує свою подію (навіс Реєса, його ривок, його обводка) — з тексту її не беремо.
  const skip = BY_TEMPLATE[template] ?? [];
  for (let i = found.length - 1; i >= 0; i--) if (skip.includes(found[i][1])) found.splice(i, 1);
  // Картка: кому. «Тобі», «обом» чи фол Реєса — тобі; «йому», «їм» — суперникові.
  const ci = found.findIndex(([, b]) => b === 'card');
  if (ci >= 0) {
    const t = o.text.toLowerCase();
    const me = /тобі|обом|ти дістав|отримуєш/.test(t) || (template === 'foul' && !/йому|їм /.test(t));
    if (me) found.splice(ci, 1, [found[ci][0], 'cardme']);
    if (/обом/.test(t)) found.push([found[ci][0] + .5, 'card']);
  }
  // Червона — лише уточнення картки; без картки її нема.
  if (!found.some(([, b]) => b === 'card' || b === 'cardme')) for (let i = found.length - 1; i >= 0; i--) if (found[i][1] === 'red') found.splice(i, 1);
  found.sort((a, b) => a[0] - b[0]);
  const out: ActionBeat[] = [];
  for (const [, b] of found) {
    if (out.includes(b)) continue;
    if (SHOT_END.includes(b) && out.some((x) => SHOT_END.includes(x))) continue;
    out.push(b);
  }
  // Корнер після «в руки» — суперечність у межах одного розбору: воротар або тримає, або ні.
  if (out.includes('held') && out.includes('corner')) out.splice(out.indexOf('held'), 1);
  return who && out.length ? [who, ...out] : out;
}

const ends: Record<string, string> = {};
const count: Record<string, number> = {};
let total = 0;
for (const e of EPISODES) for (const o of e.options) {
  const template = TEMPLATES[`${e.id}/${o.id}`] ?? 'hold';
  for (const [tier, oc] of Object.entries(o.outcomes)) {
    if (!oc) continue;
    total++;
    const key = `${e.id}/${o.id}/${tier}`;
    const line = key in override ? override[key] : beatsOf(oc, template).join(' ');
    if (line) ends[key] = line;
    for (const b of line.split(' ').filter(Boolean)) { const k = b.startsWith('@') && b !== '@them' ? '@mate' : b; count[k] = (count[k] ?? 0) + 1; }
  }
}
const sorted = Object.fromEntries(Object.entries(ends).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync('src/content/action-ends.json', JSON.stringify(sorted, null, 1) + '\n');
console.log(`ісходів ${total}, з подіями ${Object.keys(ends).length}`);
console.log(Object.entries(count).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} ${n}`).join(' · '));
const list = process.argv.indexOf('--list');
if (list > 0) {
  const want = process.argv[list + 1];
  for (const e of EPISODES) for (const o of e.options) for (const [tier, oc] of Object.entries(o.outcomes)) {
    const key = `${e.id}/${o.id}/${tier}`;
    if (!want || (ends[key] ?? '').split(' ').includes(want)) console.log(`${(ends[key] ?? '—').padEnd(18)} ${TEMPLATES[`${e.id}/${o.id}`]?.padEnd(8)} ${key}\n    ${oc.text.slice(0, 170)}`);
  }
}
void ACTION_BEATS;
