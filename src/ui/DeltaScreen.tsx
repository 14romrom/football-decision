import type { Player, VoiceKey } from '../engine/types';
import type { Career } from '../engine/career';
import type { Season } from '../engine/season';
import type { CardDelta } from '../engine/board';
import { VOICE_LABEL } from '../engine/voices';
import { Sticker } from './Sticker';

// Картка з дельтою (19.09, макет «Після матчу», кадр 2) — что изменилось в картке за матч:
// компактный стикер (тап — полная картка), «Що змінилось»: голоса, которые слушал, довіра
// тренера було → стало с причиной, нові сліди с минутой поступка, «Голос» — только при смене
// статуса. Пустые рубрики скрыты; если не изменилось ничего — одна строка об этом.

type Props = {
  player: Player; career: Career; season: Season | null; dominant: VoiceKey | null;
  delta: CardDelta; onOpenCard: () => void; onNext: () => void;
};

export function DeltaScreen({ player, career, season, dominant, delta, onOpenCard, onNext }: Props) {
  const empty = delta.voices.length === 0 && !delta.trust && delta.traces.length === 0 && delta.voiceNotes.length === 0;
  return (
    <div className="delta-screen">
      <Sticker compact player={player} career={career} season={season} dominant={dominant} onOpen={onOpenCard} />
      <h2>Що змінилось за матч</h2>
      {empty ? (
        <p className="muted">Нічого. Тренер не помітив, голоси мовчали, сліду не лишилось.</p>
      ) : (
        <dl className="delta">
          {delta.voices.length > 0 && (
            <div>
              <dt>Голоси</dt>
              <dd>
                {delta.voices.map(({ who, count }) => (
                  <span key={who} className="delta-voice">
                    <b className={`vc voice-${who}`}>{VOICE_LABEL[who]}</b> +{count}
                    <span className={`delta-bar voice-${who}`} aria-hidden="true">{Array.from({ length: count }, (_, i) => <i key={i} />)}</span>
                  </span>
                ))}
                {delta.balanceNote && <span className="muted">{delta.balanceNote}</span>}
              </dd>
            </div>
          )}
          {delta.trust && (
            <div>
              <dt>Тренер</dt>
              <dd>
                Довіра {delta.trust.from} → <span className={delta.trust.to < delta.trust.from ? 'down' : 'up'}>{delta.trust.to}</span>.{' '}
                <span className="muted">{delta.trust.why}</span>
              </dd>
            </div>
          )}
          {delta.traces.length > 0 && (
            <div>
              <dt>Сліди</dt>
              <dd>
                {delta.traces.map((t, i) => (
                  <span key={i} className="delta-trace">
                    {t.text}{t.past || t.minute ? <span className="muted"> — {[t.past, t.minute ? `${t.minute}′` : ''].filter(Boolean).join(', ')}</span> : null}
                  </span>
                ))}
              </dd>
            </div>
          )}
          {delta.voiceNotes.length > 0 && (
            <div>
              <dt>Голос</dt>
              <dd>{delta.voiceNotes.map((n, i) => <span key={i} className="delta-trace">{n}</span>)}</dd>
            </div>
          )}
        </dl>
      )}
      <p className="muted delta-hint">Тап по стикеру — повна картка.</p>
      <button className="primary menu-primary" onClick={onNext}>Далі</button>
    </div>
  );
}
