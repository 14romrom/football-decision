import type { Player, VoiceKey } from '../engine/types';
import { BALANCE } from '../engine/balance';
import { VOICE_LABEL } from '../engine/voices';
import { voiceMod } from './Sticker';

// Шестикутник голосів — шапка картки (28.09, макет «Картка: було / стало»).
// Шість осей в одних одиницях: модифікатор найсильнішого атрибута голоса. Раньше на карточке стояли
// четыре бокса, и характер читался списком; фигура показывает его формой — что перевешивает и чего нет.
//
// Его і Команда — такі самі осі, як інші: у них теж є атрибут (удар і пас). Заливки «бачить» у них не
// буває — вони бачать за станом матчу, не за силою атрибута (voices.ts:voiceSeesNow), і про це каже
// розшифровка в підвалі картки.
//
// Шкала росте разом із гравцем: кільця через два модифікатора, зовнішнє — не менше восьми. Жёстко 8
// нельзя: потолок мода 12 (ATTR_MOD.max), и к концу второго сезона фигура упёрлась бы в край.

const CX = 155;
const CY = 115;
const R = 82;
const LABEL_AT = 1.2;

/** Углы от севера по часовой: Его і Команда одна проти одної, атрибутні голоси по кутах. */
const AXES: { who: VoiceKey; angle: number }[] = [
  { who: 'instinct', angle: 30 },
  { who: 'ego', angle: 90 },
  { who: 'body', angle: 150 },
  { who: 'composure', angle: 210 },
  { who: 'team', angle: 270 },
  { who: 'vision', angle: 330 },
];

function point(angle: number, f: number): [number, number] {
  const r = (angle * Math.PI) / 180;
  return [CX + R * f * Math.sin(r), CY - R * f * Math.cos(r)];
}

function ring(f: number): string {
  return AXES.map((a) => point(a.angle, f).map((n) => n.toFixed(1)).join(',')).join(' ');
}

export function VoiceHex({ player }: { player: Player }) {
  const mods = AXES.map((a) => ({ ...a, mod: voiceMod(a.who, player) }));
  const top = Math.max(...mods.map((m) => m.mod));
  const scale = Math.max(8, Math.ceil(top / 2) * 2);
  const rings: number[] = [];
  for (let step = 2; step <= scale; step += 2) rings.push(step / scale);

  return (
    <svg
      className="hex" viewBox="0 0 310 240" role="img"
      aria-label={mods.map((m) => `${VOICE_LABEL[m.who]} +${m.mod}`).join(', ')}
    >
      {rings.map((f) => <polygon key={f} className={f === 1 ? 'hex-ring hex-edge' : 'hex-ring'} points={ring(f)} />)}
      {/* Кільце «бачить»: з цього модифікатора голос відкриває варіанти (voices.ts:voiceSees). */}
      <polygon className="hex-sees" points={ring(BALANCE.insightMinMod / scale)} />
      {mods.map((m) => {
        const [x, y] = point(m.angle, 1);
        return <line key={m.who} className="hex-axis" x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)} />;
      })}
      <polygon className="hex-shape" points={mods.map((m) => point(m.angle, m.mod / scale).map((n) => n.toFixed(1)).join(',')).join(' ')} />
      {mods.map((m) => {
        const [dx, dy] = point(m.angle, m.mod / scale);
        const [lx, ly] = point(m.angle, LABEL_AT);
        const side = Math.sin((m.angle * Math.PI) / 180);
        const anchor = side > 0.2 ? 'start' : side < -0.2 ? 'end' : 'middle';
        return (
          <g key={m.who} className={`voice-${m.who}`}>
            <circle className="hex-dot" cx={dx.toFixed(1)} cy={dy.toFixed(1)} r="3.2" />
            <text className="hex-name" x={lx.toFixed(1)} y={(ly + 4).toFixed(1)} textAnchor={anchor}>{VOICE_LABEL[m.who]}</text>
            <text className="hex-mod" x={lx.toFixed(1)} y={(ly + 17).toFixed(1)} textAnchor={anchor}>+{m.mod}</text>
          </g>
        );
      })}
    </svg>
  );
}
