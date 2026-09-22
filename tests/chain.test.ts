// Заход B: цепочки решений (followUp), условные опции, скрытое чтение воротаря, память по семьям.
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/engine/rng';
import { applyChoice, availableOptions, createMatch, nextEpisode } from '../src/engine/match';
import { resolveOption } from '../src/engine/resolve';
import { computeContext } from '../src/engine/context';
import { neutralConditions } from '../src/engine/conditions';
import { applyMatchToCareer, defaultCareer } from '../src/engine/career';
import { BALANCE } from '../src/engine/balance';
import { runSeason } from '../tools/simulate';
import { EPISODES, EPISODES_RAW, FLAG_RULES, OPPONENTS, PLAYER, ROSTER, rosterFor, OPPONENT_KEYS } from '../src/content';
import type { MatchState } from '../src/engine/types';

const high = (n: number) => ({ ...makeRng(1), roll: () => n });
const byId = (id: string) => EPISODES_RAW.find((e) => e.id === id)!;

/** Сессия, у которой следующий слот — заданный эпизод. */
function sessionAt(seed: number, episodeId: string, opponent = 'castelrio', flags: string[] = []) {
  const rng = makeRng(seed);
  const s = createMatch(`c-${seed}`, seed, PLAYER, rng, EPISODES_RAW, rosterFor(opponent), neutralConditions(opponent), [], FLAG_RULES);
  s.plan[1] = episodeId;
  s.nextIndex = 1;
  s.state.minute = s.schedule[0];
  s.state.flags.push(...flags);
  return { s, rng };
}

describe('цепочки: исход ведёт в следующее решение в том же слоте', () => {
  it('обіграв на фланзі → удар: fin_shot приходит без ленты и той же минутой', () => {
    const { s, rng } = sessionAt(3, 'ep_wing_one_on_one');
    const first = nextEpisode(s, rng)!;
    const cut = first.episode.options.find((o) => o.id === 'cut_inside')!;
    applyChoice(s, first.episode, cut, resolveOption(s.state, s.player, cut, first.episode.phase, high(19)), rng);
    expect(s.pendingFollowUp).toBe('fin_shot');
    const link = nextEpisode(s, rng)!;
    expect(link.episode.id).toBe('fin_shot');
    expect(link.minute).toBe(first.minute);
    expect(link.events).toHaveLength(0);
    expect(link.episode.setup).toContain(cut.past);          // {trigger.past} предыдущего звена
    expect(link.episode.setup).not.toMatch(/\{trigger/);
    const shot = link.episode.options.find((o) => o.id === 'curl_far')!;
    applyChoice(s, link.episode, shot, resolveOption(s.state, s.player, shot, link.episode.phase, high(19)), rng);
    expect(s.state.stats.goals).toBe(1);
    expect(s.nextIndex).toBe(2);                              // слот закрыт только после звена
    expect(s.chainsUsed).toBe(1);
    expect(s.state.flags).toContain('keeper_read');           // первый удар прочитал воротаря
  });

  it('заробив пенальті → сам б’єш; если цепочка не может сработать — б’є {striker} (followUpElse)', () => {
    // Сид 6: на сиде 5 после расширения пула (18.09) в ленте до первого эпизода случалась мікротравма,
    // и слот занимал rx_knock — тест проверяет цепочку пенальти, а не ленту.
    const { s, rng } = sessionAt(6, 'ep_penalty_shout');
    const ep = nextEpisode(s, rng)!;
    const dive = ep.episode.options.find((o) => o.id === 'go_down')!;
    applyChoice(s, ep.episode, dive, resolveOption(s.state, s.player, dive, ep.episode.phase, high(20)), rng);
    expect(s.pendingFollowUp).toBe('fin_penalty');
    expect(s.state.scoreUs).toBe(0);                           // гола ещё нет — бить будешь ты

    const { s: s2, rng: rng2 } = sessionAt(6, 'ep_penalty_shout');
    s2.chainsUsed = BALANCE.match.chain.maxChainsPerMatch;      // лимит цепочек выбран
    const ep2 = nextEpisode(s2, rng2)!;
    const dive2 = ep2.episode.options.find((o) => o.id === 'go_down')!;
    applyChoice(s2, ep2.episode, dive2, resolveOption(s2.state, s2.player, dive2, ep2.episode.phase, high(20)), rng2);
    expect(s2.pendingFollowUp).toBeNull();
    expect(s2.state.scoreUs).toBe(1);                          // командный гол из followUpElse
    expect(s2.state.log.some((e) => e.kind === 'goalUs')).toBe(true);
  });

  it('звенья не планируются, не всплывают и не повторяются; в слоте не больше двух звеньев', () => {
    const links = EPISODES_RAW.filter((e) => e.followUpOnly);
    expect(links.map((e) => e.id).sort()).toEqual(['fin_penalty', 'fin_penalty_wait', 'fin_shot']);
    for (let seed = 500; seed < 560; seed++) {
      const rng = makeRng(seed);
      const s = createMatch('p', seed, PLAYER, rng, EPISODES_RAW, ROSTER, undefined, [], FLAG_RULES);
      expect(s.plan.some((id) => byId(id).followUpOnly)).toBe(false);
      const perSlot = new Map<number, number>();
      for (;;) {
        const next = nextEpisode(s, rng);
        if (!next) break;
        perSlot.set(next.minute, (perSlot.get(next.minute) ?? 0) + 1);
        const options = availableOptions(next.episode, s.state, s.player);
        const opt = options[rng.int(0, options.length - 1)];
        applyChoice(s, next.episode, opt, resolveOption(s.state, s.player, opt, next.episode.phase, rng), rng);
      }
      for (const n of perSlot.values()) expect(n).toBeLessThanOrEqual(1 + BALANCE.match.chain.maxLinksPerSlot);
      expect(new Set(s.usedEpisodeIds).size).toBe(s.usedEpisodeIds.length);
    }
  });

  it('цепочка в плановый эпизод (фол → штрафний) не даёт ему сыграться второй раз из плана', () => {
    const { s, rng } = sessionAt(9, 'ep_drag_defender');
    const fkSlot = s.plan.indexOf('ep_free_kick_close');
    s.plan[s.plan.length - 1] = 'ep_free_kick_close';       // штрафний стоит в плане позже
    if (fkSlot >= 0 && fkSlot !== s.plan.length - 1) s.plan[fkSlot] = s.plan[2];
    const ep = nextEpisode(s, rng)!;
    const take = ep.episode.options.find((o) => o.id === 'take_him_on')!;
    // cost-исход: «штрафний за двадцять метрів» → followUp ep_free_kick_close
    const res = { ...resolveOption(s.state, s.player, take, ep.episode.phase, rng), tier: 'cost' as const, critical: null };
    applyChoice(s, ep.episode, take, res, rng);
    expect(s.pendingFollowUp).toBe('ep_free_kick_close');
    for (;;) {
      const next = nextEpisode(s, rng);
      if (!next) break;
      const opt = availableOptions(next.episode, s.state, s.player)[0];
      applyChoice(s, next.episode, opt, resolveOption(s.state, s.player, opt, next.episode.phase, rng), rng);
    }
    expect(s.usedEpisodeIds.filter((id) => id === 'ep_free_kick_close')).toHaveLength(1);
  });

  it('у каждого followUp есть цель в пуле и followUpElse, если цель — плановый эпизод или лимит может сработать', () => {
    const ids = new Set(EPISODES_RAW.map((e) => e.id));
    let hooks = 0;
    for (const e of EPISODES_RAW) for (const o of e.options) for (const out of Object.values(o.outcomes)) {
      const a = out?.apply;
      if (!a?.followUp) continue;
      hooks += 1;
      expect(ids.has(a.followUp), `${e.id}/${o.id}: ${a.followUp}`).toBe(true);
      expect(a.followUpElse, `${e.id}/${o.id}: нужен followUpElse — цепочка может не сработать`).toBeTruthy();
    }
    expect(hooks).toBeGreaterThanOrEqual(15);
  });
});

describe('условные варианты и правила по опциям', () => {
  it('паненка видна только тому, кто прочитал воротаря, который падает рано', () => {
    const fin = byId('fin_penalty');
    const st = (flags: string[]) => ({ flags } as unknown as MatchState);
    expect(availableOptions(fin, st([])).map((o) => o.id)).not.toContain('panenka');
    expect(availableOptions(fin, st(['keeper_read'])).map((o) => o.id)).not.toContain('panenka');
    expect(availableOptions(fin, st(['keeper_read', 'keeper_divesEarly'])).map((o) => o.id)).toContain('panenka');
    // безусловных вариантов у любого эпизода 3–4 (условные — по флагу или «голос бачить»)
    for (const e of EPISODES) {
      const plain = e.options.filter((o) => !o.requires && !o.insight).length;
      expect(plain, e.id).toBeGreaterThanOrEqual(3);
      expect(plain, e.id).toBeLessThanOrEqual(4);
    }
  });

  it('свойство воротаря бьёт по манере удара, а не по атрибуту', () => {
    const fin = byId('fin_shot');
    const curl = fin.options.find((o) => o.id === 'curl_far')!;
    const nutmeg = fin.options.find((o) => o.id === 'nutmeg_low')!;
    const base = { minute: 30, scoreUs: 0, scoreThem: 0, stamina: 55, composureNow: 60, coachTrust: 55, fanHype: 45, momentum: 0,
      stats: { goals: 0, assists: 0, keyPasses: 0, losses: 0, duelsWon: 0, fouls: 0 }, marks: {},
      voices: { counts: { ego: 0, team: 0, composure: 0, vision: 0, instinct: 0, body: 0 }, streak: { who: null, count: 0 } }, log: [] };
    const nearPost = { ...base, flags: ['keeper_nearPost'] } as MatchState;
    const label = (o: typeof curl, st: MatchState) => computeContext(st, PLAYER, o, fin.phase, neutralConditions(), FLAG_RULES).mods.map((m) => m.label);
    expect(label(curl, nearPost)).toContain('воротар тримається ближньої стійки');
    expect(label(nutmeg, nearPost)).not.toContain('воротар тримається ближньої стійки');
    const staysBig = { ...base, flags: ['keeper_staysBig'] } as MatchState;
    expect(computeContext(staysBig, PLAYER, nutmeg, fin.phase, neutralConditions(), FLAG_RULES).mods.find((m) => m.label.startsWith('воротар стоїть'))?.value).toBe(-2);
  });
});

describe('скрытое чтение воротаря', () => {
  it('у каждого клуба воротар со звичкою, флаг keeper_<trait> стоит с первой минуты, а keeper_read — нет', () => {
    for (const k of OPPONENT_KEYS.second) {
      expect(OPPONENTS[k].keeper?.trait, k).toBeTruthy();
      const s = createMatch('k', 1, PLAYER, makeRng(1), EPISODES_RAW, rosterFor(k), neutralConditions(k), [], FLAG_RULES);
      expect(s.state.flags).toContain('keeper_' + OPPONENTS[k].keeper!.trait);
      expect(s.state.flags).not.toContain('keeper_read');     // стартовое бачення +4 — ниже порога чтения (+5)
    }
  });

  it('сильне бачення поля або аналітик читають воротаря до першого удару', () => {
    const seer = { ...PLAYER, attrs: { ...PLAYER.attrs, vision: 45 + BALANCE.keeperRead.visionMod * 4 } };
    const s = createMatch('v', 1, seer, makeRng(1), EPISODES_RAW, ROSTER, neutralConditions(), [], FLAG_RULES);
    expect(s.state.flags).toContain('keeper_read');
    expect(s.state.marks.keeper_read.past).toContain('розминці');
    const tipped = createMatch('a', 1, PLAYER, makeRng(1), EPISODES_RAW, ROSTER, { ...neutralConditions(), keeperTip: true }, [], FLAG_RULES);
    expect(tipped.state.flags).toContain('keeper_read');
    expect(tipped.state.marks.keeper_read.past).toContain('аналітика');
  });

  it('прочитанный воротар переносится только на матч с тем же клубом', () => {
    const st = { ...createMatch('x', 1, PLAYER, makeRng(1), EPISODES_RAW, rosterFor('olvar'), neutralConditions('olvar')).state };
    st.flags.push('keeper_read');
    st.marks.keeper_read = { minute: 40, episodeId: 'fin_shot', optionId: 'curl_far', past: 'закрутив у дальній' };
    const career = applyMatchToCareer(defaultCareer(), st, { scoreUs: 0, scoreThem: 0, stats: st.stats, staminaLeft: 0, coachRating: 6, fanRating: 6, recap: [], points: 1, goals: [] }, false, 'olvar');
    const carried = career.carriedFlags!.find((f) => f.flag === 'keeper_read')!;
    expect(carried.opponentKey).toBe('olvar');
    const same = createMatch('s', 2, PLAYER, makeRng(2), EPISODES_RAW, rosterFor('olvar'), neutralConditions('olvar'), [], FLAG_RULES, { flags: [carried] });
    expect(same.state.flags).toContain('keeper_read');
    const other = createMatch('o', 2, PLAYER, makeRng(2), EPISODES_RAW, rosterFor('sandorea'), neutralConditions('sandorea'), [], FLAG_RULES, { flags: [carried] });
    expect(other.state.flags).not.toContain('keeper_read');
  });

  it('сетап удара говорит, что ты знаешь о воротаре, только когда прочитал', () => {
    // Вариант сетапа выбирается среди подходящих по свежести (M17.1), а не строго «самый конкретный»,
    // поэтому «прочитал» проверяем по серии сидов: без флага строка не появляется никогда, с флагом — появляется.
    const linkSetup = (seed: number, flags: string[]) => {
      const { s, rng } = sessionAt(seed, 'ep_wing_one_on_one', 'castelrio', flags);   // castelrio: падає рано
      const first = nextEpisode(s, rng)!;
      const cut = first.episode.options.find((o) => o.id === 'cut_inside')!;
      applyChoice(s, first.episode, cut, resolveOption(s.state, s.player, cut, first.episode.phase, high(19)), rng);
      return nextEpisode(s, rng)!.episode.setup;
    };
    const seeds = Array.from({ length: 12 }, (_, i) => 3 + i);
    expect(seeds.filter((i) => linkSetup(i, ['keeper_read']).includes('падає рано')).length).toBeGreaterThan(0);
    expect(seeds.some((i) => linkSetup(i, []).includes('падає рано'))).toBe(false);
  });
});

describe('семьи ситуаций', () => {
  it('у каждого эпизода есть семья, и память давит семью слабее, чем id', () => {
    for (const e of EPISODES_RAW) expect(e.family, e.id).toBeTruthy();
    const penalties = EPISODES_RAW.filter((e) => e.family === 'penalty' && !e.followUpOnly && !e.requires?.flags).map((e) => e.id);
    expect(penalties.length).toBeGreaterThanOrEqual(2);
    // Память «пенальті был в прошлом матче» снижает частоту любого пенальті, но не запрещает.
    const count = (memory: Record<string, number>) => {
      let n = 0;
      for (let seed = 800; seed < 1000; seed++) {
        const s = createMatch('f', seed, PLAYER, makeRng(seed), EPISODES_RAW, ROSTER, undefined, memory);
        n += s.plan.filter((id) => penalties.includes(id)).length;
      }
      return n;
    };
    const fresh = count({});
    const seen = count({ [penalties[0]]: 1 });
    expect(seen).toBeLessThan(fresh);
    expect(seen).toBeGreaterThan(0);
  });

  it('runSeason не считает звенья цепочек повторами', () => {
    const r = runSeason(123, 3);
    expect(r.repeats[0]).toBe(0);
  });
});

describe('плейсхолдеры с цифрой и строки ленты', () => {
  it('ни одна строка матча не содержит сырого плейсхолдера ({cb2.gen} из плейтеста 17.09)', () => {
    for (let seed = 1; seed < 40; seed++) {
      const rng = makeRng(seed);
      const s = createMatch('l', seed, PLAYER, rng, EPISODES_RAW, rosterFor(OPPONENT_KEYS.second[seed % 6]), undefined, [], FLAG_RULES);
      for (;;) {
        const next = nextEpisode(s, rng);
        if (!next) break;
        const opt = availableOptions(next.episode, s.state, s.player)[0];
        applyChoice(s, next.episode, opt, resolveOption(s.state, s.player, opt, next.episode.phase, rng), rng);
      }
      for (const e of s.state.log) expect(e.text, `seed ${seed}: ${e.text}`).not.toMatch(/[{}]/);
    }
  });
});
