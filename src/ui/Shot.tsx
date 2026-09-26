import { useState } from 'react';
import { shotFor } from '../content';

// Кадр листа (M24). Файл кладуть у `images/<id>.jpg` і збирають `npx tsx tools/optimize-images.ts` —
// сцена підхоплює його сама. Поки файлу немає, лист лишається текстовим: `useShot` повертає null,
// клас `shot` не ставиться, відступу під кадр немає. Так кадр можна домалювати будь-коли, не чіпаючи код.

/** Кадр сцени, якщо файл є і завантажився. `mark` ставить клас `shot` на лист. */
export function useShot(id: string | undefined) {
  const [failed, setFailed] = useState(false);
  const shot = id && !failed ? shotFor(id) : null;
  return {
    shot,
    mark: shot ? ' shot' : '',
    plate: shot ? (
      <div className="shot-plate">
        <img src={shot.src} alt="" decoding="async" style={{ objectPosition: shot.focus }} onError={() => setFailed(true)} />
      </div>
    ) : null,
  };
}
