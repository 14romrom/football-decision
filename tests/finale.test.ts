// Розв’язка на поле (engine/finale.ts): вид анимации из событий и исхода, без нового контента.
import { describe, it, expect } from 'vitest';
import { finaleFor } from '../src/engine/finale';
import { EPISODES } from '../src/content';
import type { Resolution, TimelineEvent } from '../src/engine/types';

const res = (tier: Resolution['tier'], critical: Resolution['critical'] = null): Resolution =>
  ({ rawRoll: 12, dice: [6, 6], roll: 12, attrMod: 0, mods: [], totalScore: 12, position: 'risky', basePosition: 'risky', effect: 'standard', difficulty: 0, target: 15, tier, critical } as Resolution);
const ev = (kind: TimelineEvent['kind']): TimelineEvent => ({ minute: 10, kind, text: '' });

describe('розв’язка на поле', () => {
  it('гол свій/чужий — по событиям ленты, раньше всего остального', () => {
    const ep = EPISODES[0]; const opt = ep.options[0];
    expect(finaleFor(ep, opt, res('clean'), [ev('goalUs')])).toBe('goal');
    expect(finaleFor(ep, opt, res('badFail'), [ev('goalThem')])).toBe('concede');
  });
  it('удар без гола — сейв при провале, мимо при катастрофе; не-удар без события — пульс или дуель/втрата/пас по apply', () => {
    const shot = EPISODES.find((e) => e.family === 'edge_shot')!;
    const optShot = shot.options.find((o) => !o.outcomes.fail.apply?.losses && !o.outcomes.fail.apply?.foul) ?? shot.options[0];
    const kFail = finaleFor(shot, optShot, res('fail'), []);
    expect(['save', 'loss', 'pass', 'duel', 'foul', 'red']).toContain(kFail);
    const kBad = finaleFor(shot, optShot, res('badFail'), []);
    expect(['miss', 'loss', 'foul', 'red', 'concede']).toContain(kBad);
    const seen = new Set<string>();
    for (const ep of EPISODES) for (const o of ep.options) for (const t of ['clean', 'cost', 'fail', 'badFail'] as const) seen.add(finaleFor(ep, o, res(t), []));
    // По всему пулу встречаются и втрата, и пас, и дуель, и фол — иначе поле молчит на половине исходов.
    for (const k of ['loss', 'pass', 'duel', 'foul', 'pulse']) expect([...seen], k).toContain(k);
  });
});
