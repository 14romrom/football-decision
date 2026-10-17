// Хеш коммита сборки — подставляется vite.config.ts (define), в тестах не нужен.
declare const __APP_VERSION__: string;
// Номер релізу з тега («1.0.3»), порожній у тестових збірках — ставить release.yml.
declare const __APP_RELEASE__: string;
