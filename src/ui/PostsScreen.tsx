import { useState } from 'react';
import { agoLabel, countLabel, type Post, type PostAccount, type ReplyOption } from '../engine/posts';

// Стрічка між матчами — пародія на твіттер, тепер і за формою (19.09, макет «Стрічка як застосунок»,
// решение пользователя): застосунок «Y» (то, что пришло после X — оммаж в один символ, как ESPM), без
// рамки браузера — телефон уже в руках. Анатомия поста X: аватар 40, имя + галочка, @handle · час, текст,
// ряд действий SVG-иконками; системный шрифт вместо Lora — чужой застосунок. Ответ игрока — компоуз под
// постом с ниткой треда. Выбор постов — engine/posts.ts, тексты — content/posts.json, здесь только вид.
// Аватары: `public/img/avatars/<handle без @>.webp`, если файла нет — буква на цветном круге (onError).

type Props = {
  posts: Post[];
  /** Имя и хендл игрока — для его собственного ответа в ленте. */
  self: { name: string; handle: string };
  /** Применить выбранный ответ; возвращает бирки последствий. */
  onReply: (post: Post, option: ReplyOption) => string[];
  onNext: () => void;
};

const I = {
  reply: <svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" /></svg>,
  repost: <svg viewBox="0 0 24 24"><path d="M7 7h10l-3-3m3 3-3 3M17 17H7l3 3m-3-3 3-3" /></svg>,
  like: <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /></svg>,
  views: <svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-8M22 20v-4" /></svg>,
  share: <svg viewBox="0 0 24 24"><path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6" /></svg>,
};

/** Аватар аккаунта: картинка по хендлу, иначе буква. Реєс — портрет с картки, кроп по лицу (object-position). */
function Avatar({ account, self }: { account?: PostAccount; self?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (self) return <span className="x-av x-av-self"><img src="./img/portrait.webp" alt="" decoding="async" /></span>;
  const a = account!;
  const file = a.handle.replace(/^@/, '');
  return (
    <span className={`x-av x-av-${a.kind}`}>
      {!broken && <img src={`./img/avatars/${file}.webp`} alt="" decoding="async" onError={() => setBroken(true)} />}
      {broken && a.name.charAt(0)}
    </span>
  );
}

function Name({ account, self, when }: { account?: PostAccount; self?: { name: string; handle: string }; when?: string }) {
  const name = self ? self.name : account!.name;
  const handle = self ? self.handle : account!.handle;
  const badge = self || account!.kind !== 'fan';
  const gold = !self && account!.kind === 'club';
  return (
    <div className="x-nm">
      <b>{name}</b>
      {badge && <span className={`x-badge ${gold ? 'gold' : ''}`} title="верифіковано кимось">✓</span>}
      <span className="x-h">{handle}{when ? ` · ${when}` : ''}</span>
    </div>
  );
}

function Acts({ p }: { p: Post }) {
  return (
    <div className="x-acts">
      <span>{I.reply}{countLabel(Math.round(p.reposts / 2))}</span>
      <span>{I.repost}{countLabel(p.reposts)}</span>
      <span className={p.account.kind === 'fan' && p.likes < 200 ? 'liked' : ''}>{I.like}{countLabel(p.likes)}</span>
      <span>{I.views}{countLabel(p.likes * 41 + p.reposts * 7)}</span>
      <span>{I.share}</span>
    </div>
  );
}

export function PostsScreen({ posts, self, onReply, onNext }: Props) {
  const [replied, setReplied] = useState<{ index: number; option: ReplyOption; tags: string[] } | null>(null);
  const [draft, setDraft] = useState<{ index: number; option: ReplyOption } | null>(null);

  return (
    <div className="result posts">
      <div className="x-app">
        <div className="x-top"><Avatar self /><span className="x-logo" aria-label="Y">Y</span><span className="x-gear" aria-hidden="true" /></div>
        <div className="x-tabs"><span className="on">Для тебе</span><span>Підписки</span></div>

        {posts.map((p, i) => {
          const when = p.kind === 'live' && p.liveMinute !== undefined ? undefined : agoLabel(p.hoursAgo);
          const open = p.replyOptions && !replied;
          const done = replied && replied.index === i && replied.option.text;
          const threaded = !!p.reply || open || done;
          return (
            <article key={i} className={`x-tw x-${p.account.kind} x-kind-${p.kind} ${threaded ? 'x-thread' : ''}`}>
              <Avatar account={p.account} />
              <div className="x-body">
                <Name account={p.account} when={when} />
                {p.kind === 'live' && p.liveMinute !== undefined && <span className="x-live">{p.liveMinute}′ · наживо</span>}
                {p.kind === 'promo' && <span className="x-ad">Реклама</span>}
                {p.kind === 'deleted'
                  ? <p className="x-tx x-del">Цей пост видалено автором.</p>
                  : <p className="x-tx">{p.text}</p>}
                {p.poll && (
                  <div className="x-poll">
                    {p.poll.map((o, k) => (
                      <div key={o.text} className={k === 0 ? 'top' : ''} style={{ ['--w' as string]: `${o.pct}%` }}><span>{o.text}</span><b>{o.pct}%</b></div>
                    ))}
                    <small>{countLabel(p.likes * 3)} голосів · Завершено</small>
                  </div>
                )}
                <Acts p={p} />
              </div>

              {p.reply && (
                <>
                  <Avatar account={p.reply.account} />
                  <div className="x-body x-sub">
                    <Name account={p.reply.account} when={agoLabel(Math.max(0, p.hoursAgo - 1))} />
                    {p.kind === 'deleted' && <p className="x-quote">{p.text}</p>}
                    <p className="x-tx">{p.reply.text}</p>
                  </div>
                </>
              )}

              {open && (
                <>
                  <Avatar self />
                  <div className="x-body x-sub x-compose">
                    <div className="x-ph">{draft && draft.index === i ? draft.option.text : 'Напиши відповідь'}</div>
                    <div className="x-opts">
                      {p.replyOptions!.map((o, k) => (
                        <button key={k} type="button" className={draft?.index === i && draft.option === o ? 'on' : ''} onClick={() => setDraft({ index: i, option: o })}>{o.text}</button>
                      ))}
                      <button type="button" className="skip" onClick={() => setReplied({ index: i, option: { text: '', reaction: '', effect: { note: '' } }, tags: [] })}>Не відповідати</button>
                    </div>
                    <button type="button" className="x-post-btn" disabled={!(draft && draft.index === i)}
                      onClick={() => { if (draft && draft.index === i) setReplied({ index: i, option: draft.option, tags: onReply(p, draft.option) }); }}>Опублікувати</button>
                  </div>
                </>
              )}

              {done && (
                <>
                  <Avatar self />
                  <div className="x-body x-sub">
                    <Name self={self} when="щойно" />
                    <p className="x-tx">{replied.option.text}</p>
                  </div>
                  <Avatar account={p.account} />
                  <div className="x-body x-sub">
                    <Name account={p.account} when="щойно" />
                    <p className="x-tx">{replied.option.reaction}</p>
                    {replied.tags.length > 0 && (
                      <ul className="tags">
                        {replied.tags.map((t) => <li key={t} className="badge badge-neutral">{t}</li>)}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
      <button className="primary menu-primary" onClick={onNext}>Закрити стрічку</button>
    </div>
  );
}
