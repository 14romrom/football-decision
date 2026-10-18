import { Component, type ErrorInfo, type ReactNode } from 'react';
import { readShot } from '../telemetry/checkpoint';
import { buildLabel } from './TitleScreen';
import { feedbackContext, openMail } from './FeedbackScreen';
import { t, tf } from '../content/i18n';

// Екран збою (18.10, підготовка до закритого тесту). Без нього будь-яка помилка рендера лишала
// порожній екран: тестер не знає, що робити, а Android vitals помилок усередині WebView не бачить
// зовсім — ми б про збій і не дізналися. Тепер: що сталося людською мовою, шлях назад і звіт листом
// (той самий `mailto:`, що й відгук — мережі в грі як не було, так і нема).
//
// Шлях назад — головне меню з перезавантаженням: App сам повертає знімок `prematch` на старті
// (App.tsx, `restoreShot('prematch')`), тож збій посеред матчу відкочує до екрана перед ним, а не
// лишає кар'єру з половиною матчу. Тому про матч і сказано прямо.

type State = { error: Error | null; stack: string };

export class CrashGuard extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ stack: info.componentStack ?? '' });
    console.error(error);
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    const inMatch = readShot('prematch') !== null;
    const restart = () => { location.hash = '#/'; location.reload(); };
    const report = () => {
      const where = (stack.match(/at (\w+)/) ?? [])[1] ?? '?';
      openMail(tf('Inside the Box · збій · {0}', buildLabel()), [
        t('Що робив перед цим (якщо пам’ятаєш):'), '', '',
        `${error.name}: ${error.message}`,
        (error.stack ?? '').split('\n').slice(1, 6).map((s) => s.trim()).join('\n'),
        '', feedbackContext(tf('збій у {0}', where)),
      ].join('\n'));
    };
    return (
      <div className="crash plain-screen">
        <h1>{t('Щось зламалося')}</h1>
        <p className="about-lead">{t('Гра натрапила на помилку і не може показати цей екран. Кар’єра ціла: усе, що збережено, на місці.')}</p>
        {inMatch && <p className="nav-warn">{t('Матч, який ішов, почнеться заново з екрана перед ним — з тим самим суперником і погодою.')}</p>}
        <button className="primary fb-send" onClick={restart}>{t('До головного меню')}</button>
        <button className="ghost" onClick={report}>{t('Надіслати звіт розробнику')}</button>
        <p className="fb-note">{t('Звіт відкриється листом у пошті: текст помилки, версія і модель телефона. Це допоможе знайти й виправити збій.')}</p>
      </div>
    );
  }
}
