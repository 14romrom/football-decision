import { useState } from 'react';
import { readSlotSummary } from '../telemetry/saves';
import { activeSlot } from '../telemetry/slots';
import { readSettings } from '../telemetry/settings';
import { liveMatch } from './liveMatch';
import { buildLabel, slotLine } from './TitleScreen';
import { t, tf } from '../content/i18n';

// Відгук (18.10, підготовка до закритого тесту). Тестерам з Reddit і з чатів треба одне місце, куди
// написати, — інакше відгуків немає, а Google при заявці на вихід питає саме про них. Форма — тут, у
// грі; **надсилає поштова програма телефона** (`mailto:`), а не гра: у застосунку немає жодного
// мережевого запиту, і Data safety та політика конфіденційності лишаються «нічого не збираємо».
// Ціна — один зайвий тап «Надіслати» в пошті; зате людина бачить увесь лист перед відправкою.
// Контекст (версія, мова, тур, телефон) гра дописує сама: «не працює кнопка» без версії й екрана не
// відтворити. Особистого нічого — лише те, що видно в рядку нижче листа.

export const FEEDBACK_EMAIL = 'valmara.fc@gmail.com';

type Kind = 'bug' | 'unclear' | 'idea' | 'like';
const KINDS: [Kind, string][] = [['bug', t('Помилка')], ['unclear', t('Незрозуміло')], ['idea', t('Ідея')], ['like', t('Сподобалося')]];

/** Хвіст листа: що за збірка й де гравець. Спільний для відгуку й звіту про збій. */
export function feedbackContext(where: string): string {
  const s = readSettings();
  const slot = readSlotSummary(activeSlot());
  const live = liveMatch();
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  // Модель і версія Android — з дужок user agent; решта рядка (рушій WebView) для відтворення не потрібна.
  const device = (ua.match(/\(([^)]*Android[^)]*)\)/) ?? [])[1] ?? ua.slice(0, 120);
  return [
    '—',
    tf('Версія: {0}', buildLabel()),
    tf('Мова: {0}', s.lang),
    slot.empty ? '' : tf('Кар’єра: {0}', slotLine(slot)),
    live ? tf('Матч: {0}′, {1} {2}:{3} {4}', live.minute, live.us, live.scoreUs, live.scoreThem, live.them) : '',
    tf('Звідки: {0}', where),
    tf('Пристрій: {0}', device),
    typeof window === 'undefined' ? '' : tf('Екран: {0}×{1}', window.innerWidth, window.innerHeight),
  ].filter(Boolean).join('\n');
}

/** Відкрити поштову програму з готовим листом. Посиланням-кліком, а не `location`: у WebView
 *  Capacitor зовнішня схема віддається системі як intent, і гра лишається на своєму екрані. */
export function openMail(subject: string, body: string) {
  const a = document.createElement('a');
  a.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  a.rel = 'noopener';
  a.click();
}

type Props = { onBack: () => void; backLabel: string; where: string };

export function FeedbackScreen({ onBack, backLabel, where }: Props) {
  const [kind, setKind] = useState<Kind>('bug');
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const label = KINDS.find(([k]) => k === kind)![1];
  const send = () => openMail(tf('Inside the Box · {0} · {1}', label, buildLabel()), `${text.trim()}\n\n${feedbackContext(where)}`);
  const copy = () => { void navigator.clipboard?.writeText(FEEDBACK_EMAIL).then(() => setCopied(true), () => {}); };

  return (
    <div className="feedback plain-screen">
      <h1>{t('Написати розробнику')}</h1>
      <p className="about-lead">{t('Inside the Box робить одна людина, і кожен лист читається. Що зламалося, що незрозуміло, що зайве — пиши як є.')}</p>

      <h2>{t('Про що')}</h2>
      <span className="seg fb-kind" role="radiogroup" aria-label={t('Про що')}>
        {KINDS.map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>
        ))}
      </span>

      <h2>{t('Лист')}</h2>
      <textarea className="fb-text" rows={6} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={kind === 'bug' ? t('Що сталося і що ти робив перед цим') : t('Кілька слів — цього досить')} />
      <p className="fb-note">{t('До листа гра допише версію, мову, тур і модель телефона, щоб помилку можна було повторити. Лист відкриється в пошті — його можна перечитати перед відправкою.')}</p>

      <button className="primary fb-send" onClick={send}>{t('Відкрити лист у пошті')}</button>
      <p className="fb-note">
        {t('Пошта не відкрилася — напиши на')} <b className="fb-mail">{FEEDBACK_EMAIL}</b>{' '}
        <button type="button" className="fb-copy" onClick={copy}>{copied ? t('скопійовано') : t('скопіювати')}</button>
      </p>

      <button className="row row-back" onClick={onBack}>{backLabel}</button>
    </div>
  );
}
