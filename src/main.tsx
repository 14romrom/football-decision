import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LANG } from './content/i18n';
import './styles.css';

// `index.html` приходить із `lang="uk"` — мова базової версії. Без цього рядка англійська збірка
// лишається «українською» для всього, що читає атрибут: читалка екрана озвучує англійський текст
// українськими правилами, браузер пропонує перекласти сторінку, перенос слів і перевірка орфографії
// ідуть не за тією мовою. Мова відома один раз при завантаженні, тому й ставиться один раз тут.
document.documentElement.lang = LANG;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
