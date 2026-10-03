// Вычитка разворотов блокнота текстом: пролог, май, отпуск, финал (M34).
//   npx tsx tools/readthrough.ts            — все четыре
//   npx tsx tools/readthrough.ts vacation   — только отпуск
//   npx tsx tools/readthrough.ts ending --names   — с подставленными именами ростера
//
// Зачем: у отпуска четыре разворота по 4–5 ответов, то есть порядка шести тысяч комбинаций, а у
// каждого листа ещё и варианты текста по голосу (sheetBy) и по «холодному» финалу (sheetCold).
// Переиграть это нельзя — можно только прочитать. Скрипт печатает лист, все его варианты, все ответы
// с репликами и эффектами, и считает, сколько текста игрок увидит за одно прохождение, а сколько
// не увидит никогда. Контрольная точка в меню (NavMenu) решает ту же задачу с другой стороны:
// пройти развилку заново руками. Этот скрипт — чтобы знать, что именно там написано.

import { ENDING, PROLOGUE, ROSTER, VACATION } from '../src/content';
import mayJson from '../src/content/may.json';
import { fillNamesDeep } from '../src/engine/names';

type Option = {
  id: string; voice?: string; say?: string; line?: string; mark?: string;
  reply?: string; replyCold?: string; effect?: Record<string, unknown>;
  injury?: string; witness?: string; arcMin?: number;
};
type Spread = {
  id: string; title?: string; sub?: string; tab?: string; head?: string;
  sheet: string[]; sheetBy?: Record<string, string[]>; sheetCold?: string[]; options: Option[];
};

const args = process.argv.slice(2);
const withNames = args.includes('--names');
const want = args.filter((a) => !a.startsWith('--'));

const w = (s: string) => process.stdout.write(s + '\n');
const rule = (ch = '─') => w(ch.repeat(78));
const para = (s: string, pad = '  ') => w(pad + s.replace(/\n/g, '\n' + pad));

let sheets = 0;
let options = 0;
let chars = 0;

function dumpSpread(s: Spread) {
  rule();
  w(`[${s.id}]  ${s.title ?? ''}${s.sub ? ' · ' + s.sub : ''}`);
  if (s.tab) w(`ярлык: ${s.tab}`);
  if (s.head) w(`надпись: ${s.head}`);
  rule('·');
  sheets++;
  for (const p of s.sheet) { para(p); chars += p.length; }
  for (const [voice, pages] of Object.entries(s.sheetBy ?? {})) {
    w(`\n  ── тот же лист, если ведёт голос «${voice}» ──`);
    for (const p of pages ?? []) { para(p, '    '); chars += p.length; }
  }
  if (s.sheetCold) {
    w('\n  ── тот же лист без связи с партнёром ──');
    for (const p of s.sheetCold) { para(p, '    '); chars += p.length; }
  }
  w('');
  for (const o of s.options) {
    options++;
    const tags = [o.voice, o.injury && `травма: ${o.injury}`, o.witness && `свидетель: ${o.witness}`, o.arcMin !== undefined && `арка ≥ ${o.arcMin}`]
      .filter(Boolean).join(', ');
    w(`  • ${o.say ?? o.id}${tags ? `   (${tags})` : ''}`);
    if (o.line) para(`подсказка: ${o.line}`, '      ');
    if (o.mark) para(`в тетради: ${o.mark}`, '      ');
    if (o.reply) { para(`→ ${o.reply}`, '      '); chars += o.reply.length; }
    if (o.replyCold) { para(`→ (холодный вариант) ${o.replyCold}`, '      '); chars += o.replyCold.length; }
    if (o.effect) para(`эффект: ${JSON.stringify(o.effect)}`, '      ');
    w('');
  }
}

function dumpPart(name: string, spreads: Spread[], after?: () => void) {
  w('');
  rule('━');
  w(`  ${name.toUpperCase()}  —  ${spreads.length} ${spreads.length === 1 ? 'разворот' : 'разворотов'}`);
  rule('━');
  const list = withNames ? (fillNamesDeep(spreads, ROSTER) as Spread[]) : spreads;
  for (const s of list) dumpSpread(s);
  after?.();
}

const parts: Record<string, () => void> = {
  prologue: () => dumpPart('пролог', PROLOGUE as unknown as Spread[]),
  may: () => dumpPart('май (исход сезона)', Object.values(mayJson) as unknown as Spread[]),
  vacation: () => dumpPart('отпуск', VACATION as unknown as Spread[]),
  ending: () => dumpPart('финал', ENDING.spreads as unknown as Spread[], () => {
    rule();
    w('[epilogue]');
    if (ENDING.scoutLead) {
      for (const [k, text] of Object.entries(ENDING.scoutLead)) {
        w(`\n  ── первый абзац звонка, если скаут увидел «${k}» ──`);
        para(text, '    ');
      }
      w('');
    }
    for (const p of ENDING.epilogue.text) { para(p); chars += p.length; }
    w('');
    para(ENDING.epilogue.sign);
  }),
};

const chosen = want.length ? want : Object.keys(parts);
for (const key of chosen) {
  const part = parts[key];
  if (!part) { console.error(`не знаю части «${key}»; есть: ${Object.keys(parts).join(', ')}`); process.exit(1); }
  part();
}

w('');
rule('━');
w(`  листов ${sheets}, ответов ${options}, текста ${(chars / 1000).toFixed(1)} тыс. знаков`);
rule('━');
