// Бюджет постановки рядка стрічки (23.10). Рядок висить на екрані стільки, скільки потрібно, щоб його
// прочитати (App.tsx:dwellFor — від довжини показаного тексту), і ще до PLAY_WAIT_MAX, поки поле доіграє.
// Для кожної постановки беремо найкоротший рядок, що її використовує, у найкоротшій мовній версії — це
// межа, в яку розіграш має вкластися. Плейсхолдери рахуємо як типове ім'я (8 знаків).
// Вихід — JSON «постановка → мс»; порівнювати з виміром у #/pitchlab (див. CLAUDE.md, «Життя поля»).
//   npx tsx tools/stage-budget.ts > budget.json
import { readFileSync } from 'node:fs';
import { srcHash } from '../src/content/i18n';

const feed = JSON.parse(readFileSync('src/content/feed.json', 'utf8')) as { kind: string; lines: string[]; stage?: (string | null)[] }[];
const en = JSON.parse(readFileSync('src/content/i18n/en.json', 'utf8')) as Record<string, string>;
const PLAY_WAIT_MAX = 2500, PLAY_WAIT_GOAL = 6000;
const len = (s: string) => s.replace(/\{[^}]+\}/g, 'XXXXXXXX').length;
const dwell = (kind: string, text: string) => {
  const read = Math.round(600 + len(text) * 1000 / 28);
  const lo = kind === 'goalUs' || kind === 'goalThem' ? 3000 : kind === 'halftime' || kind === 'kickoff' ? 1800 : 1900;
  return Math.max(lo, Math.min(read, 4200));
};
const budget: Record<string, { ms: number; kind: string; uk: number; en: number }> = {};
for (const r of feed) {
  (r.stage ?? []).forEach((st, i) => {
    if (!st) return;
    const uk = dwell(r.kind, r.lines[i]);
    const tr = en[srcHash(r.lines[i])];
    const e = tr ? dwell(r.kind, tr) : uk;
    const ms = Math.min(uk, e) + (r.kind === 'goalUs' || r.kind === 'goalThem' ? PLAY_WAIT_GOAL : PLAY_WAIT_MAX);
    if (!budget[st] || ms < budget[st].ms) budget[st] = { ms, kind: r.kind, uk, en: e };
  });
}
console.log(JSON.stringify(budget));
