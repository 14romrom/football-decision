import type { Player, VoiceKey } from '../engine/types';
import { attrMod } from '../engine/context';
import { voiceSees, VOICE_LABEL } from '../engine/voices';
import type { Career } from '../engine/career';
import { ourRow, SEASON_ROUNDS, type Season } from '../engine/season';
import { VOICES } from './voices-text';
import { plural } from './pluralize';

// Стикер персонажа (19.09, макет «Картка гравця: було / стало») — по карточке архетипа Disco Elysium:
// портрет в рамке, чёрная плашка с именем, реплика доминантного голоса, четыре бокса — четыре
// атрибутных голоса с модификаторами (заливка у тех, что «бачать»), «+ ЕГО» — голос, который
// слушаешь чаще всех. Полный — шапка картки, компактный — меню кар’єри (тап открывает картку).

const POSITION_LABEL: Record<Player['position'], string> = {
  AM: 'атакувальний півзахисник', CM: 'центральний півзахисник', ST: 'нападник', LW: 'лівий вінгер',
};
const BOX_LABEL: Record<VoiceKey, string> = { vision: 'Бач', instinct: 'Інст', body: 'Тіло', composure: 'Спокій', ego: 'Его', team: 'Ком' };
const ATTR_VOICES: VoiceKey[] = ['vision', 'instinct', 'body', 'composure'];

/** Модификатор голоса — сильнейший из его атрибутов (так же voiceSees смотрит на лучший). */
export function voiceMod(who: VoiceKey, player: Player): number {
  const v = VOICES.find((x) => x.who === who)!;
  return Math.max(0, ...v.attrs.map((a) => attrMod(player.attrs[a])));
}

/** Кого слушаешь: Его или Команда — тот, кого слушали больше; с долей словами. */
export function listenedVoice(counts?: Record<VoiceKey, number>): { who: 'ego' | 'team'; n: number; total: number } | null {
  if (!counts) return null;
  const total = (Object.values(counts) as number[]).reduce((s, n) => s + n, 0);
  if (total === 0) return null;
  const who = (counts.team ?? 0) > (counts.ego ?? 0) ? 'team' : 'ego';
  return { who, n: counts[who] ?? 0, total };
}

type Props = {
  player: Player; career?: Career; season?: Season | null; club?: string;
  /** Доминантный голос карьеры — его реплика под плашкой; null — «голос ще не визначився». */
  dominant?: VoiceKey | null;
  compact?: boolean;
  onOpen?: () => void;
};

export function Sticker({ player, career, season, club, dominant, compact, onOpen }: Props) {
  const row = season && season.round > 0 ? ourRow(season) : null;
  const heard = listenedVoice(career?.voiceCounts);
  const about = dominant ? VOICES.find((v) => v.who === dominant) : null;
  const Tag = onOpen ? 'button' : 'div';

  const boxes = (
    <div className="stk-boxes">
      {ATTR_VOICES.map((who) => {
        const m = voiceMod(who, player);
        return (
          <span key={who} className={`stk-box voice-${who} ${voiceSees(who, player) ? 'on' : ''}`} title={`${VOICE_LABEL[who]} +${m}`}>
            <b>{m}</b><i>{BOX_LABEL[who]}</i>
          </span>
        );
      })}
    </div>
  );

  if (compact) {
    return (
      <Tag className="stk stk-compact" onClick={onOpen} aria-label={onOpen ? 'Картка гравця' : undefined}>
        <span className="stk-frame"><img src="./img/portrait.webp" width="450" height="600" alt="" decoding="async" /></span>
        <span className="stk-side">
          <span className="stk-band">{player.name}</span>
          {boxes}
        </span>
      </Tag>
    );
  }

  return (
    <header className="stk">
      <div className="stk-frame"><img src="./img/portrait.webp" width="450" height="600" alt={player.name} decoding="async" /></div>
      <div className="stk-band">{player.name}</div>
      <p className="stk-role">{POSITION_LABEL[player.position]}{club ? ` «${club}»` : ''} · 10</p>
      {about
        ? <p className={`stk-motto voice-${dominant}`}><b>{VOICE_LABEL[dominant!]}</b> — {about.about}</p>
        : <p className="stk-motto muted">Голос ще не визначився — послухай когось кілька разів.</p>}
      {boxes}
      <p className={`stk-sig ${heard ? `voice-${heard.who}` : 'muted'}`}>
        {heard ? <>+ {VOICE_LABEL[heard.who]}<small>голос, який слухаєш: {heard.n} із {heard.total} {plural(heard.total, 'разу', 'разів', 'разів')}</small></> : <>+ ?<small>голос, який слухаєш, — після першого матчу</small></>}
      </p>
      <dl className="stk-fields">
        <div><dt>Матчів</dt><dd>{career?.matchesPlayed ?? 0}</dd></div>
        <div><dt>Сезон</dt><dd>{season ? `${season.number}, тур ${Math.min(season.round + 1, SEASON_ROUNDS)}` : '—'}</dd></div>
        <div><dt>Місце</dt><dd>{row ? `${row.position}-е` : '—'}</dd></div>
      </dl>
    </header>
  );
}
