import type { VoiceKey } from '../engine/types';
import { VOICE_LABEL } from '../engine/voices';
import { shotFor } from '../content';

// Розділювач глави (M24, 26.09, макет «Лист якоря»): глав чотири, і вони збігаються з сезонами —
// пролог, перший сезон, другий сезон, епілог. Розворот повторює композицію титулу: кадр, назва
// капітеллю в кольорі логотипа, під нею репліка голосом. Кожна глава відкривається маленьким титулом
// гри. Відсотків проходження немає — сходинки показують, де ти, і не обіцяють точності, якої в
// історії немає (правило проєкту, тест грепає екрани).

export type Chapter = {
  id: string;
  rom: string;
  title: string;
  voice: VoiceKey;
  line: string;
  /** Id сцени, чий кадр беремо (public/img/anchors). Без нього — розворот без кадру. */
  shot?: string;
};

type Props = { chapter: Chapter; index: number; total: number; onNext: () => void };

export function ChapterCard({ chapter, index, total, onNext }: Props) {
  const shot = chapter.shot ? shotFor(chapter.shot) : null;
  return (
    <div className="chapter-wrap">
      <div className="chapter-card">
        {shot && (
          <div className="chapter-shot">
            <img src={shot.src} alt="" decoding="async" style={{ objectPosition: shot.focus }} />
          </div>
        )}
        <div className="chapter-body">
          <span className="chapter-rom">{chapter.rom}</span>
          <h1 className="chapter-title">{chapter.title}</h1>
          <p className="chapter-line"><b className={`voice-${chapter.voice}`}>{VOICE_LABEL[chapter.voice]}</b> — {chapter.line}</p>
          <div className="chapter-ladder" aria-label={`${index + 1} з ${total}`}>
            {Array.from({ length: total }, (_, i) => (
              <i key={i} className={i < index ? 'done' : i === index ? 'here' : ''} />
            ))}
          </div>
        </div>
      </div>
      <button className="primary menu-primary" onClick={onNext}>Далі</button>
    </div>
  );
}
