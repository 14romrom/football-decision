import { useState } from 'react';
import { agoLabel, countLabel, type Post, type ReplyOption } from '../engine/posts';

// Стрічка між матчами — пародія на твіттер. Экран тонкий: выбор постов в engine/posts.ts,
// тексты в content/posts.json; прототип получит новый UI, этот файл заменяется целиком.
// 19.09: виды постов (опрос, видалений, реклама, лайв) и ответ игрока на один пост — решение
// без кубика с последствиями на следующий матч (App.onReply → applyWeek).

type Props = {
  posts: Post[];
  /** Имя и хендл игрока — для его собственного ответа в ленте. */
  self: { name: string; handle: string };
  /** Применить выбранный ответ; возвращает бирки последствий. */
  onReply: (post: Post, option: ReplyOption) => string[];
  onNext: () => void;
};

export function PostsScreen({ posts, self, onReply, onNext }: Props) {
  const [replied, setReplied] = useState<{ index: number; option: ReplyOption; tags: string[] } | null>(null);

  return (
    <div className="result posts">
      <div className="card-minute">стрічка</div>
      <h1>Що пишуть</h1>
      <div className="posts-list">
        {posts.map((p, i) => (
          <article key={i} className={`post post-${p.account.kind} kind-${p.kind}`}>
            <div className="post-head">
              <span className={`avatar avatar-${p.account.kind}`}>{p.account.name.charAt(0)}</span>
              <b className="post-name">{p.account.name}</b>
              {p.account.kind !== 'fan' && <span className="verified" title="верифіковано кимось">✓</span>}
              <span className="post-handle">{p.account.handle} · {p.kind === 'live' && p.liveMinute !== undefined ? `${p.liveMinute}′` : agoLabel(p.hoursAgo)}</span>
              {p.kind === 'promo' && <span className="post-promo">Реклама</span>}
            </div>
            <p className={`post-text ${p.kind === 'deleted' ? 'deleted' : ''}`}>{p.text}</p>
            {p.poll && (
              <div className="poll">
                {p.poll.map((o) => (
                  <div key={o.text} className="poll-row">
                    <span className="poll-bar" style={{ width: `${o.pct}%` }} />
                    <span className="poll-text">{o.text}</span>
                    <span className="poll-pct">{o.pct}%</span>
                  </div>
                ))}
                <div className="post-handle">{countLabel(p.likes * 3)} голосів</div>
              </div>
            )}
            <div className="post-foot">
              <span>💬 {countLabel(Math.round(p.reposts / 2))}</span>
              <span>🔁 {countLabel(p.reposts)}</span>
              <span>♡ {countLabel(p.likes)}</span>
            </div>
            {p.reply && (
              <div className="post-reply">
                <span className={`avatar avatar-${p.reply.account.kind} small`}>{p.reply.account.name.charAt(0)}</span>
                <span><b>{p.reply.account.name}</b> <span className="post-handle">{p.reply.account.handle}</span><br />{p.reply.text}</span>
              </div>
            )}
            {p.replyOptions && !replied && (
              <div className="reply-options">
                <div className="post-handle">Відповісти:</div>
                {p.replyOptions.map((o, k) => (
                  <button key={k} className="reply-option" onClick={() => setReplied({ index: i, option: o, tags: onReply(p, o) })}>{o.text}</button>
                ))}
                <button className="reply-option muted" onClick={() => setReplied({ index: i, option: { text: '', reaction: '', effect: { note: '' } }, tags: [] })}>Не відповідати</button>
              </div>
            )}
            {replied && replied.index === i && replied.option.text && (
              <>
                <div className="post-reply self-reply">
                  <span className="avatar avatar-club small">{self.name.charAt(0)}</span>
                  <span><b>{self.name}</b> <span className="verified">✓</span> <span className="post-handle">{self.handle}</span><br />{replied.option.text}</span>
                </div>
                <div className="post-reply">
                  <span className={`avatar avatar-${p.account.kind} small`}>{p.account.name.charAt(0)}</span>
                  <span><b>{p.account.name}</b> <span className="post-handle">{p.account.handle}</span><br />{replied.option.reaction}</span>
                </div>
                {replied.tags.length > 0 && (
                  <ul className="tags">
                    {replied.tags.map((t) => <li key={t} className="badge badge-neutral">{t}</li>)}
                  </ul>
                )}
              </>
            )}
          </article>
        ))}
      </div>
      <button className="primary" onClick={onNext}>Закрити стрічку</button>
    </div>
  );
}
