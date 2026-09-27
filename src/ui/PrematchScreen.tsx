import type { MatchConditions } from '../engine/conditions';
import { signatureAttrs } from '../engine/conditions';
import type { Player } from '../engine/types';
import type { Opponent } from '../content';
import { monthOfRound } from '../engine/season';
import { ATTR_GEN, INSTRUCTION, WEATHER, toneLines } from './prematch-text';

// Екран Реєса перед матчем (27.09): усе, що пояснює гравцеві його рішення, — тут, а не в програмці.
// Правило поділу: **програмка друкує те, що знає місто; цей екран — те, що знає Реєс.** Установка
// тренера з наслідком, форма й утома, стан після минулого туру, що зроблять погода й чужий стадіон,
// і пам'ять про суперника: торішні рахунки, колишній дублер у їхній формі.
//
// Це перший крок переносу (макет матчдея, 27.09): верстка поки успадкована від брифінга — темні рядки
// «ярлик / текст». Наступний крок — свій макет екрана; тексти й порядок блоків уже фінальні.

type Props = {
  conditions: MatchConditions;
  opponent: Opponent;
  player: Player;
  round: number;
  /** Заметка про Реєса прозою (engine/programme.ts) — поки лишається як була. */
  note: string;
  /** Риса суперника голосом клубу. */
  trait: string | null;
  /** Торішні рахунки з цим суперником — пам'ять Реєса, не довідка міста. */
  lastYear?: { scoreUs: number; scoreThem: number; venue: 'home' | 'away' }[] | null;
  /** Колишній дублер у складі суперника. */
  subThere?: string | null;
  /** Іменний гравець у складі суперника (programme.ts:HUNTER): суха довідка зі складу — Реєс не реагує,
   *  бо не знає обличчя; знає гравець. Після переїзду програмки в афішу жарт живе тут. */
  guest?: string | null;
  /** Слово тренера про мету клубу (programme.ts:coachGoalWord). */
  coachExtra?: string | null;
  onNext: () => void;
};

export function PrematchScreen({ conditions, opponent, player, round, note, trait, lastYear, subThere, guest, coachExtra, onNext }: Props) {
  const instr = INSTRUCTION[conditions.instruction === 'none' ? 'free' : conditions.instruction];
  const tone = toneLines(conditions);
  const weather = WEATHER[conditions.weather];
  const sig = signatureAttrs(player).map((a) => ATTR_GEN[a]);
  const venue = conditions.venue === 'home'
    ? `Вдома. Трибуни знають тебе і чекають ${sig[0]} та ${sig[1]}.`
    : 'Виїзд. Чужий стадіон: свист замість підтримки, а в кінцівці — особливо.';
  const lastYearLine = lastYear?.length
    ? `Торік: ${lastYear.map((r) => `${r.scoreUs}:${r.scoreThem} ${r.venue === 'home' ? 'вдома' : 'на виїзді'}`).join(', ')}.`
    : '';
  const memory = [lastYearLine, subThere ? `У їхній формі — ${subThere}, торік ваш дублер.` : '', trait ?? ''].filter(Boolean).join(' ');

  return (
    <div className="prematch plain-screen">
      <div className="pm-top">Тур {round} · {monthOfRound(round)} · «{opponent.name.nom}»</div>

      <div className="pm-quote">
        <b>Установка: {instr.title.toLowerCase()}</b>
        <p className="pm-said">{instr.quote}</p>
        <p className="pm-means">{instr.note}{coachExtra ? ` ${coachExtra}` : ''}</p>
      </div>

      <dl className="conditions pm-list">
        <div><dt>Форма</dt><dd><b>{tone.title}.</b> {tone.note}</dd></div>
        <div><dt>Поле</dt><dd>{venue}</dd></div>
        <div><dt>Погода</dt><dd><b>{weather.title}.</b> {weather.note}</dd></div>
        <div><dt>Стан</dt><dd>{note}</dd></div>
        {memory && <div><dt>Пам’ять</dt><dd>{memory}</dd></div>}
        {guest && <div><dt>Їхній склад</dt><dd>{guest}</dd></div>}
      </dl>

      <button className="primary menu-primary" onClick={onNext}>Далі</button>
    </div>
  );
}
