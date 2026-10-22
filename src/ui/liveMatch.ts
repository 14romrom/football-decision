// Що зараз на табло — для шапки паузи (17.10). Матч живе в рефах Game, а пауза — поруч із Game, не
// всередині (App.tsx), і тягнути стан через пропси двадцяти ранніх return'ів не варто. Game пише сюди
// на кожному рендері матчу й скидає на будь-якому іншому екрані; пауза читає, коли відкривається.
// Це не стан React: перемальовувати тут нічого не треба, лише прочитати в момент відкриття.

export type LiveMatch = { minute: number; scoreUs: number; scoreThem: number; us: string; them: string; /** На виїзді господарі — вони, і в шапці паузи вони перші. */ away?: boolean };

let live: LiveMatch | null = null;

export const setLiveMatch = (m: LiveMatch | null): void => { live = m; };
export const liveMatch = (): LiveMatch | null => live;
