// Бюджет постановки рядка стрічки (23.10). Рядок висить на екрані стільки, скільки потрібно, щоб його
// прочитати (ui/feedTiming.ts:dwellFor — від довжини показаного тексту), і ще до PLAY_WAIT_MAX, поки поле доіграє.
// Для кожної постановки беремо найкоротший рядок, що її використовує, у найкоротшій мовній версії — це
// межа, в яку розіграш має вкластися. Плейсхолдери рахуємо як типове ім'я (8 знаків).
// Вихід — JSON «постановка → мс»; порівнювати з виміром у #/pitchlab (див. CLAUDE.md, «Життя поля»).
//   npx tsx tools/stage-budget.ts > budget.json
import { readFileSync } from 'node:fs';
import { srcHash } from '../src/content/i18n';
import { dwellFor, playWaitFor } from '../src/ui/feedTiming';

const feed = JSON.parse(readFileSync('src/content/feed.json', 'utf8')) as { kind: string; lines: string[]; stage?: (string | null)[] }[];
const en = JSON.parse(readFileSync('src/content/i18n/en.json', 'utf8')) as Record<string, string>;
// Та сама формула, що в грі; плейсхолдер — як ім'я з восьми знаків.
const dwell = (kind: string, text: string) => dwellFor({ kind, text: text.replace(/\{[^}]+\}/g, 'XXXXXXXX') });
const budget: Record<string, { ms: number; kind: string; uk: number; en: number }> = {};
for (const r of feed) {
  (r.stage ?? []).forEach((st, i) => {
    if (!st) return;
    const uk = dwell(r.kind, r.lines[i]);
    const tr = en[srcHash(r.lines[i])];
    const e = tr ? dwell(r.kind, tr) : uk;
    const ms = Math.min(uk, e) + playWaitFor(r.kind);
    if (!budget[st] || ms < budget[st].ms) budget[st] = { ms, kind: r.kind, uk, en: e };
  });
}
console.log(JSON.stringify(budget));
