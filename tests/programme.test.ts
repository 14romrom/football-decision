// Програмка (engine/programme.ts): заметка «Реєс» — проза без чисел, кроме счёта и вех; черта соперника голосом клуба.
import { describe, it, expect } from 'vitest';
import { HUNTER, hunterRound, programmeNote, traitNote, TRAIT_NOTE, type ProgrammeInput } from '../src/engine/programme';

const base: ProgrammeInput = { round: 4, last: { scoreUs: 0, scoreThem: 4, opponentGen: 'Порту-Бланко' }, confidence: -1, scoringStreak: 0, dryStreak: 1, weekActivities: [{ id: 'yoga', title: 'Йога' }, { id: 'interview', title: 'Інтерв’ю' }], coachTrust: 55, matchesPlayed: 3 };

describe('програмка', () => {
  // Голос прес-служби (21.09): з тижня — тільки публічне (йога прес-службі невідома), довіра — словами про тренера.
  it('заметка собирается из прошлого матча, публичного дела тижня и слов о тренере — без дыр и без «!»', () => {
    const n = programmeNote(base);
    expect(n).toContain('Після поразки 0:4 проти «Порту-Бланко»');
    expect(n).toContain('Цього тижня — інтерв’ю.');
    expect(n).not.toContain('йога');
    expect(n).toContain('Тренер придивляється.');
    expect(n).not.toMatch(/!|\s\s|%/);
  });
  it('первый тур — дебют; серия — словами; веха — десятый матч', () => {
    expect(programmeNote({ ...base, round: 1, last: null, weekActivities: [] })).toMatch(/^Дебютує в сезоні\. Тренер придивляється\./);
    expect(programmeNote({ ...base, scoringStreak: 3 })).toContain('Третій матч поспіль із результативною дією.');
    expect(programmeNote({ ...base, matchesPlayed: 9 })).toContain('Десятий матч за клуб.');
    expect(programmeNote({ ...base, coachTrust: 30 })).toContain('останнє попередження');
    expect(programmeNote({ ...base, coachTrust: 80 })).toContain('Тренер сумнівів не має.');
  });
  it('черта соперника — одна фраза, сторона по полю; все десять черт покрыты', () => {
    expect(traitNote(['hard'], 'home')).toBe('Опорник гостей — сім карток за сезон.');
    expect(traitNote(['hard'], 'away')).toContain('господарів');
    expect(traitNote(['unknown'], 'home')).toBeNull();
    for (const t of ['star', 'dribbler', 'playmaker', 'veteran', 'youngster', 'hard', 'rookie', 'target', 'captain', 'local']) expect(TRAIT_NOTE[t], t).toBeTruthy();
  });
  // Пасхалка: Алекс Хантер, № 29, 32 роки — тільки 2-й тур першого сезону; програмка суха, зошит не пояснює, звідки обличчя.
  it('Алекс Хантер — один раз за кар’єру, № 29, без «!»', () => {
    expect(hunterRound(1, 2)).toBe(true);
    expect(hunterRound(1, 1)).toBe(false);
    expect(hunterRound(1, 3)).toBe(false);
    expect(hunterRound(2, 2)).toBe(false);
    expect(HUNTER.programme).toContain('№ 29 Алекс Хантер, 32 роки');
    expect(HUNTER.notebook).toContain('Алекс Хантер');
    expect(HUNTER.notebook).not.toMatch(/FIFA|Journey|\bEA\b/);
    expect(HUNTER.programme + HUNTER.notebook).not.toMatch(/!|%/);
  });
});
