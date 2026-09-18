import { agoLabel, countLabel, type Post } from '../engine/posts';

// Стрічка між матчами — пародія на твіттер. Экран тонкий: выбор постов в engine/posts.ts,
// тексты в content/posts.json; прототип получит новый UI, этот файл заменяется целиком.

type Props = { posts: Post[]; onNext: () => void };

export function PostsScreen({ posts, onNext }: Props) {
  return (
    <div className="result posts">
      <div className="card-minute">стрічка</div>
      <h1>Що пишуть</h1>
      <div className="posts-list">
        {posts.map((p, i) => (
          <article key={i} className={`post post-${p.account.kind}`}>
            <div className="post-head">
              <span className={`avatar avatar-${p.account.kind}`}>{p.account.name.charAt(0)}</span>
              <b className="post-name">{p.account.name}</b>
              {p.account.kind !== 'fan' && <span className="verified" title="верифіковано кимось">✓</span>}
              <span className="post-handle">{p.account.handle} · {agoLabel(p.hoursAgo)}</span>
            </div>
            <p className="post-text">{p.text}</p>
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
          </article>
        ))}
      </div>
      <button className="primary" onClick={onNext}>Закрити стрічку</button>
    </div>
  );
}
