// Пролог — «тиждень нуль» (M12, 20.09): створення персонажа через вибір, як у DE, — три розвороти
// зошита, у кожному лист оповідача (травма, дзвінок тренера, перший день на базі) і стікери голосів:
// що кожен голос хоче відповісти за Реєса. Обраний стікер — це і є характер на старт: голос гучніший
// на перший матч, атрибутний пункт назавжди, довіра тренера, дублер у спину, Спокій нижчий.
// Спокою серед стікерів немає навмисно: за лором це голос, якого Реєс не чує, — страх втратити
// професію тисне, а не говорить. Жарт Тібо про мафію — не флаг і не гілка, а характер: відповідь
// зберігається в career.prologue.base, звідти її читатимуть репліки Тібо і сцени тижня.
// Наслідки йдуть через applyWeek — той самий шлях, що й дела тижня: бирки, nextMatch, флаги.
// Чистая логика; контент — content/prologue.json; экран — ui/PrologueScreen.tsx.

import { applyWeek, VOICE_ATTRS, type ActivityEffect } from './week';
import { ATTRIBUTE_LABEL, type Attribute, type VoiceKey } from './types';
import type { Career } from './career';

export type PrologueOption = {
  id: string;
  voice: VoiceKey;
  /** Що Реєс каже вголос — заголовок стікера. */
  say: string;
  /** Рядок голосу під реплікою, у тоні гри. */
  line: string;
  /** Рядок ручкою під розворотом після вибору. */
  mark: string;
  /** Атрибутний пункт назавжди — гравець обирає з VOICE_ATTRS голосу (як train: 'choice' у тижні,
   *  але без лічильника: пролог — це старт, а не тренування). */
  point?: 'choice';
  /** Партнер з пам’яттю (M11): привід довіряти ще до першого матчу. */
  bond?: number;
  effect: ActivityEffect;
};

export type PrologueSpread = {
  id: 'scout' | 'call' | 'base';
  title: string;
  /** Підпис заголовка, поки розворот відкритий; після вибору — голос обраного стікера. */
  sub: string;
  /** Ярлик на кромці листа оповідача. */
  tab: string;
  /** Абзаци листа оповідача. */
  sheet: string[];
  options: PrologueOption[];
};

export type ProloguePick = { spread: PrologueSpread['id']; option: string; attr?: Attribute };

/** Пролог — один раз на кар’єру, до першого матчу. Старі збереження з зіграними матчами його не бачать:
 *  їхній Реєс уже має характер. */
export function prologuePending(career: Career): boolean {
  return !career.prologue && career.matchesPlayed === 0;
}

/** Закрити пролог: наслідки стікерів — через applyWeek (бирки й nextMatch тим самим способом, що
 *  дела тижня), пункт і партнер — окремо, бо тиждень так не вміє. Лава — примусово: за лором перший
 *  матч починається з неї. Флаги з прологу підписані «ще до сезону», а не «минулого тижня». */
export function finishPrologue(career: Career, spreads: PrologueSpread[], picks: ProloguePick[]): { career: Career; tags: string[] } {
  const chosen = picks.map((p) => {
    const spread = spreads.find((s) => s.id === p.spread);
    const option = spread?.options.find((o) => o.id === p.option);
    return option ? { pick: p, option } : null;
  }).filter((x): x is { pick: ProloguePick; option: PrologueOption } => x !== null);

  const applied = applyWeek(career, chosen.map(({ option }) => ({
    activity: { id: option.id, voice: option.voice, title: option.say, line: option.line, effect: option.effect },
  })));
  const next: Career = { ...applied.career, attrPoints: { ...applied.career.attrPoints } };
  const tags = [...applied.tags];

  for (const { pick, option } of chosen) {
    if (option.point === 'choice') {
      const attr = pick.attr && VOICE_ATTRS[option.voice].includes(pick.attr) ? pick.attr : VOICE_ATTRS[option.voice][0];
      if (attr) {
        next.attrPoints[attr] = (next.attrPoints[attr] ?? 0) + 1;
        tags.push(`${ATTRIBUTE_LABEL[attr]} +1 назавжди`);
      }
    }
    if (option.bond) {
      next.partnerBond = (next.partnerBond ?? 0) + option.bond;
      tags.push(option.bond > 0 ? 'партнер: є привід довіряти' : 'партнер: є привід ображатися');
    }
  }

  const ids = new Set(chosen.map(({ option }) => option.id));
  next.carriedFlags = (next.carriedFlags ?? []).map((f) => (ids.has(f.mark.episodeId) ? { ...f, mark: { ...f.mark, whenText: 'ще до сезону' } } : f));
  next.benched = true;
  next.prologue = Object.fromEntries(chosen.map(({ pick, option }) => [pick.spread, option.id])) as Career['prologue'];
  return { career: next, tags: [...new Set(tags)] };
}
