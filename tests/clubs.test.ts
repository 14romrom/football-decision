// Назви клубів (31.10): ліга — Центральна Європа, назви з відсилками до польських, угорських, словацьких,
// словенських і чеських клубів (Гурнік, Дунай, Мотор, Олімпія, Сталь, Тиса; Динамо, Дукла, Карпати, Славія).
// У них різний рід і число, тому дієслово при назві клубу узгоджується вставкою
// `{leader:програв|програла|програло|програли}` (engine/names.ts). Тест тримає дані й узгодження, а в контенті —
// що після назви клубу немає дієслова минулого часу без вставки (до правки всі такі рядки були в жіночому роді).
import { describe, it, expect } from 'vitest';
import { fillNames, type Roster } from '../src/engine/names';
import { OPPONENTS, ROSTER } from '../src/content';
import posts from '../src/content/posts.json';
import episodes from '../src/content/episodes.json';
import feed from '../src/content/feed.json';
import espm from '../src/content/espm.json';

describe('назви клубів', () => {
  it('у кожного клубу є називний, родовий і рід', () => {
    for (const [key, o] of Object.entries(OPPONENTS)) {
      expect(o.name.nom, key).toBeTruthy();
      expect(o.name.gen, key).toBeTruthy();
      expect(['m', 'f', 'n', 'pl'], key).toContain(o.name.g);
    }
  });

  it('дієслово узгоджується з родом і числом назви', () => {
    const line = '„{leader}“ {leader:програв|програла|програло|програли}.';
    const say = (nom: string, g: string) => fillNames(line, ROSTER, { leader: nom, 'leader.g': g });
    expect(say('Гурнік', 'm')).toBe('„Гурнік“ програв.');
    expect(say('Славія', 'f')).toBe('„Славія“ програла.');
    expect(say('Динамо', 'n')).toBe('„Динамо“ програло.');
    expect(say('Карпати', 'pl')).toBe('„Карпати“ програли.');
    // Без роду — жіночий, як «Вальмара».
    expect(fillNames(line, ROSTER, { leader: 'Вальмара' })).toBe('„Вальмара“ програла.');
    // {them} — рід із ростера.
    const them = (g: 'm' | 'pl'): Roster => ({ ...ROSTER, base: undefined, them: { ...ROSTER.them, name: { ...ROSTER.them.name, nom: 'X', g } } });
    expect(fillNames('«{them}» {them:розігрує|розігрує|розігрує|розігрують}', them('pl'))).toBe('«X» розігрують');
    expect(fillNames('«{them}» {them:розігрує|розігрує|розігрує|розігрують}', them('m'))).toBe('«X» розігрує');
  });

  it('після назви суперника немає дієслова минулого часу без узгодження', () => {
    const bad: string[] = [];
    const club = /(^|[^А-ЯІЇЄҐа-яіїєґ])([Кк]луб\s+)?[„«]\{(leader|last|bottom|them|next)\}[“»]\s+([А-ЯІЇЄҐа-яіїєґ’']+)/g;
    const walk = (v: unknown) => {
      if (typeof v === 'string') {
        for (const m of v.matchAll(club)) {
          // «{us}» і «{them}» піднялися — два клуби, множина правильна.
          const pair = /[»“]\s+і\s+$/.test(v.slice(0, m.index! + m[1].length));
          if (!m[2] && !pair && /(в|ла|ло|ли|лась|лося|лися)$/.test(m[4])) bad.push(v.slice(0, 90));
        }
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    [posts, episodes, feed, espm].forEach(walk);
    expect(bad).toEqual([]);
  });
});
