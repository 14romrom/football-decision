// Постановка дій Реєса на полі (17.10, спрощений варіант — рішення користувача). Не пишемо постановку
// кожному з ~650 варіантів руками, а виводимо її з того, що вже є: шаблон руху — з атрибута й слів
// у назві варіанта, місце сцени — зі слів у сетапі (дуга, фланг, кутовий, штрафний, своя половина),
// без слів — точка сім'ї, як раніше. Виводимо **з української бази й заздалегідь**: в англійській
// збірці назви вже перекладені, і слова в них не знайдуться. Результат — src/content/actions.json;
// де автомат помилився — src/content/actions-override.json (руками, переживає перегенерацію).
//
//   npx tsx tools/actions.ts          — перегенерувати й показати розподіл
//   npx tsx tools/actions.ts --list   — ще й усі варіанти з шаблоном (для перевірки очима)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ACTION_TEMPLATES, type ActionTemplate } from '../src/engine/action';

type Opt = { id: string; label: string; attribute: string };
type Ep = { id: string; family?: string; phase: string; setup: string; setups?: { text: string }[]; options: Opt[] };

const EPISODES = JSON.parse(readFileSync('src/content/episodes.json', 'utf8')) as Ep[];
const OVERRIDE_PATH = 'src/content/actions-override.json';
const override = existsSync(OVERRIDE_PATH)
  ? JSON.parse(readFileSync(OVERRIDE_PATH, 'utf8')) as { places?: Record<string, string>; options?: Record<string, ActionTemplate> }
  : {};

/** Перше збіжне правило виграє: специфічніші — вище. */
const BY_WORDS: [RegExp, ActionTemplate][] = [
  [/фол|сфол|за футболку|смикн/i, 'foul'],
  [/не бити|грати далі|промовчати|не реагувати|проковтнути|розмина/i, 'hold'],
  [/до судді|вимагати|висловити|подивитися на суддю|почути|спитати|«/i, 'talk'],
  [/голов|(?<!пере)стриб|під скидку|на м’яч першим|на ближню стійку|найвищого/i, 'header'],
  [/діагонал|перевод|перевід|перевест|через усе поле|на інший фланг|на дальній фланг/i, 'switch'],
  [/навіс|навісит|подава|подати|подач|простріл|^на (ближн|дальн)|крутити від/i, 'cross'],
  [/на хід|розріз|за спин|вразріз|в розрив|у розрив|верхом за|за лінію|^у зону|в зону/i, 'through'],
  [/(?<!ви)бити|б’є|удар|пробит|завершит|паненк|черпак|дев’ятк|вколоти|покласти|закрутити|крутити у ворота|на силу|з льоту|носком|підсікти|під поперечину|у кут|в кут|у дальній|в дальній/i, 'shot'],
  [/відкот|назад|воротар[юя]|відкинути назад/i, 'back'],
  [/накри|відібра|відбір|випереджен|підкат|перехоп|вибити|винести|стати на лінію|закрити|перекрит|блок|тиснут|летіти на|вийти на|вести його|не даючи/i, 'tackle'],
  [/корпус|прикрит|затримат|притримат|тримати м|сховати м/i, 'shield'],
  [/фінт|обвес|обвод|обіграт|елястік|між ніг|пройти|протягн|тягнути|розвернут|крокет|ножиц|прокинут|перестриб/i, 'dribble'],
  [/бігти|ривок|наздогн|повернутися|відкритися|забігти|втекти|рвонут|біжи|прохід|відрив|вздовж бровки/i, 'run'],
  [/віддати|пас|скинути|відкинути|в дотик|розіграти|стінк|знайти|відпустити|пропустити/i, 'pass'],
  [/крикн|сказати|показати|пояснит|попросит|кивнути|підказат|покликат|організ|голосом/i, 'talk'],
  [/лишитися|чекати|не бити|не ризикувати|триматися|стояти|грати як|не йти|залишит|прийняти|зупинит/i, 'hold'],
];
const BY_ATTRIBUTE: Record<string, ActionTemplate> = {
  finishing: 'shot', passing: 'pass', vision: 'pass', dribbling: 'dribble', first_touch: 'dribble',
  pace: 'run', stamina: 'run', strength: 'shield', positioning: 'hold', composure: 'hold',
};

/** Місце сцени — рядок зони, як у стрічці: «theirD:C», «own:L»… Атака праворуч; фаза вирішує, чия дуга. */
function placeOf(e: Ep): string | null {
  // Штрафний б'ють з-за меж штрафного: слово «штрафний» у сетапі — про нього, не про місце Реєса.
  if (e.family === 'free_kick') return e.phase === 'defense' ? 'ownD:C' : 'theirD:C';
  const text = [e.setup, ...(e.setups ?? []).map((s) => s.text)].join(' ').toLowerCase();
  // Атакувальна сцена своєї половини не має, хоч би текст і згадував «наші ворота».
  const ours = e.phase !== 'attack' && (e.phase === 'defense' || /свого штрафного|своєї штрафної|у свій штрафний|свої ворота|наших воріт|своєї половини|своїй половині/.test(text));
  const y = /правому фланзі|правим флангом|правій бровці|праворуч/.test(text) ? 'R' : /лівому фланзі|лівим флангом|лівій бровці|ліворуч/.test(text) ? 'L' : null;
  if (/дуг/.test(text)) return `${ours ? 'ownD' : 'theirD'}:C`;
  if (/кутов/.test(text) && !/кутовий прапор/.test(text)) return `${ours ? 'ownBox' : 'theirBox'}:${y ?? 'L'}`;
  if (/лицьов/.test(text)) return `${ours ? 'ownBox' : 'theirBox'}:${y ?? 'L'}`;
  if (/штрафн|у штрафному|воротар/.test(text)) return `${ours ? 'ownBox' : 'theirBox'}:C`;
  if (/фланг|бровк/.test(text)) return `${ours ? 'own' : 'their'}:${y ?? 'L'}`;
  if (/своєї половини|своїй половині/.test(text)) return 'own:C';
  if (/центр поля|центрі поля|у центрі/.test(text)) return 'mid:C';
  if (/чужої половини|їхній половині/.test(text)) return 'their:C';
  return null;
}

/** Куди йде м'яч, якщо назва варіанта це каже: «на дугу», «на дальню», «у штрафний», «на фланг». */
function targetOf(o: Opt): string | null {
  const l = o.label.toLowerCase();
  if (/на дуг/.test(l)) return 'theirD:C';
  if (/на дальн(ю|ій|ю стійку)|на дальню/.test(l) && !/фланг|край/.test(l)) return 'farPost';
  if (/на ближн/.test(l)) return 'nearPost';
  if (/у штрафн|в штрафн/.test(l)) return 'theirBox:C';
  return null;
}

function templateOf(o: Opt): { t: ActionTemplate; how: 'слово' | 'атрибут' } {
  for (const [re, t] of BY_WORDS) if (re.test(o.label)) return { t, how: 'слово' };
  return { t: BY_ATTRIBUTE[o.attribute] ?? 'hold', how: 'атрибут' };
}

const places: Record<string, string> = {};
const options: Record<string, ActionTemplate> = {};
const targets: Record<string, string> = {};
const dist: Record<string, number> = {}; let byAttr = 0, placed = 0;
const rows: string[] = [];
for (const e of EPISODES) {
  const p = override.places?.[e.id] ?? placeOf(e);
  if (p) { places[e.id] = p; placed++; }
  for (const o of e.options) {
    const key = `${e.id}/${o.id}`;
    const auto = templateOf(o);
    const t = override.options?.[key] ?? auto.t;
    if (!ACTION_TEMPLATES.includes(t)) throw new Error(`невідомий шаблон ${t} у ${key}`);
    options[key] = t;
    const target = targetOf(o); if (target) targets[key] = target;
    dist[t] = (dist[t] ?? 0) + 1;
    if (!override.options?.[key] && auto.how === 'атрибут') byAttr++;
    rows.push(`${t.padEnd(8)} ${override.options?.[key] ? '✎' : auto.how === 'атрибут' ? '·' : ' '} ${e.family?.padEnd(15)} ${o.label}`);
  }
}
writeFileSync('src/content/actions.json', JSON.stringify({ places, options, targets }, null, 1) + '\n');
const n = Object.keys(options).length;
console.log(`варіантів ${n}, сцен із місцем із тексту ${placed} з ${EPISODES.length}`);
console.log('шаблони:', Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
console.log(`адресат із назви: ${Object.keys(targets).length}`);
console.log(`за атрибутом (без слова в назві): ${byAttr} — їх перевіряти першими`);
if (process.argv.includes('--list')) console.log(rows.sort().join('\n'));
