// Сцена агента (M12, 20.09, рішення користувача): вердикт «Дзвонить агент» лишається на сторінці ESPM як
// нагорода — персонаж цього хоче. Але «трансфер» — не кінець, а розвилка: сказати «так» / «ні» /
// «зачекати». Ціль кар’єри не декларується, тому гра не карає за «так» — угода зривається за
// обставинами (медогляд згадує травму, борги клубу, скаут передумав), з іронією, і Реєс лишається.
// Усе, що тримає його тут, — не тут, а в тканині сезону (дует, ультрас, місто, Тібо, M11); сцена
// тільки показує, що вийти неможливо, і не пояснює чому. Наслідки — через applyWeek у nextMatch
// першого матчу нового сезону; вибір записується в career.agentLog для стрічки й сцен тижня.
// Чистая логика; контент — content/agent.json; экран — ui/AgentScene.tsx.

import { applyWeek, type ActivityEffect, type LootItem } from './week';
import type { Career } from './career';
import type { Season, Verdict } from './season';
import { ourRow } from './season';
import type { Voice } from './types';

export type AgentChoice = 'leave' | 'stay' | 'wait';
export type CollapseReason = 'medical' | 'debts' | 'scout';

export type AgentOption = {
  id: AgentChoice;
  label: string;
  /** Що сталося одразу після відповіді. */
  text: string;
  /** Для «так»: рядок після зриву — Реєс знову тут. */
  after?: string;
  effect: ActivityEffect;
};

export type AgentContent = {
  tab: string;
  setup: string;
  voices: Voice[];
  options: AgentOption[];
  /** Чому угода зірвалась — за станом кар’єри (collapseReason). */
  collapse: Record<CollapseReason, string>;
  /** Дует (partnerBond ≥ порога): партнер не просить лишитися — він розраховує, не питаючи. */
  bonded: Voice;
  /** Літній дзвінок (M13): другий сезон, обставин немає, вибір справжній. Без «зачекати». */
  summer: { tab: string; setup: string; voices: Voice[]; options: AgentOption[] };
  /** Від’їзд улітку — чесний епілог без покарання: останній свисток у чужому місті. */
  epilogue: string;
};

export type AgentMode = 'winter' | 'summer';

export type AgentLogEntry = { season: number; choice: AgentChoice; reason?: CollapseReason };

/** Сцена йде після вердикту «трансфер», один раз на сезон: перший раз — зима (угода зривається), був
 *  уже дзвінок у минулому сезоні — літо (обставин немає, вибір справжній). */
export function agentPending(career: Career, season: Season, verdict: Verdict | undefined): AgentMode | null {
  if (verdict?.kind !== 'transfer' || career.ended) return null;
  const log = career.agentLog ?? [];
  if (log.some((a) => a.season === season.number)) return null;
  return log.some((a) => a.season < season.number) ? 'summer' : 'winter';
}

/** Обставина зриву — з того, що гра вже знає: травма цього сезону → медогляд; лідер таблиці → клуб під
 *  заставою (продавати нікого не дають); інакше — скаут пішов. Не випадковість: причина має читатися
 *  як наслідок сезону, а не як жереб. */
export function collapseReason(career: Career, season: Season): CollapseReason {
  if ((career.injuriesSeason ?? 0) > 0 || career.injuredMatches > 0) return 'medical';
  if (ourRow(season).position <= 2) return 'debts';
  return 'scout';
}

/** Застосувати вибір: наслідки в nextMatch (перший матч нового сезону), запис у лог, текст сцени. */
export function resolveAgent(
  career: Career, season: Season, content: AgentContent, choice: AgentChoice, mode: AgentMode = 'winter',
): { career: Career; loot: LootItem[]; text: string; reason?: CollapseReason; ended?: boolean } {
  const option = (mode === 'summer' ? content.summer.options : content.options).find((o) => o.id === choice);
  if (!option) throw new Error('немає варіанта агента ' + choice);
  if (mode === 'summer' && choice === 'leave') {
    // Улітку «так» — це кінець кар’єри тут: епілог, без наслідків і без покарання.
    const next: Career = { ...career, ended: { season: season.number }, agentLog: [...(career.agentLog ?? []), { season: season.number, choice }] };
    return { career: next, loot: [], text: `${option.text} ${content.epilogue}`, ended: true };
  }
  const reason = mode === 'winter' && choice === 'leave' ? collapseReason(career, season) : undefined;
  const applied = applyWeek(career, [{ activity: { id: 'agent_' + choice, voice: choice === 'stay' ? 'team' : choice === 'leave' ? 'ego' : 'composure', title: option.label, line: '', effect: option.effect } }]);
  const next: Career = { ...applied.career, agentLog: [...(career.agentLog ?? []), { season: season.number, choice, ...(reason ? { reason } : {}) }] };
  const text = [option.text, reason ? content.collapse[reason] : '', option.after ?? ''].filter(Boolean).join(' ');
  return { career: next, loot: applied.loot, text, ...(reason ? { reason } : {}) };
}
