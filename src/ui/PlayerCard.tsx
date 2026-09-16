import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABEL, type Player } from '../engine/types';
import { attrMod } from '../engine/context';
import { signatureAttrs } from '../engine/conditions';
import { effectivePlayer, xpToNextLevel, type Career } from '../engine/career';
import { matchWord } from './pluralize';

// Лист персонажа. Значение и модификатор к броску рядом: игрок должен понимать,
// что 62 — это +4 к кубику, а 47 — ноль, и выбирать варианты под себя.
// career — необязателен: без него карточка показывает голые стартовые атрибуты
// (как раньше), с ним — рост поверх старта виден отдельной строкой.

const POSITION_LABEL: Record<Player['position'], string> = {
  AM: 'атакувальний півзахисник', CM: 'центральний півзахисник', ST: 'нападник', LW: 'лівий вінгер',
};

export function PlayerCard({ player, career, onBack }: { player: Player; career?: Career; onBack?: () => void }) {
  const effective = career ? effectivePlayer(player, career) : player;
  const signature = signatureAttrs(effective);
  const weakest = [...(Object.keys(effective.attrs) as (keyof Player['attrs'])[])]
    .sort((a, b) => effective.attrs[a] - effective.attrs[b]).slice(0, 2);
  const progress = career ? xpToNextLevel(career.xp) : null;

  return (
    <div className="player-card">
      <header>
        <h1>{player.name}</h1>
        <p className="muted">{player.position} · {POSITION_LABEL[player.position]}</p>
      </header>

      {career && (
        <section className="level-block">
          <div className="level-row">
            <span className="level-badge">{career.level} рівень</span>
            <span className="muted">{career.matchesPlayed} {matchWord(career.matchesPlayed)} за плечима</span>
          </div>
          {progress ? (
            <span className="bar-track xp-track">
              <span className="bar-fill xp-fill" style={{ width: `${Math.round((progress.xpIntoLevel / progress.xpForLevel) * 100)}%` }} />
            </span>
          ) : (
            <p className="muted">Максимум таблиці рівнів досягнуто.</p>
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
                <span className="attr-value">{v}{bonus > 0 && <b className="attr-bonus"> +{bonus}</b>}</span>
                <span className={`attr-mod ${m === 0 ? 'zero' : ''}`}>+{m}</span>
              </div>
            );
          })}
        </section>
      ))}

      <p className="card-summary">
        <b>Коронне:</b> {signature.map((a) => ATTRIBUTE_LABEL[a]).join(', ')} — за це тебе знають трибуни.
        {' '}<b>Слабке:</b> {weakest.map((a) => ATTRIBUTE_LABEL[a]).join(', ')} — тут кубик грає сам.
      </p>

      {onBack && <button className="primary" onClick={onBack}>Назад</button>}
    </div>
  );
}
