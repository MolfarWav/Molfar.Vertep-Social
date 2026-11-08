// One post: author column with the avatar and facts on desktop, a header row
// on phone. The quote, text and signature are the same on both.
import { themColor } from "@/components/Avatar";
import { Flower } from "@/components/Flower";
import { useT } from "@/i18n/index";
import { hueOf } from "@/mock/forum";
import { Ava, bgOf, initial, MY_BG } from "./Ava";
import type { ShownPost } from "./model";

export type { ShownPost };

export function QuoteBlock({ who, text }: { who: string; text: string }) {
  const t = useT();
  return (
    <div className="quote">
      <div className="q">{t("forum.topic.quoteLabel", { who })}</div>
      {text}
    </div>
  );
}

export function PostCard({
  post,
  phone,
  locked,
  onQuote,
  onReply,
}: {
  post: ShownPost;
  phone: boolean;
  locked: boolean;
  onQuote: (p: ShownPost) => void;
  onReply: () => void;
}) {
  const t = useT();
  const name = post.who;
  const hue = post.hue ?? hueOf(post.who);
  const color = post.me ? "var(--acct)" : themColor(hue);
  const bg = post.me ? MY_BG : bgOf(hue);
  const online = post.online !== false;

  const body = post.removed ? (
    <div className="post-mod">{t("forum.topic.moderated")}</div>
  ) : (
    <>
      {post.quote && <QuoteBlock who={post.quote.who} text={post.quote.text} />}
      <div className="post-text">{post.text}</div>
      {post.sig && <div className="post-sig">{post.sig}</div>}
    </>
  );
  const actions = !locked && !post.removed && (
    <div className="post-act">
      <button type="button" className="btn sm" onClick={() => onQuote(post)}>{t("forum.topic.quote")}</button>
      <button type="button" className="btn sm" onClick={onReply}>{t("forum.topic.reply")}</button>
    </div>
  );

  if (phone) {
    return (
      <article className="post post-phone">
        <div className="post-a">
          <Ava text={initial(name)} bg={bg} size={40} font={17} picture={post.picture} />
          <div>
            <div className="nm" style={{ color }}>{name}</div>
            {post.role && <div className="rk">{post.role}</div>}
          </div>
          <div className="pn">
            {post.clock}
            <br />#{post.n}
          </div>
        </div>
        <div className="post-b">
          {body}
          {actions}
        </div>
      </article>
    );
  }

  return (
    <article className="post post-desk">
      <div className="post-a">
        <Ava text={initial(name)} bg={bg} size={96} font={40} radius={8} picture={post.picture} />
        <div className="nm" style={{ color }}>{name}</div>
        {post.role && <div>{post.role}</div>}
        <div className="online">
          <Flower status={online ? "online" : "off"} size={16} />
          {online ? t("forum.topic.online") : t("forum.topic.offline")}
        </div>
        <div className="cnt">{t("forum.topic.postCount", { n: post.count })}</div>
        {post.joined && <div>{t("forum.topic.joined", { date: post.joined })}</div>}
      </div>
      <div className="post-b">
        <div className="post-h">
          <b>{post.subject}</b>
          <span>
            {post.when ?? t("forum.topic.todayAt", { time: post.clock })} · #{post.n}
          </span>
        </div>
        {body}
        {actions}
      </div>
    </article>
  );
}
