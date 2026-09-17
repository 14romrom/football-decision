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
  define: { __APP_VERSION__: JSON.stringify(gitVersion()) },
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
});
