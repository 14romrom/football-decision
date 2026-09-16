import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABEL, type Player } from '../engine/types';
import { attrMod } from '../engine/context';
import { signatureAttrs } from '../engine/conditions';

// Лист персонажа. Значение и модификатор к броску рядом: игрок должен понимать,
// что 62 — это +4 к кубику, а 47 — ноль, и выбирать варианты под себя.
// Прокачка (M2) добавит сюда уровень, опыт и тренировку — сетка под это уже есть.

const POSITION_LABEL: Record<Player['position'], string> = {
  AM: 'атакувальний півзахисник', CM: 'центральний півзахисник', ST: 'нападник', LW: 'лівий вінгер',
};

export function PlayerCard({ player, onBack }: { player: Player; onBack?: () => void }) {
  const signature = signatureAttrs(player);
  const weakest = [...(Object.keys(player.attrs) as (keyof Player['attrs'])[])]
    .sort((a, b) => player.attrs[a] - player.attrs[b]).slice(0, 2);

  return (
    <div className="player-card">
      <header>
        <h1>{player.name}</h1>
        <p className="muted">{player.position} · {POSITION_LABEL[player.position]}</p>
      </header>

      {ATTRIBUTE_GROUPS.map((g) => (
        <section key={g.title} className="attr-group">
          <h2>{g.title}</h2>
          {g.attrs.map((a) => {
            const v = player.attrs[a];
            const m = attrMod(v);
            const tone = signature.includes(a) ? 'signature' : weakest.includes(a) ? 'weak' : '';
            return (
              <div key={a} className={`attr-row ${tone}`}>
                <span className="attr-name">{ATTRIBUTE_LABEL[a]}</span>
                <span className="attr-track"><span className="attr-fill" style={{ width: `${v}%` }} /></span>
                <span className="attr-value">{v}</span>
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
