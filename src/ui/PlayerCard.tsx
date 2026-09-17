import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABEL, type Attribute, type Player, type VoiceKey } from '../engine/types';
import { attrMod } from '../engine/context';
import { signatureAttrs } from '../engine/conditions';
import { effectivePlayer, POINT_VALUE, xpToNextLevel, type Career } from '../engine/career';
import { VOICE_LABEL, voiceSees } from '../engine/voices';
import { BALANCE } from '../engine/balance';
import { ourRow, SEASON_ROUNDS, type Season } from '../engine/season';
import type { HistoryEntry } from '../telemetry/history';
import { matchWord, plural } from './pluralize';

// Лист персонажа — удостоверение по Disco Elysium: шапка с данными, потом голоси
// (кто в голове говорит, кто бачить, кто мовчить — это и есть характер), и уже потом
// футбольные метрики по разделам: сезон, кар’єра, атрибуты в трёх группах.
// career/season/history — необязательны: без них карточка показывает старт.

const POSITION_LABEL: Record<Player['position'], string> = {
  AM: 'атакувальний півзахисник', CM: 'центральний півзахисник', ST: 'нападник', LW: 'лівий вінгер',
};

/** Что стоит за каждым голосом и его девиз — строка внизу удостоверения, если голос
 *  доминирует в карьере («a piece of the grey sky»). Атрибутные голоса читают силу из
 *  атрибутов (voices.ts), Его и Команда — из того, кого игрок слушал. */
const VOICES: { who: VoiceKey; attrs: Attribute[]; about: string; motto: string }[] = [
  { who: 'ego', attrs: [], about: 'Хоче м’яч. Хоче гол. Хоче, щоб бачили.', motto: 'Ти для цього тут.' },
  { who: 'team', attrs: [], about: 'Знає, де партнер. Іноді — раніше за тебе.', motto: 'Крім тебе — нікого. І нікого, крім них.' },
  { who: 'vision', attrs: ['vision', 'positioning'], about: 'Поле згори. Партнер відкритий за секунду до того, як відкриється.', motto: 'Не вискакуй. Подивись.' },
  { who: 'instinct', attrs: ['dribbling', 'first_touch'], about: 'Стопи, плечі, п’яти суперника. Знає, куди він піде, раніше за нього.', motto: 'Не думай. Він уже впав.' },
  { who: 'body', attrs: ['pace', 'strength'], about: 'Вага, ноги, дихання. Своє і чуже.', motto: 'Наступний стик — твій.' },
  { who: 'composure', attrs: ['composure'], about: 'Півсекунди, яких у інших немає.', motto: 'Є час. Завжди є час.' },
];

type VoiceState = 'sees' | 'heard' | 'silent';
const STATE_LABEL: Record<VoiceState, string> = { sees: 'бачить', heard: 'чутно', silent: 'мовчить' };

function attrVoiceState(who: VoiceKey, attrs: Attribute[], player: Player): VoiceState {
  if (voiceSees(who, player)) return 'sees';
  return attrs.some((a) => attrMod(player.attrs[a]) >= BALANCE.voiceMinMod) ? 'heard' : 'silent';
}

/** Его и Команда спорят: кто перекрикує — по тому, кого слушали за карьеру. */
function wantsState(who: 'ego' | 'team', counts?: Record<VoiceKey, number>): { state: VoiceState; note: string } {
  const ego = counts?.ego ?? 0;
  const team = counts?.team ?? 0;
  if (ego + team === 0) return { state: 'heard', note: 'ще не сперечалися' };
  const mine = who === 'ego' ? ego : team;
  const other = who === 'ego' ? team : ego;
  if (mine >= other * 1.5 && mine > 0) return { state: 'sees', note: who === 'ego' ? 'перекрикує Команду' : 'перекрикує Его' };
  if (other >= mine * 1.5) return { state: 'silent', note: who === 'ego' ? 'поступається Команді' : 'поступається Его' };
  return { state: 'heard', note: who === 'ego' ? 'сперечається з Командою' : 'сперечається з Его' };
}

function dominantCareerVoice(counts?: Record<VoiceKey, number>): VoiceKey | null {
  if (!counts) return null;
  const entries = Object.entries(counts) as [VoiceKey, number][];
  const total = entries.reduce((s, [, n]) => s + n, 0);
  if (total < BALANCE.voiceDominantMin) return null;
  const [who, n] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return n / total >= 0.3 ? who : null;
}

type Props = {
  player: Player;
  career?: Career;
  season?: Season | null;
  history?: HistoryEntry[];
  /** Название клуба в именительном — в шапку удостоверения. */
  club?: string;
  onBack?: () => void;
};

export function PlayerCard({ player, career, season, history, club, onBack }: Props) {
  const effective = career ? effectivePlayer(player, career) : player;
  const signature = signatureAttrs(effective);
  const weakest = [...(Object.keys(effective.attrs) as Attribute[])]
    .sort((a, b) => effective.attrs[a] - effective.attrs[b]).slice(0, 2);
  const progress = career ? xpToNextLevel(career.xp) : null;
  const dominant = dominantCareerVoice(career?.voiceCounts);
  const motto = dominant ? VOICES.find((v) => v.who === dominant)!.motto : null;

  const row = season && season.round > 0 ? ourRow(season) : null;
  const sp = season?.player;
  const wdl = (history ?? []).reduce((acc, h) => { acc[h.result] += 1; return acc; }, { W: 0, D: 0, L: 0 });

  return (
    <div className="player-card">
      <header className="id-card">
        <div className="id-name">
          <h1>{player.name}</h1>
          <p className="muted">{POSITION_LABEL[player.position]}{club ? ` · «${club}»` : ''}</p>
        </div>
        <dl className="id-fields">
          <dt>Рівень</dt><dd>{career?.level ?? 1}</dd>
          <dt>Матчів</dt><dd>{career?.matchesPlayed ?? 0}</dd>
          <dt>Сезон</dt><dd>{season ? `${season.number}, тур ${season.round} з ${SEASON_ROUNDS}` : '—'}</dd>
          <dt>Місце</dt><dd>{row ? `${row.position}-е, ${row.points} ${plural(row.points, 'очко', 'очки', 'очок')}` : '—'}</dd>
        </dl>
        {motto && <p className="id-motto">{VOICE_LABEL[dominant!]}: «{motto}»</p>}
      </header>

      <section className="voices-block">
        <h2>Голоси</h2>
        {VOICES.map((v) => {
          const isWants = v.who === 'ego' || v.who === 'team';
          const wants = isWants ? wantsState(v.who as 'ego' | 'team', career?.voiceCounts) : null;
          const state: VoiceState = wants ? wants.state : attrVoiceState(v.who, v.attrs, effective);
          const listened = career?.voiceCounts?.[v.who] ?? 0;
          return (
            <div key={v.who} className={`voice-row voice-${v.who} state-${state}`}>
              <div className="voice-head">
                <b>{VOICE_LABEL[v.who]}</b>
                <span className={`voice-state state-${state}`}>{wants ? wants.note : STATE_LABEL[state]}</span>
              </div>
              <p className="voice-about">{v.about}</p>
              <p className="voice-meta muted">
                {v.attrs.length > 0
                  ? v.attrs.map((a) => `${ATTRIBUTE_LABEL[a]} +${attrMod(effective.attrs[a])}`).join(' · ')
                  : 'не атрибут — те, чого ти хочеш'}
                {listened > 0 && ` · слухав ${listened} ${plural(listened, 'раз', 'рази', 'разів')}`}
              </p>
            </div>
          );
        })}
        <p className="card-summary">
          <b>Бачить</b> — відкриває варіанти, яких інші не побачать. <b>Чутно</b> — підказує на кнопці і дає +1.
          <b> Мовчить</b> — кубик грає сам. Прокачка атрибута робить голос голоснішим.
        </p>
      </section>

      {(sp || history) && (
        <section className="stats-block">
          <h2>Сезон</h2>
          <dl className="stats-grid">
            <dt>Матчі</dt><dd>{sp?.matches ?? 0}</dd>
            <dt>Голи</dt><dd>{sp?.goals ?? 0}</dd>
            <dt>Передачі</dt><dd>{sp?.assists ?? 0}</dd>
            <dt>Оцінка тренера</dt><dd>{sp && sp.matches ? (sp.coachSum / sp.matches).toFixed(1) : '—'}</dd>
            <dt>Оцінка трибун</dt><dd>{sp && sp.matches ? (sp.fanSum / sp.matches).toFixed(1) : '—'}</dd>
            <dt>Довіра тренера</dt><dd>{career ? career.coachTrust : '—'}</dd>
          </dl>
          <h2>Кар’єра</h2>
          <dl className="stats-grid">
            <dt>Матчі</dt><dd>{career?.matchesPlayed ?? 0}</dd>
            <dt>В — Н — П</dt><dd>{wdl.W} — {wdl.D} — {wdl.L}</dd>
            <dt>Рівень</dt><dd>{career?.level ?? 1}{progress ? ` · до наступного ${progress.xpForLevel - progress.xpIntoLevel} досв.` : ' · стеля'}</dd>
            <dt>Жовті без згоряння</dt><dd>{career?.careerYellows ?? 0}</dd>
          </dl>
          {progress && (
            <span className="bar-track xp-track">
              <span className="bar-fill xp-fill" style={{ width: `${Math.round((progress.xpIntoLevel / progress.xpForLevel) * 100)}%` }} />
            </span>
          )}
        </section>
      )}

      {ATTRIBUTE_GROUPS.map((g) => (
        <section key={g.title} className="attr-group">
          <h2>{g.title}</h2>
          {g.attrs.map((a) => {
            const v = effective.attrs[a];
            const bonus = career?.attrPoints[a] ?? 0;
            const m = attrMod(v);
            const tone = signature.includes(a) ? 'signature' : weakest.includes(a) ? 'weak' : '';
            return (
              <div key={a} className={`attr-row ${tone}`}>
                <span className="attr-name">{ATTRIBUTE_LABEL[a]}</span>
                <span className="attr-track"><span className="attr-fill" style={{ width: `${v}%` }} /></span>
                <span className="attr-value">{v}{bonus > 0 && <b className="attr-bonus"> +{bonus * POINT_VALUE}</b>}</span>
                <span className={`attr-mod ${m === 0 ? 'zero' : ''}`}>+{m}</span>
              </div>
            );
          })}
        </section>
      ))}

      <p className="card-summary">
        <b>Коронне:</b> {signature.map((a) => ATTRIBUTE_LABEL[a]).join(', ')} — за це тебе знають трибуни.
        {' '}<b>Слабке:</b> {weakest.map((a) => ATTRIBUTE_LABEL[a]).join(', ')} — тут кубик грає сам.
        {career && ` ${career.matchesPlayed} ${matchWord(career.matchesPlayed)} за плечима.`}
      </p>

      {onBack && <button className="primary" onClick={onBack}>Назад</button>}
    </div>
  );
}
