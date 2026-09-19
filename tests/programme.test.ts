// Програмка (engine/programme.ts): заметка «Реєс» — проза без чисел, кроме счёта и вех; черта соперника голосом клуба.
import { describe, it, expect } from 'vitest';
import { programmeNote, traitNote, TRAIT_NOTE, type ProgrammeInput } from '../src/engine/programme';

const base: ProgrammeInput = { round: 4, last: { scoreUs: 0, scoreThem: 4, opponentGen: 'Порту-Бланко' }, confidence: -1, scoringStreak: 0, dryStreak: 1, weekActivities: ['Йога', 'Відео з аналітиком'], coachTrust: 55, matchesPlayed: 3 };

describe('програмка', () => {
  it('заметка собирается из прошлого матча, тижня и статуса у тренера — без дыр и без «!»', () => {
    const n = programmeNote(base);
    expect(n).toContain('Після поразки 0:4 проти «Порту-Бланко»');
    expect(n).toContain('Тиждень — йога та відео з аналітиком.');
    expect(n).toContain('тренер дивиться уважно');
    expect(n).not.toMatch(/!|\s\s|%/);
  });
  it('первый тур — дебют; серия — словами; веха — десятый матч', () => {
    expect(programmeNote({ ...base, round: 1, last: null, weekActivities: [] })).toMatch(/^Дебютує в сезоні\. Тиждень провів на базі\./);
    expect(programmeNote({ ...base, scoringStreak: 3 })).toContain('Третій матч поспіль із результативною дією.');
    expect(programmeNote({ ...base, matchesPlayed: 9 })).toContain('Десятий матч за клуб.');
    expect(programmeNote({ ...base, coachTrust: 30 })).toContain('останнім попередженням');
    expect(programmeNote({ ...base, coachTrust: 80 })).toContain('беззаперечне');
  });
  it('черта соперника — одна фраза, сторона по полю; все десять черт покрыты', () => {
    expect(traitNote(['hard'], 'home')).toBe('Опорник гостей — сім карток за сезон.');
    expect(traitNote(['hard'], 'away')).toContain('господарів');
    expect(traitNote(['unknown'], 'home')).toBeNull();
    for (const t of ['star', 'dribbler', 'playmaker', 'veteran', 'youngster', 'hard', 'rookie', 'target', 'captain', 'local']) expect(TRAIT_NOTE[t], t).toBeTruthy();
  });
});
