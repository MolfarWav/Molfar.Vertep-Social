// One post: author column with the avatar and facts on desktop, a header row
// on phone. The quote, text and signature are the same on both.
import { themColor } from "@/components/Avatar";
import { Flower } from "@/components/Flower";
import { useT } from "@/i18n/index";
import { hueOf, type MockPost } from "@/mock/forum";
import { Ava, bgOf, initial, MY_BG } from "./Ava";

export type ShownPost = MockPost & { removed?: boolean };

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
  const name = post.me ? t("shell.me") : post.who;
  const color = post.me ? "var(--acct)" : themColor(hueOf(post.who));
  const bg = post.me ? MY_BG : bgOf(hueOf(post.who));

  const body = post.removed ? (
    <div className="post-mod">{t("forum.topic.moderated")}</div>
  ) : (
    <>
      {post.quote && <QuoteBlock who={post.quote.who} text={post.quote.text} />}
      <div>{post.text}</div>
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
          <Ava text={initial(name)} bg={bg} size={40} font={17} />
          <div>
            <div className="nm" style={{ color }}>{name}</div>
            <div className="rk">{post.role}</div>
          </div>
          <div className="pn">
            {post.clock}
            <br />#{post.id}
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
        <Ava text={initial(name)} bg={bg} size={96} font={40} radius={8} />
        <div className="nm" style={{ color }}>{name}</div>
        <div>{post.role}</div>
        <div className="online">
          <Flower status="online" size={16} />
          {t("forum.topic.online")}
        </div>
        <div className="cnt">{t("forum.topic.postCount", { n: post.count })}</div>
        <div>{t("forum.topic.joined", { date: post.joined })}</div>
      </div>
      <div className="post-b">
        <div className="post-h">
          <b>{post.subject}</b>
          <span>
            {t("forum.topic.todayAt", { time: post.clock })} · #{post.id}
          </span>
        </div>
        {body}
        {actions}
      </div>
    </article>
  );
}
