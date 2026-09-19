// Локальная телеметрия решений. Никакого бэкенда: пишем в localStorage,
// выгружаем одним файлом. Главная метрика — распределение выборов по эпизодам.

import type { Position, Tier } from '../engine/types';
import { SLOT_BASES, slotKey } from './slots';

export type DecisionLog = {
  matchId: string; seed: number; episodeId: string; optionId: string;
  optionLabel: string;
  minute: number; stamina: number; scoreDiff: number; momentum: number;
  conditions?: string;   // venue/strength/instruction/weather — чтобы читать логи в разрезе условий
  roll: number; totalScore: number; position: Position; tier: Tier;
  msToDecide: number;
  at: number;   // время решения, чтобы различать сессии тестеров
  /** Хеш коммита сборки (vite.config.ts) — какая версия игры сыграла этот матч. */
  version?: string;
  /** Голоса, которые «бачили» в этой сцене (EpisodeOption.insight) — показанные, не выбранные:
   *  выбор и так виден по optionId, а вот сколько раз игрок видел подсказку — только отсюда. */
  insights?: string[];
};

// Логи — тоже по слоту: слот = карьера = её решения; экспорт отдаёт активный слот.
const key = () => slotKey(SLOT_BASES.decisions);

function safeRead(): DecisionLog[] {
  try {
    const raw = localStorage.getItem(key());
    return raw ? (JSON.parse(raw) as DecisionLog[]) : [];
  } catch {
    return [];
  }
}

export function readLogs(): DecisionLog[] {
  return safeRead();
}

export function logDecision(entry: DecisionLog): void {
  try {
    const all = safeRead();
    all.push(entry);
    localStorage.setItem(key(), JSON.stringify(all));
  } catch {
    // приватный режим браузера — прототип от этого падать не должен
  }
}

export function clearLogs(): void {
  try { localStorage.removeItem(key()); } catch { /* см. выше */ }
}

export function exportLogs(): void {
  const blob = new Blob([JSON.stringify(readLogs(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `decisions-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export type OptionShare = {
  optionId: string; optionLabel: string; count: number; share: number; medianMs: number;
};
export type EpisodeShare = {
  episodeId: string; total: number; options: OptionShare[]; broken: boolean; fastShare: number;
};

/** Эпизод считается сломанным, если одна опция забирает больше 70% выборов (п. 10 ТЗ). */
export const BROKEN_SHARE = 0.7;
/** Решение быстрее двух секунд — признак того, что игрок не думал. */
export const FAST_DECISION_MS = 2000;

export function choiceDistribution(logs: DecisionLog[] = readLogs()): EpisodeShare[] {
  const byEpisode = new Map<string, DecisionLog[]>();
  for (const l of logs) {
    const list = byEpisode.get(l.episodeId) ?? [];
    list.push(l);
    byEpisode.set(l.episodeId, list);
  }

  return [...byEpisode.entries()].map(([episodeId, list]) => {
    const byOption = new Map<string, DecisionLog[]>();
    for (const l of list) {
      const o = byOption.get(l.optionId) ?? [];
      o.push(l);
      byOption.set(l.optionId, o);
    }
    const options: OptionShare[] = [...byOption.entries()]
      .map(([optionId, entries]) => {
        const times = entries.map((e) => e.msToDecide).sort((a, b) => a - b);
        return {
          optionId,
          optionLabel: entries[0].optionLabel,
          count: entries.length,
          share: entries.length / list.length,
          medianMs: times[times.length >> 1],
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      episodeId,
      total: list.length,
      options,
      broken: options[0].share > BROKEN_SHARE,
      fastShare: list.filter((l) => l.msToDecide < FAST_DECISION_MS).length / list.length,
    };
  }).sort((a, b) => a.episodeId.localeCompare(b.episodeId));
}
