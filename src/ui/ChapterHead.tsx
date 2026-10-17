import { CHAPTERS } from '../content';
import { prologuePending } from '../engine/prologue';
import type { Career } from '../engine/career';
import type { Season } from '../engine/season';
import type { Chapter } from './ChapterCard';

// Шапка глави (17.10, макет «Пауза, сезон і головне меню»): дрібний рядок капітеллю і назва глави
// червоною. Один прийом на три місця — розворот глави, пауза і головне меню для того, хто повертається, —
// і один компонент, щоб вони не розійшлися (рішення користувача: «соблюдай единство стиля»).

/** Глава, у якій зараз кар'єра: пролог до першого матчу, далі сезон за номером, після фіналу — епілог. */
export function currentChapter(career: Career, season: Season | null): Chapter {
  const id = career.ended ? 'epilogue'
    : prologuePending(career) ? 'prologue'
    : (season?.number ?? 1) >= 2 ? 'season2' : 'season1';
  return CHAPTERS.find((c) => c.id === id) ?? CHAPTERS[0];
}

type Props = {
  chapter: Chapter;
  /** Що стоїть у дрібному рядку поруч із номером глави: «Пауза», місяць. Порожні частини пропускаються. */
  before?: string;
  after?: string;
  /** `sm` — пауза й головне меню; без нього — розмір розвороту глави. */
  size?: 'sm';
  as?: 'h1' | 'h2';
};

export function ChapterHead({ chapter, before, after, size, as: Tag = 'h2' }: Props) {
  const eyebrow = [before, chapter.rom, after].filter(Boolean).join(' · ');
  return (
    <div className={`chapter-head${size ? ` ${size}` : ''}`}>
      {eyebrow && <span className="chapter-rom">{eyebrow}</span>}
      <Tag className="chapter-title">{chapter.title}</Tag>
    </div>
  );
}
