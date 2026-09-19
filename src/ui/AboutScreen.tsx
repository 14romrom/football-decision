import { VOICE_LABEL } from '../engine/voices';
import { VOICES } from './PlayerCard';

// Про гру (19.09): версия, одна фраза о том, что это за игра, и голоса представляются сами —
// тексты из VOICES картки, ничего нового не пишем. Ссылка на форму фидбэка появится, когда будет форма.

type Props = { onBack: () => void };

export function AboutScreen({ onBack }: Props) {
  const build = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__.slice(0, 7) : 'dev';
  return (
    <div className="about plain-screen">
      <p className="eyebrow">Inside the Box</p>
      <h1>Про гру</h1>
      <p className="about-lead">Гра про те, як дев’ять разів за матч не послухати себе. Один футболіст, шість голосів у голові, два кубики — і тренер із трибунами, які хочуть різного.</p>

      <h2 className="sect">Голоси</h2>
      <ul className="about-voices">
        {VOICES.map((v) => (
          <li key={v.who} className={`say voice-${v.who}`}><b>{VOICE_LABEL[v.who]}</b> — {v.about} <i>«{v.motto}»</i></li>
        ))}
      </ul>

      <h2 className="sect">Правила, яких гра дотримується</h2>
      <ul className="about-rules">
        <li>Жодних відсотків. Форма ризику й ціль — усе, що ти знаєш до кидка.</li>
        <li>Переграти не можна. Кубик один, і він уже впав.</li>
        <li>Голос, якого слухаєш, стає гучнішим. Голос, якого ігноруєш, ображається.</li>
      </ul>

      <p className="about-refs">Натхнення: Disco Elysium, Football Manager і кожен матч, де ти знав, як треба, і зробив інакше.</p>

      <button className="row row-back" onClick={onBack}>На титул</button>
      <p className="build">тестова збірка · {build} · ukr · тексти й код — прототип</p>
    </div>
  );
}
