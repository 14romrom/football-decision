// Хто говорить на кожному атрибуті: таблиця «атрибут → голоси варіантів» по всьому пулу епізодів.
//
// Картка групує характеристики за голосами (src/ui/voices-text.ts), і група має збігатися з тим,
// що гравець чує на кнопці. Цим скриптом мапінг і зроблено (28.09): удар віддали Его, бо 27 із 45
// варіантів удару вже озвучені ним, пас — Команді (52 із 77). Тест у tests/insight.test.ts тримає
// правило «голос атрибута — один із двох найчастіших»; скрипт показує, наскільки запас великий.
//
//   npx tsx tools/voice-attrs.ts

import { EPISODES_RAW } from '../src/content';
import { ATTRIBUTE_LABEL, type Attribute, type VoiceKey } from '../src/engine/types';
import { VOICE_LABEL } from '../src/engine/voices';
import { VOICES } from '../src/ui/voices-text';

const owner = new Map<Attribute, VoiceKey>();
for (const v of VOICES) for (const a of v.attrs) owner.set(a, v.who);

const counts = new Map<Attribute, Map<string, number>>();
for (const e of EPISODES_RAW) {
  for (const o of e.options) {
    if (!o.attribute) continue;
    const attr = o.attribute as Attribute;
    const by = counts.get(attr) ?? new Map<string, number>();
    const who = o.voice?.who ?? '—';
    by.set(who, (by.get(who) ?? 0) + 1);
    counts.set(attr, by);
  }
}

for (const [attr, who] of owner) {
  const by = [...(counts.get(attr) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]);
  const total = by.reduce((s, [, n]) => s + n, 0);
  const mine = by.find(([w]) => w === who)?.[1] ?? 0;
  const rank = by.findIndex(([w]) => w === who) + 1;
  const line = by.map(([w, n]) => `${w} ${n}`).join(', ');
  console.log(
    `${ATTRIBUTE_LABEL[attr].padEnd(14)} ${VOICE_LABEL[who].padEnd(10)} ${String(mine).padStart(3)} з ${String(total).padStart(3)}` +
    `  (місце ${rank || '—'})  ${line}`,
  );
}
