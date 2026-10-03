// Вычитка шва цепочки: что игрок читает перед звеном и что читает в самом звене.
//   npx tsx tools/probe-seam.ts                                  — все звенья группы «удар»
//   npx tsx tools/probe-seam.ts ep_drag_defender take_him_on cost — свой родитель, свой исход
//
// Зачем отдельный скрипт: звено приходит в том же слоте, без ленты между решениями, то есть игрок
// читает исход родителя и сетап звена подряд, как один абзац. Промах здесь не ловится ни одним
// тестом: оба текста по отдельности верны, а вместе спорят («защитник провалился в пустоту» →
// «он не отпустил»). После M44 это ещё важнее: у цели цепочки есть альтернативы, и каждая из них
// должна читаться с того же повода, что названная.

import { makeRng } from '../src/engine/rng';
import { applyChoice, availableOptions, CHAIN_NEXT, createMatch, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { EPISODES_RAW, FLAG_RULES, PLAYER, ROSTER } from '../src/content';
import { neutralConditions } from '../src/engine/conditions';
import { cleanTarget } from '../src/engine/balance';
import type { Episode, Tier } from '../src/engine/types';

const [parentId = 'ep_wing_one_on_one', optionId = 'cut_inside', tier = 'clean'] = process.argv.slice(2);
const parent = (EPISODES_RAW as Episode[]).find((e) => e.id === parentId);
if (!parent) throw new Error('нет сцены ' + parentId);
const option = parent.options.find((o) => o.id === optionId);
if (!option) throw new Error('нет варианта ' + optionId);
const target = option.outcomes[tier as Tier]?.apply?.followUp;
if (!target) throw new Error(`${parentId}/${optionId}/${tier} не ведёт в цепочку`);

// Группа цели: названная сцена плюс её альтернативы (chainOf). Чтобы прочитать каждую, по очереди
// объявляем «уже виденными» все остальные — правило «небачене першим» оставляет ровно одного кандидата.
const group = [target, ...(EPISODES_RAW as Episode[]).filter((e) => e.chainOf === target).map((e) => e.id)];
const high = (n: number) => ({ ...makeRng(1), roll: () => n });

for (const id of group) {
  const rng = makeRng(42);
  const s = createMatch('probe', 42, PLAYER, rng, EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES,
    { seenEpisodes: group.filter((x) => x !== id) });
  s.plan[1] = parentId;
  s.nextIndex = 1;
  s.state.minute = 19;
  const first = nextEpisode(s, rng)!;
  const res = { ...resolveOption(s.state, s.player, option, first.episode.phase, high(19)), tier: tier as Tier, critical: null };
  applyChoice(s, first.episode, option, res, rng);
  const link = nextEpisode(s, rng);
  if (!link) { console.log(`\n${id}: цепочка не сработала`); continue; }
  console.log('\n'.padEnd(80, '—'));
  console.log('— ' + first.episode.setup);
  console.log('> ' + option.label);
  console.log('= ' + s.state.log[s.state.log.length - 1].text);
  console.log(`\nДалі → ${CHAIN_NEXT[link.episode.id] ?? '(без імені)'}   [${link.episode.id}]`);
  console.log('— ' + link.episode.setup);
  for (const o of availableOptions(link.episode, s.state, s.player)) {
    console.log(`  [${o.basePosition} ціль ${cleanTarget(o.basePosition, o.difficulty ?? 0)} · ${o.attribute} · ${o.staminaCost} сил] ${o.label}`);
    console.log(`     ${o.voice?.who}: ${o.voice?.line}`);
    for (const t of ['clean', 'cost', 'fail', 'badFail'] as Tier[]) console.log(`     ${t}: ${o.outcomes[t].text}`);
  }
}
