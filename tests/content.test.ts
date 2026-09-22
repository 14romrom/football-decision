import { describe, it, expect } from 'vitest';
import { EPISODES, PLAYER } from '../src/content';
import { BALANCE, DIFFICULTY, cleanTarget } from '../src/engine/balance';
import type { Attribute, Episode, Tier } from '../src/engine/types';

const TIERS: Tier[] = ['badFail', 'fail', 'cost', 'clean'];
const ATTRS: Attribute[] = ['finishing', 'passing', 'dribbling', 'first_touch', 'pace', 'strength', 'stamina', 'composure', 'vision', 'positioning'];

/** Эпизод с конфликтом целей: есть явно командный вариант и явно карьерный. */
function hasGoalConflict(e: Episode): boolean {
  const teamFirst = e.options.some((o) => o.goals.team - o.goals.personal >= 2);
  const selfFirst = e.options.some((o) => o.goals.personal - o.goals.team >= 2);
  return teamFirst && selfFirst;
}

describe('форма контента', () => {
  it('в наборе не меньше 20 эпизодов с уникальными id', () => {
    // Пул должен быть заметно больше десяти слотов: иначе второй матч —
    // те же ситуации в другом порядке, и вопрос «хочется ли ещё» измеряет не то.
    expect(EPISODES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(EPISODES.map((e) => e.id)).size).toBe(EPISODES.length);
  });

  it('у каждого эпизода 3–4 безусловных опции (плюс не больше одной по флагу или голосу) и все четыре исхода в каждой', () => {
    for (const e of EPISODES) {
      // Условные варианты — «по підказці» (requires.flags) и «голос бачить» (insight) — сверх
      // базовых: игрок без сильного атрибута всё равно видит 3–4 кнопки.
      const base = e.options.filter((o) => !o.requires && !o.insight);
      expect(base.length, e.id).toBeGreaterThanOrEqual(3);
      expect(base.length, e.id).toBeLessThanOrEqual(4);
      expect(e.options.length - base.length, e.id).toBeLessThanOrEqual(1);
      expect(new Set(e.options.map((o) => o.id)).size, e.id).toBe(e.options.length);
      for (const o of e.options) {
        for (const t of TIERS) {
          const out = o.outcomes[t];
          expect(out, `${e.id}/${o.id}/${t}`).toBeTruthy();
          expect(out.text.length, `${e.id}/${o.id}/${t}`).toBeGreaterThan(20);
          expect(out.recap.length, `${e.id}/${o.id}/${t}`).toBeGreaterThan(5);
        }
      }
    }
  });

  // past — поступок, recap — последствие: на доске аналитика они идут подряд, и «пробив низом… — і пробив низом…»
  // читалось дважды (плейтест 21.09, Б-5). Ловим дословный повтор: первые четыре слова recap (после «і ») = начало past.
  // Совпадение одного глагола («пробив у дотик… — і пробив у дотик просто у воротаря») в контенте повсеместно (233 из ~1200)
  // и читается как продолжение фразы, поэтому порог — четыре слова.
  it('recap не повторяет past дословно', () => {
    const head = (s: string) => s.replace(/^і\s+/, '').replace(/[^\p{L}\p{N}ʼ’ ]/gu, '').toLowerCase().split(/\s+/).slice(0, 4).join(' ');
    for (const e of EPISODES) for (const o of e.options) {
      if (!o.past) continue;
      for (const t of TIERS) {
        const r = o.outcomes[t].recap;
        expect(head(r) === head(o.past) ? `${e.id}/${o.id}/${t}: «${o.past}» — «${r}»` : '').toBe('');
      }
    }
  });

  it('поля опций валидны: атрибут, форма риска, масштаб, стоимость 2..12', () => {
    for (const e of EPISODES) for (const o of e.options) {
      expect(ATTRS, `${e.id}/${o.id}`).toContain(o.attribute);
      expect(['controlled', 'risky', 'desperate']).toContain(o.basePosition);
      expect(['limited', 'standard', 'great']).toContain(o.effect);
      expect(o.staminaCost, `${e.id}/${o.id}`).toBeGreaterThanOrEqual(2);
      expect(o.staminaCost, `${e.id}/${o.id}`).toBeLessThanOrEqual(12);
      expect(o.past.length, `${e.id}/${o.id}`).toBeGreaterThan(3);
      for (const g of [o.goals.team, o.goals.personal]) {
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(3);
      }
    }
  });

  it('в каждом эпизоде формы риска различаются — выбор не сводится к одной шкале', () => {
    for (const e of EPISODES) {
      expect(new Set(e.options.map((o) => o.basePosition)).size, e.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('складність у каждой опции: в диапазоне, и цели в эпизоде не сводятся к шаблону формы', () => {
    // 18.09: форма = цена ошибки, складність = насколько трудно. Откатить назад — 11, удар с 40 метров — 23.
    for (const e of EPISODES) {
      const targets = new Set<number>();
      for (const o of e.options) {
        expect(o.difficulty, `${e.id}/${o.id}`).toBeDefined();
        expect(o.difficulty!, `${e.id}/${o.id}`).toBeGreaterThanOrEqual(DIFFICULTY.min);
        expect(o.difficulty!, `${e.id}/${o.id}`).toBeLessThanOrEqual(DIFFICULTY.max);
        if (!o.requires && !o.insight) targets.add(cleanTarget(o.basePosition, o.difficulty));
      }
      expect(targets.size, e.id).toBeGreaterThanOrEqual(2);
      // Самый трудный вариант эпизода не может быть «утримати»: за 20+ должен стоять масштаб.
      const hardest = [...e.options].sort((a, b) => cleanTarget(b.basePosition, b.difficulty) - cleanTarget(a.basePosition, a.difficulty))[0];
      if (cleanTarget(hardest.basePosition, hardest.difficulty) >= 20) expect(hardest.effect, `${e.id}/${hardest.id}`).not.toBe('limited');
    }
    const all = EPISODES.flatMap((e) => e.options);
    expect(all.filter((o) => o.difficulty! < 0).length / all.length).toBeGreaterThan(0.3);
    expect(all.filter((o) => o.difficulty! > 0).length / all.length).toBeGreaterThan(0.2);
  });
});

describe('конфликт целей (п. 6 ТЗ)', () => {
  it('минимум 40% эпизодов содержат командный и карьерный варианты одновременно', () => {
    const conflicted = EPISODES.filter(hasGoalConflict).map((e) => e.id);
    expect(conflicted.length, `эпизоды с конфликтом: ${conflicted.join(', ')}`).toBeGreaterThanOrEqual(Math.ceil(EPISODES.length * 0.4));
  });

  it('есть эпизод, где командный вариант при этом надёжнее карьерного', () => {
    // Ровно та ситуация из ТЗ: пас правильнее и безопаснее, а бить всё равно хочется.
    const found = EPISODES.some((e) => {
      const team = e.options.find((o) => o.goals.team - o.goals.personal >= 2 && o.basePosition === 'controlled');
      const self = e.options.find((o) => o.goals.personal - o.goals.team >= 2 && o.basePosition !== 'controlled');
      return Boolean(team && self);
    });
    expect(found).toBe(true);
  });
});

describe('связность и покрытие расписания', () => {
  it('на каждую минуту расписания есть подходящий эпизод', () => {
    for (const m of BALANCE.match.episodeMinutes) {
      const fits = EPISODES.filter((e) => {
        const r = e.requires;
        if (!r) return true;
        return (r.minMinute ?? 0) <= m && (r.maxMinute ?? 90) >= m;
      });
      expect(fits.length, `минута ${m}`).toBeGreaterThan(0);
    }
  });

  it('последний слот после 85-й минуты закрыт эпизодом концовки', () => {
    const late = EPISODES.filter((e) => (e.requires?.maxMinute ?? 90) >= 86);
    expect(late.length).toBeGreaterThan(0);
  });

  it('эпизодов хватает, чтобы не повториться за матч', () => {
    expect(EPISODES.length).toBeGreaterThanOrEqual(BALANCE.match.episodeMinutes.length);
  });
});

describe('вариации сетапа и флаги (сезон)', () => {
  const WHEN_KEYS = ['tier', 'score', 'minMinute', 'maxMinute', 'tired', 'booked', 'lowTrust', 'momentumMin', 'momentumMax', 'venue', 'weather', 'strength', 'instruction', 'flags'];

  // Пустое `when` разрешено (22.09, M17): безусловные варианты — запасные вступления для самых частых сцен, чтобы второе
  // и третье появление эпизода за карьеру читалось иначе (match.ts:withSetup берёт невиданный из подходящих).
  it('setups: условие из известных ключей, текст отличается от базового и от соседей', () => {
    for (const e of EPISODES) {
      for (const v of e.setups ?? []) {
        const keys = Object.keys(v.when);
        for (const k of keys) expect(WHEN_KEYS, `${e.id}: when.${k}`).toContain(k);
        expect(v.text.length, e.id).toBeGreaterThan(20);
        expect(v.text, e.id).not.toBe(e.setup);
        expect(v.text, e.id).not.toMatch(/%|шанс|вероятн|ймовірн|імовірн|відсот/i);
      }
      const texts = (e.setups ?? []).map((v) => v.text);
      expect(new Set(texts).size, e.id).toBe(texts.length);
    }
  });

  it('вариаций сетапа хватает, чтобы сезон читался по-разному: не меньше половины плановых эпизодов', () => {
    const planned = EPISODES.filter((e) => !e.requires?.flags);
    const varied = planned.filter((e) => (e.setups?.length ?? 0) > 0);
    expect(varied.length).toBeGreaterThanOrEqual(Math.ceil(planned.length / 2));
  });

  it('requires.score — только leading/trailing/level, и такие эпизоды не занимают ранние слоты', () => {
    for (const e of EPISODES) {
      if (!e.requires?.score) continue;
      expect(['leading', 'trailing', 'level'], e.id).toContain(e.requires.score);
      // до второго тайма счёт почти всегда 0:0 — эпизод только по счёту зависал бы в плане
      expect(e.requires.minMinute ?? 0, e.id).toBeGreaterThanOrEqual(45);
    }
  });

  it('каждый флаг из контента известен: есть правило в flags.json или это системный флаг', async () => {
    const { FLAG_RULES } = await import('../src/content');
    // keeper_read ставит и движок (бачення/аналітик), и контент (первый удар) — системный.
    // partner_bonded / partner_cold — пороги career.partnerBond (career.ts:peopleFlags), ставит карьера, не исход.
    const SYSTEM = ['booked', 'injured', 'sent_off', 'tired', 'keeper_read', 'knock', 'partner_bonded', 'partner_cold', 'tibo_asked', 'on_bench',
      'call_tone_ego', 'call_tone_team', 'call_tone_vision', 'agent_left', 'agent_stayed', 'agent_waited',
      // M14/M15: ставить App при створенні матчу — суперник із минулого сезону, колишній дублер у їхній формі.
      'met_last_year', 'sub_there',
      // M17: ставить App — другий матч із клубом Ларссона, агент на трибуні навесні S2.
      'sub_there_again', 'agent_in_stands',
      // M15: ставить відпустка (engine/vacation.ts) — літо без передсезонки.
      'out_of_form',
      // M18: тебе замінили по ходу матчу (match.ts:subOffNow) — ісходи ep_subbed_off ставлять цей флаг.
      'subbed_off',
      // M18.3: мандраж перших турів — ставить App, знімається голом/асистом у сезоні.
      'nerves'];
    // them_<trait> ставит движок по характеристикам соперника из roster.json (match.ts).
    const known = new Set([...FLAG_RULES.map((r) => r.id), ...SYSTEM]);
    const used = new Set<string>();
    for (const e of EPISODES) {
      for (const f of e.requires?.flags ?? []) used.add(f);
      for (const f of e.requires?.notFlags ?? []) used.add(f);
      for (const v of e.setups ?? []) for (const f of v.when.flags ?? []) used.add(f);
      for (const o of e.options) for (const out of Object.values(o.outcomes)) {
        for (const f of out?.apply?.addFlags ?? []) used.add(f);
        for (const f of out?.apply?.removeFlags ?? []) used.add(f);
      }
    }
    for (const f of used) expect(known.has(f), `флаг ${f}`).toBe(true);
    // и наоборот: правило без эпизода (или дела недели), которые ставят флаг, — мёртвое
    const { ACTIVITIES, WEEK_SCENES } = await import('../src/content');
    const set = new Set([
      ...EPISODES.flatMap((e) => e.options.flatMap((o) => Object.values(o.outcomes).flatMap((out) => out?.apply?.addFlags ?? []))),
      ...ACTIVITIES.flatMap((a) => [...(a.effect.flags ?? []), ...(a.outcomes ?? []).flatMap((o) => o.effect.flags ?? [])].map((f) => f.flag)),
      // Сцени тижня теж ставлять флаги (M11: скаут на трибуні, ультрас за тебе).
      ...WEEK_SCENES.flatMap((s) => s.options.flatMap((o) => (o.effect.flags ?? []).map((f) => f.flag))),
    ]);
    for (const r of FLAG_RULES) {
      if (r.id.startsWith('them_') || r.id.startsWith('keeper_') || SYSTEM.includes(r.id)) continue;
      expect(set.has(r.id), `правило ${r.id} никто не ставит`).toBe(true);
    }
  });

  it('у каждого реактивного эпизода есть флаг-триггер, который кто-то ставит, и каждый вариант умеет его снять', async () => {
    // Снимать на каждом исходе не обязательно: провал может оставить обиду партнёра
    // висеть дальше — это продолжение цепочки, а не утечка. Но вариант без единого
    // снимающего исхода означал бы, что цепочку закрыть нельзя. Жёлтая — системный флаг,
    // её реактивный эпизод не снимает по определению. Ставить флаг может и дело недели
    // (побачення → viral_story → провокация в матче, 18.09).
    const { ACTIVITIES } = await import('../src/content');
    const setters = new Set([
      ...EPISODES.flatMap((e) => e.options.flatMap((o) => Object.values(o.outcomes).flatMap((out) => out?.apply?.addFlags ?? []))),
      ...ACTIVITIES.flatMap((a) => [...(a.effect.flags ?? []), ...(a.outcomes ?? []).flatMap((o) => o.effect.flags ?? [])].map((f) => f.flag)),
    ]);
    for (const e of EPISODES.filter((x) => x.requires?.flags?.length)) {
      const flag = e.requires!.flags![0];
      if (flag === 'on_bench') continue;   // ставить і знімає движок (match.ts: лава)
      if (flag === 'sub_there') continue;   // ставить App при створенні матчу: колишній дублер у їхній формі (M15)
      if (flag === 'sub_there_again' || flag === 'agent_in_stands') continue;   // теж App (M17): вдруге проти Ларссона, агент на трибуні
      expect(setters.has(flag), `${e.id}: ${flag}`).toBe(true);
      if (flag === 'booked') continue;
      for (const o of e.options) {
        const clears = TIERS.some((t) => (o.outcomes[t].apply?.removeFlags ?? []).includes(flag));
        expect(clears, `${e.id}/${o.id}`).toBe(true);
      }
    }
  });
});

describe('стартовый футболист', () => {
  it('каждый атрибут используется хотя бы одной опцией — иначе он мёртвый на карточке', () => {
    const used = new Set(EPISODES.flatMap((e) => e.options.map((o) => o.attribute)));
    for (const a of ATTRS) if (a !== 'stamina') expect(used.has(a), a).toBe(true);   // витривалість работает через расход сил
  });

  it('атрибуты в стартовом коридоре 45..65', () => {
    for (const [k, v] of Object.entries(PLAYER.attrs)) {
      expect(v, k).toBeGreaterThanOrEqual(45);
      expect(v, k).toBeLessThanOrEqual(65);
    }
  });
});

describe('плейсхолдеры имён', () => {
  it('в сыром контенте нет фамилий из ростера — только плейсхолдеры', async () => {
    const { EPISODES_RAW, ROSTER } = await import('../src/content');
    // Только свои: у соперника не фамилии, а описания («їхній центральний»), они — обычные слова.
    const surnames = Object.values(ROSTER.us.players).flatMap((p) => [p.nom, p.gen, p.dat, p.ins]);
    const raw = JSON.stringify(EPISODES_RAW);
    for (const s of surnames) expect(raw, s).not.toContain(s);
  });

  it('каждый плейсхолдер разрешается в имя', () => {
    // fillNamesDeep бросает на неизвестном ключе при импорте контента;
    // здесь проверяем, что после подстановки фигурных скобок не осталось.
    // {trigger.*} — плейсхолдер решения, его заполняет реактивный эпизод в момент показа
    for (const e of EPISODES) expect(JSON.stringify(e), e.id).not.toMatch(/\{(?!trigger\.)[a-z0-9.]+\}/);
  });
});

describe('автор гола в хронологии совпадает со сценарием', () => {
  // Баг из плейтеста: текст исхода называл конкретного партнёра, а лента матча
  // объявляла гол случайным именем из roster.scorers — разные «авторы» одного гола.
  // apply.scorer фиксирует, кого назвал текст; pushGoal (match.ts) обязан использовать
  // именно его. Здесь проверяем контент: ключ проставлен и совпадает с текстом.
  const US_KEYS = ['partner', 'striker', 'cb', 'dm', 'keeper', 'winger', 'lb', 'rb', 'cb2', 'sub'];
  const THEM_KEYS = ['striker', 'winger', 'mid'];

  it('assist и teamGoal — apply.scorer обязателен и назван в тексте', async () => {
    const { EPISODES_RAW } = await import('../src/content');
    for (const e of EPISODES_RAW) {
      for (const o of e.options) {
        for (const [tier, out] of Object.entries(o.outcomes)) {
          if (!out?.apply || (!out.apply.assist && !out.apply.teamGoal)) continue;
          const label = `${e.id}/${o.id}/${tier}`;
          const key = out.apply.scorer;
          expect(key, label).toBeTruthy();
          expect(US_KEYS, label).toContain(key);
          const text = out.text + ' ' + out.recap;
          expect(text, label).toMatch(new RegExp(`\\{${key}(\\.\\w+)?\\}`));
        }
      }
    }
  });

  it('concede с apply.scorer — ключ из ростера соперника и назван в тексте', async () => {
    const { EPISODES_RAW } = await import('../src/content');
    for (const e of EPISODES_RAW) {
      for (const o of e.options) {
        for (const [tier, out] of Object.entries(o.outcomes)) {
          if (!out?.apply?.concede || !out.apply.scorer) continue;
          const label = `${e.id}/${o.id}/${tier}`;
          const key = out.apply.scorer;
          expect(THEM_KEYS, label).toContain(key);
          const text = out.text + ' ' + out.recap;
          expect(text, label).toMatch(new RegExp(`\\{them\\.${key}(\\.\\w+)?\\}`));
        }
      }
    }
  });
});

describe('аудит опций (M9, 20.09): мёртвых кнопок не прибавляется', () => {
  it('доля доминируемых опций и число эпизодов с «правильным ответом» не выше порогов tools/audit-options.ts', async () => {
    const { audit, AUDIT_LIMITS } = await import('../tools/audit-options');
    const r = audit();
    expect(r.dominated.length / r.options, 'доминируемых опций').toBeLessThanOrEqual(AUDIT_LIMITS.dominatedShare);
    expect(r.singleAnswer.length, 'эпизодов с правильным ответом').toBeLessThanOrEqual(AUDIT_LIMITS.singleAnswer);
    // Гол на clean у «упевнено» — только fin_* и позиція (ниша, решение 20.09).
    expect(r.safeGoals.map((x) => `${x.ep.id}/${x.o.id}`)).toEqual([]);
  });
});
