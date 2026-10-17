import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Версия сборки в логах решений: тестеры выгружают накопительный JSON, и без отметки
// не понять, на какой версии сыгран матч (плейтест 17.09: «это старая версия?»).
function gitVersion(): string {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'dev'; }
}

export default defineConfig({
  plugins: [react()],
  base: './',
  // Номер релизу (1.0.3) ставить release.yml із тега. Є номер — збірка йде в Play, і тестових
  // підписів на екранах бути не повинно; немає — це Pages або debug-APK для тестерів.
  define: {
    __APP_VERSION__: JSON.stringify(gitVersion()),
    __APP_RELEASE__: JSON.stringify(process.env.APP_RELEASE ?? ''),
  },
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
});
