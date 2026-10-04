import { ATTRIBUTE_LABEL, type Attribute, type Player, type VoiceKey } from '../engine/types';
import { attrMod } from '../engine/context';
import { signatureAttrs } from '../engine/conditions';
import { effectivePlayer, type Career } from '../engine/career';
import { VOICE_LABEL, voiceSees } from '../engine/voices';
import { BALANCE } from '../engine/balance';
import type { Season } from '../engine/season';
import { dominantCareerVoice } from '../engine/week';
import { Sticker, voiceMod } from './Sticker';
import { modScale, VoiceHex } from './VoiceHex';
import { VOICES } from './voices-text';
import { t, tf } from '../content/i18n';

// Лист персонажа (28.09, макет «Картка: було / стало»): стикер → шестикутник голосів → характеристики,
// згруповані за голосами, → підвал із розшифровкою станів. До этого карточка была четырьмя экранами
// прокрутки: стикер, шесть абзацев про голоса, две таблицы статистики и десять атрибутов в группах
// «Техніка / Фізика / Голова». Голоса и атрибуты жили в разных списках, и связь между ними игрок
// достраивал сам; сезон и кар'єра — цифры, которые знает город, а не Реєс.
//
// Что изменилось по решениям:
// — группы теперь голоса, а не части тела: у каждого голоса есть атрибут, у каждого атрибута — голос;
// — описание голоса свёрнуто (его читают один раз), характеристики видны всегда;
// — голоса идут по громкости: сверху тот, кто в этом матче решает;
// — полоса показывает рост: серым то, с чем приехал, цветом — что наросло от дебюта;
// — сезон, кар'єра, форма и пресса уехали на профиль ESPM (ui/EspmProfile.tsx).

type VoiceState = 'sees' | 'heard' | 'silent';
const STATE_LABEL: Record<VoiceState, string> = { sees: t('бачить'), heard: t('чутно'), silent: t('мовчить') };
const STATE_RANK: Record<VoiceState, number> = { sees: 2, heard: 1, silent: 0 };

function attrVoiceState(who: VoiceKey, attrs: Attribute[], player: Player): VoiceState {
  if (voiceSees(who, player)) return 'sees';
  return attrs.some((a) => attrMod(player.attrs[a]) >= BALANCE.voiceMinMod) ? 'heard' : 'silent';
}

/** Его и Команда спорят: кто перекрикує — по тому, кого слушали за карьеру. */
function wantsState(who: 'ego' | 'team', counts?: Record<VoiceKey, number>): { state: VoiceState; note: string } {
  const ego = counts?.ego ?? 0;
  const team = counts?.team ?? 0;
  if (ego + team === 0) return { state: 'heard', note: t('ще не сперечалися') };
  const mine = who === 'ego' ? ego : team;
  const other = who === 'ego' ? team : ego;
  if (mine >= other * 1.5 && mine > 0) return { state: 'sees', note: who === 'ego' ? t('перекрикує Команду') : t('перекрикує Его') };
  if (other >= mine * 1.5) return { state: 'silent', note: who === 'ego' ? t('поступається Команді') : t('поступається Его') };
  return { state: 'heard', note: who === 'ego' ? t('сперечається з Командою') : t('сперечається з Его') };
}

type Props = {
  player: Player;
  career?: Career;
  season?: Season | null;
  /** Название клуба в именительном — в шапку удостоверения. */
  club?: string;
  /** Профіль на ESPM; без него кнопки нет — на дошці після матчу роут перемонтував би екран. */
  onEspm?: () => void;
  onBack?: () => void;
};

export function PlayerCard({ player, career, season, club, onEspm, onBack }: Props) {
  // Голоси на карточке — с учётом того, что неделя приготовила к следующему матчу (тимчасово).
  const weekBonus = career?.nextMatch?.attrBonus;
  const effective = career ? effectivePlayer(player, career, weekBonus) : player;
  const permanent = career ? effectivePlayer(player, career) : player;
  const signature = signatureAttrs(effective);
  const weakest = [...(Object.keys(effective.attrs) as Attribute[])]
    .sort((a, b) => effective.attrs[a] - effective.attrs[b]).slice(0, 2);
  // Голос картки — тот же критерий, что у меню кар’єри, недели и дельты после матча (week.ts).
  const dominant = career ? dominantCareerVoice(career) : null;

  const heard = VOICES.reduce((sum, v) => sum + (career?.voiceCounts?.[v.who] ?? 0), 0);
  // Одна шкала на фигуру и на полосы: у самого сильного голоса полоса до края, у молчащего — пустая.
  const scale = modScale(Math.max(...VOICES.map((v) => voiceMod(v.who, effective))));
  // Порядок — по гучності: згори той голос, який зараз вирішує. Ряди всередині голосу — так само.
  const groups = VOICES.map((v) => {
    const wants = v.who === 'ego' || v.who === 'team' ? wantsState(v.who, career?.voiceCounts) : null;
    const state = wants ? wants.state : attrVoiceState(v.who, v.attrs, effective);
    return {
      ...v,
      state,
      mod: voiceMod(v.who, effective),
      note: wants ? wants.note : STATE_LABEL[state],
      listened: career?.voiceCounts?.[v.who] ?? 0,
      attrs: [...v.attrs].sort((a, b) => effective.attrs[b] - effective.attrs[a]),
    };
  // При равной громкости выше тот, кто «бачить»: он открывает варианты, а спор Его с Командою — фон.
  }).sort((a, b) => b.mod - a.mod || STATE_RANK[b.state] - STATE_RANK[a.state]);

  return (
    <div className="player-card">
      <Sticker brief player={effective} career={career} season={season} club={club} dominant={dominant} />

      <VoiceHex player={effective} />
      <p className="hex-note">{t('Шість голосів в одних одиницях. Пунктир — кільце')} <i>{t('«бачить»')}</i>.</p>
      {/* Одне число в рядку (рішення користувача 28.09): два плюси поруч плуталися навіть у різних
          формах. Ріст лишився тим, чим він і є, — зеленим куском полоси; риски через два моди дають міру. */}
      <p className="rows-note">{t('Число в рамці —')} <b className="m">{t('що атрибут додає до кидка')}</b>{t('. Зелене на полосі —')} <b className="d">{t('що наросло від дебюту')}</b>.</p>

      {groups.map((g, i) => (
        <section key={g.who} className={`vg voice-${g.who}`}>
          {/* Описание голоса читают один раз — свёрнуто; раскрыт самый громкий. Характеристики видно всегда. */}
          <details className="vg-d" open={i === 0}>
            <summary>
              <span className="vg-name">{VOICE_LABEL[g.who]}</span>
              <span className={`voice-state state-${g.state}`}>{g.note}</span>
              <span className="vg-spacer" />
              <span className="vg-more">{t('про голос')}</span>
            </summary>
            <p className="vg-about">
              {g.about}
              {g.listened > 0 && <span className="muted">{tf(' Слухав {0} з {1}.', g.listened, heard)}</span>}
            </p>
          </details>
          <div className="vg-rows">
            {g.attrs.map((a) => {
              // Всё в модификаторах: очко роста = ровно +1 к моду (POINT_VALUE = ATTR_MOD.step), а сырое
              // значение 45..99 не участвует ни в одном решении игрока — оно ушло с карточки 28.09.
              const grown = career?.attrPoints[a] ?? 0;
              const steady = attrMod(permanent.attrs[a]);
              const mod = attrMod(effective.attrs[a]);
              const debut = Math.max(0, steady - grown);
              const trained = career?.training?.[a] ?? 0;
              return (
                <div key={a} className={`arow ${signature.includes(a) ? 'hi' : weakest.includes(a) ? 'dim' : ''}`}>
                  <span className="arow-name">
                    {ATTRIBUTE_LABEL[a]}
                    {/* Тренировки недели копятся к очку: точки — сколько из BALANCE.week.trainToPoint уже есть. */}
                    {trained > 0 && (
                      <i className="arow-train" title={t('тренувань до +1')}>
                        {Array.from({ length: BALANCE.week.trainToPoint }, (_, k) => <b key={k} className={k < trained ? 'on' : ''} />)}
                      </i>
                    )}
                  </span>
                  {/* Полоса в шкале шестикутника, риски через два мода: ряды и фигура меряют одним. */}
                  <span
                    className="arow-bar" style={{ backgroundSize: `${(2 / scale) * 100}% 100%` }}
                    title={grown > 0 ? tf('від дебюту +{0}', grown) : undefined}
                  >
                    <span className="arow-base" style={{ width: `${(debut / scale) * 100}%` }} />
                    {grown > 0 && <span className="arow-grown" style={{ left: `${(debut / scale) * 100}%`, width: `${(grown / scale) * 100}%` }} />}
                  </span>
                  <span className="arow-m">
                    +{mod}
                    {mod !== steady && <b className="arow-week" title={t('цього тижня')}>{mod > steady ? '↑' : '↓'}</b>}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="card-summary">
        <b>{t('Коронне:')}</b> {tf('{0} — за це тебе знають трибуни.', signature.map((a) => ATTRIBUTE_LABEL[a]).join(', '))}
        {' '}<b>{t('Слабке:')}</b> {tf('{0} — тут кубик грає сам.', weakest.map((a) => ATTRIBUTE_LABEL[a]).join(', '))}
        {!BALANCE.growth.levels && t(' Ріст — через тиждень: три тренування одного атрибута дають +1 назавжди.')}
      </p>

      {onEspm && (
        <button className="espm-link" onClick={onEspm}>
          <span>{t('Профіль на')} <b>ESPM</b> {t('— матчі, форма, преса')}</span>
          <span aria-hidden="true">›</span>
        </button>
      )}

      <dl className="card-legend">
        <dt><span className="voice-state state-sees">{t('бачить')}</span></dt>
        <dd>{t('помічає те, чого немає в сетапі, і відкриває варіант, якого інші не побачать.')}</dd>
        <dt><span className="voice-state state-heard">{t('чутно')}</span></dt>
        <dd>{t('підказує на кнопці і додає +1 до кидка.')}</dd>
        <dt><span className="voice-state state-silent">{t('мовчить')}</span></dt>
        <dd>{t('не втручається — кубик грає сам.')}</dd>
        <dt><span className="voice-state state-heard">{t('сперечається')}</span></dt>
        <dd>{t('Его і Команда не вмикаються силою атрибута: їх чути за станом матчу — кураж, серія, довіра тренера. Хто з них голосніший — за тим, кого ти слухав частіше.')}</dd>
        <dd className="legend-tail">{t('Прокачка атрибута робить голос голоснішим.')}</dd>
      </dl>

      {onBack && <button className="primary" onClick={onBack}>{t('Назад')}</button>}
    </div>
  );
}
