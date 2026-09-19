// Після матчу (19.09, макет «Дошка аналітика → картка з дельтою», кадр 1Б): что аналитик
// вешает на магнитную доску и что изменилось в картке за матч. Чистая логика без React.
//
// Дошка показывает три момента, не девять: найкращий, поворотний, найгірший. Остальное —
// в пересказе и в истории на картке. Позиция магнита на поле — семья сцены (Pitch:FAMILY_SPOT),
// как и в матче: доска — та же картина, что видел игрок, только глазами аналитика.
//
// Дельта картки считается из карьеры до и после applyMatchToCareer — ничего нового не хранится.

import { CARRIED_FLAGS, effectivePlayer, type Career } from './career';
import { pickMoments, type MatchSummary } from './match';
import { dominantCareerVoice } from './week';
import { voiceSees, VOICE_LABEL } from './voices';
import type { Episode, MatchState, Player, TimelineEvent, VoiceKey } from './types';

export type BoardRole = 'best' | 'turn' | 'worst';
export type BoardMoment = {
  role: BoardRole; minute: number; past: string; recap: string; episodeId: string;
  family?: string; phase?: Episode['phase'];
  /** Момент дал гол (наш) или привёл к пропущенному — магнит зелёный/красный. */
  goal: boolean; concede: boolean;
  /** Счёт сразу после момента (голы исхода в ленте стоят перед сценой) — «Пресинг — за спиною. 0:4». */
  score: { us: number; them: number };
};

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

/** Поворотний — последний гол, который поменял, кто ведёт (вышли вперёд, сравняли, пропустили
 *  в ответ), если у него есть сцена с решением игрока в ту же минуту. Гол ленты без сцены
 *  на доску не вешается: аналитик разбирает решения, а не события. */
function turningEpisode(log: TimelineEvent[]): TimelineEvent | undefined {
  let us = 0; let them = 0; let found: TimelineEvent | undefined;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.kind !== 'goalUs' && e.kind !== 'goalThem') continue;
    const before = sign(us - them);
    if (e.kind === 'goalUs') us += 1; else them += 1;
    if (sign(us - them) === before) continue;
    const scene = log.slice(i + 1).find((x) => x.minute === e.minute && x.kind === 'episode' && x.past && x.recap);
    if (scene) found = scene;
  }
  return found;
}

export function boardMoments(state: MatchState, episodes: Episode[]): BoardMoment[] {
  const { best, worst } = pickMoments(state);
  const goalMinutes = new Set(state.log.filter((e) => e.kind === 'goalUs').map((e) => e.minute));
  const byId = new Map(episodes.map((e) => [e.id, e]));
  const same = (a?: { minute: number; episodeId: string }, b?: { minute: number; episodeId: string }) =>
    !!a && !!b && a.minute === b.minute && a.episodeId === b.episodeId;
  const turn = turningEpisode(state.log);
  const turnRef = turn ? { minute: turn.minute, episodeId: turn.episodeId ?? '' } : undefined;

  const out: BoardMoment[] = [];
  const push = (role: BoardRole, m?: { minute: number; past: string; recap: string; episodeId: string; concede?: boolean }) => {
    if (!m) return;
    const ep = byId.get(m.episodeId);
    const at = state.log.findIndex((e) => e.kind === 'episode' && e.minute === m.minute && e.episodeId === m.episodeId);
    const scene = at >= 0 ? state.log[at] : undefined;
    const upTo = at >= 0 ? state.log.slice(0, at + 1) : state.log;
    const score = { us: upTo.filter((e) => e.kind === 'goalUs').length, them: upTo.filter((e) => e.kind === 'goalThem').length };
    out.push({
      role, minute: m.minute, past: m.past, recap: m.recap, episodeId: m.episodeId,
      family: ep?.family, phase: ep?.phase,
      goal: goalMinutes.has(m.minute) && scene?.tier === 'clean',
      concede: !!scene?.causedConcede,
      score,
    });
  };
  push('best', best);
  // Поворотний не дублирует найкращий/найгірший: если это тот же гол — магнит один.
  if (turn && !same(turnRef, best) && !same(turnRef, worst)) {
    push('turn', { minute: turn.minute, past: turn.past!, recap: turn.recap!, episodeId: turn.episodeId ?? '' });
  }
  if (worst && !same(worst, best)) push('worst', worst);
  return out.sort((a, b) => a.minute - b.minute);
}

// ——— картка з дельтою ————————————————————————————————————————————

export type VoiceDelta = { who: VoiceKey; count: number };
export type TraceDelta = { text: string; minute?: number; past?: string };
export type CardDelta = {
  /** Кого слушал в этом матче, по убыванию; пусто — рубрика скрыта. */
  voices: VoiceDelta[];
  /** Сдвиг баланса Его/Команда за карьеру — одной фразой, если сменился лидер. */
  balanceNote?: string;
  trust?: { from: number; to: number; why: string };
  traces: TraceDelta[];
  /** Смена статуса голоса: стал слышен/замолчал, стал голосом картки. */
  voiceNotes: string[];
};

/** Кого слушаешь за карьеру: Его или Команда — тот, кого слушали больше (Sticker:listenedVoice). */
function listened(counts: Record<VoiceKey, number>): 'ego' | 'team' | null {
  const total = (Object.values(counts) as number[]).reduce((s, n) => s + n, 0);
  if (total === 0 || counts.ego === counts.team) return null;
  return counts.team > counts.ego ? 'team' : 'ego';
}

const ACC: Record<'ego' | 'team', string> = { ego: 'Его', team: 'Команду' };

/** Подписи следов, которые едут в следующий матч. У keeper_read нет правила модификатора
 *  (это ключ к варианту «по підказці»), поэтому подпись здесь. */
const TRACE_LABEL: Record<string, string> = {
  partner_trusts: 'Партнер шукає тебе',
  partner_annoyed: 'Партнер ображений',
  coach_flank: 'Гра піде через твій фланг',
  sub_threat: 'Заміна дихає в спину',
  keeper_read: 'Воротар прочитаний',
};

const risky = (state: MatchState, episodes: Episode[]) => {
  const byId = new Map(episodes.map((e) => [e.id, e]));
  return state.log.filter((e) => {
    if (e.kind !== 'episode') return false;
    const o = byId.get(e.episodeId ?? '')?.options.find((x) => x.id === e.optionId);
    return o?.basePosition === 'risky' || o?.basePosition === 'desperate';
  }).length;
};

const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

/** Почему доверие сдвинулось — одной фразой из того, что тренер видел за матч: оценка и число рисков.
 *  Между матчами доверие ещё и отходит к среднему (nextMatchCoachTrust); если из-за этого стрелка
 *  смотрит не туда, куда матч, — говорим об этом прямо, иначе «38 → 43 за 4,0» читается как похвала. */
function trustWhy(summary: MatchSummary, risks: number, inMatch: number, overall: number): string {
  const rating = summary.coachRating.toFixed(1).replace('.', ',');
  let why: string;
  if (inMatch < 0) why = risks >= 3 ? `За ${rating} і ${risks} ${plural(risks, 'ризик', 'ризики', 'ризиків')}.` : `За ${rating}.`;
  else if (inMatch > 0) why = summary.stats.goals + summary.stats.assists > 0 ? `За ${rating} і участь у голах.` : risks === 0 ? `За ${rating} — без зайвого ризику.` : `За ${rating}.`;
  else why = 'Матч нічого не змінив.';
  if (sign(overall) !== sign(inMatch)) why += overall > 0 ? ' До наступного туру тренер трохи відходить.' : ' До наступного туру запал тренера остигає.';
  return why;
}

export function cardDelta(
  before: Career, after: Career, state: MatchState, summary: MatchSummary, base: Player, episodes: Episode[],
  opponentName?: string,
): CardDelta {
  const voices = (Object.entries(state.voices.counts) as [VoiceKey, number][])
    .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([who, count]) => ({ who, count }));

  const wasListened = listened(before.voiceCounts);
  const nowListened = listened(after.voiceCounts);
  let balanceNote: string | undefined;
  if (nowListened && nowListened !== wasListened) {
    balanceNote = wasListened
      ? `${VOICE_LABEL[nowListened]} тепер перекрикує ${ACC[wasListened]}.`
      : `${VOICE_LABEL[nowListened]} — голос, який ти слухаєш.`;
  }

  const trust = before.coachTrust !== after.coachTrust
    ? { from: before.coachTrust, to: after.coachTrust, why: trustWhy(summary, risky(state, episodes), state.coachTrust - before.coachTrust, after.coachTrust - before.coachTrust) }
    : undefined;

  const traces: TraceDelta[] = [];
  const known = new Set((before.carriedFlags ?? []).map((f) => f.flag + '@' + f.mark.minute));
  for (const f of after.carriedFlags ?? []) {
    if (!CARRIED_FLAGS.includes(f.flag) || known.has(f.flag + '@' + f.mark.minute) || f.mark.previousMatch) continue;
    const label = f.flag === 'keeper_read' && opponentName ? `Воротар «${opponentName}» прочитаний` : TRACE_LABEL[f.flag] ?? f.flag;
    // Минута 0 — след из брифинга (аналитик про воротаря): поступок есть, минуты нет.
    traces.push({ text: label, minute: f.mark.minute > 0 ? f.mark.minute : undefined, past: f.mark.past });
  }
  if (after.pendingSentOff && !before.pendingSentOff) traces.push({ text: 'Червона картка — наступний матч під наглядом тренера', minute: state.marks.sent_off?.minute });
  else if (after.careerYellows > before.careerYellows) {
    const n = after.careerYellows;
    traces.push({ text: n >= 3 ? `Жовта — вже ${n}-я, тренер починає наступний матч насторожі` : 'Жовта картка — тренер пам’ятає', minute: state.marks.booked?.minute });
  }
  if (after.injuredMatches > before.injuredMatches) traces.push({ text: 'Травма — наступний матч зі свіжим болем', minute: state.marks.injured?.minute });

  const voiceNotes: string[] = [];
  const pBefore = effectivePlayer(base, before);
  const pAfter = effectivePlayer(base, after);
  for (const who of ['vision', 'instinct', 'body', 'composure'] as VoiceKey[]) {
    const was = voiceSees(who, pBefore); const now = voiceSees(who, pAfter);
    if (was !== now) voiceNotes.push(now ? `${VOICE_LABEL[who]} тепер бачить.` : `${VOICE_LABEL[who]} більше не бачить.`);
  }
  const domBefore = dominantCareerVoice(before);
  const domAfter = dominantCareerVoice(after);
  if (domAfter && domAfter !== domBefore) voiceNotes.push(`${VOICE_LABEL[domAfter]} тепер говорить з картки.`);
  else if (!domAfter && domBefore) voiceNotes.push('Голос картки ще не визначився — двоє нарівні.');

  return { voices, balanceNote, trust, traces, voiceNotes };
}
