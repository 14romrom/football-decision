import type { CapacitorConfig } from '@capacitor/cli';

// Нативная оболочка (решение 19.09: веб + Capacitor, Phaser для анимации матча позже).
// appId менять до первой публикации — после смены телефон считает это другим приложением.
const config: CapacitorConfig = {
  appId: 'ua.footballdecision.app',
  appName: 'Football Decision',
  webDir: 'dist',
  android: { allowMixedContent: false },
};

export default config;
