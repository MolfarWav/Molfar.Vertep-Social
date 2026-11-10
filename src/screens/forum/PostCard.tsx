// One post: author column with the avatar and facts on desktop, a header row
// on phone. The quote, text and signature are the same on both.
import { useState } from "react";
import { themColor } from "@/components/Avatar";
import { Flower } from "@/components/Flower";
import { useT } from "@/i18n/index";
import { MsgPicture } from "@/pictures/MsgPicture";
import { RichText } from "@/stickers/Render";
import { hueOf } from "@/mock/forum";
import { Ava, bgOf, initial, MY_BG } from "./Ava";
import { REACTION_SET, type ShownPost } from "./model";

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
  remove,
  onReact,
}: {
  post: ShownPost;
  phone: boolean;
  locked: boolean;
  onQuote: (p: ShownPost) => void;
  onReply: () => void;
  /** The user's own moderation (real forum only): removes this post, or deletes the whole topic when it is the opening post.
   *  Resolves to an error text, or null when it worked. */
  remove?: { topic: boolean; run: () => Promise<string | null> };
  /** Gives or takes back a reaction (real forum only); the chips are drawn without it, but do nothing. */
  onReact?: (post: ShownPost, emoji: string) => Promise<void>;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);
  const react = async (emoji: string) => {
    setPicking(false);
    await onReact?.(post, emoji);
  };
  const confirm = async () => {
    if (!remove || busy) return;
    setBusy(true);
    setError("");
    const err = await remove.run();
    setBusy(false);
    if (err) setError(err);
  };
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
      {post.text && <div className="post-text"><RichText text={post.text} /></div>}
      {post.image && <MsgPicture image={post.image} />}
      {post.sig && <div className="post-sig">{post.sig}</div>}
      {(post.react?.length || onReact) && (
        <div className="post-react">
          {post.react?.map((r) => (
            <button
              key={r.emoji}
              type="button"
              className={"rx" + (r.mine ? " mine" : "")}
              aria-pressed={r.mine}
              disabled={!onReact}
              title={r.who}
              aria-label={t("forum.react.chip", { emoji: r.emoji, n: r.n, who: r.who })}
              onClick={() => void react(r.emoji)}
            >
              <span className="emo" aria-hidden="true">{r.emoji}</span> {r.n}
            </button>
          ))}
          {onReact && (
            <button type="button" className="rx add" aria-expanded={picking} aria-label={t("forum.react.add")} title={t("forum.react.add")} onClick={() => setPicking((v) => !v)}>
              {"\u{1F642}"}+
            </button>
          )}
          {picking && (
            <span className="rx-pick" role="group" aria-label={t("forum.react.pick")}>
              {REACTION_SET.map((e) => (
                <button key={e} type="button" className="rx" aria-label={e} onClick={() => void react(e)}>{e}</button>
              ))}
            </span>
          )}
        </div>
      )}
    </>
  );
  const actions = !post.removed && (
    <>
      {asking && remove ? (
        <div className="post-ask" role="alertdialog" aria-label={t(remove.topic ? "forum.topic.deleteAsk" : "forum.post.removeAsk")}>
          <span>{t(remove.topic ? "forum.topic.deleteAsk" : "forum.post.removeAsk")}</span>
          <span className="post-ask-btns">
            <button type="button" className="btn sm danger" onClick={() => void confirm()} disabled={busy} aria-busy={busy}>
              {t(remove.topic ? "forum.topic.deleteYes" : "forum.post.removeYes")}
            </button>
            <button type="button" className="btn sm" onClick={() => setAsking(false)} disabled={busy}>{t("forum.post.keep")}</button>
          </span>
        </div>
      ) : (
        (!locked || remove) && (
          <div className="post-act">
            {!locked && <button type="button" className="btn sm" onClick={() => onQuote(post)}>{t("forum.topic.quote")}</button>}
            {!locked && <button type="button" className="btn sm" onClick={onReply}>{t("forum.topic.reply")}</button>}
            {remove && (
              <button type="button" className="btn sm danger" onClick={() => setAsking(true)}>
                {t(remove.topic ? "forum.topic.delete" : "forum.post.remove")}
              </button>
            )}
          </div>
        )
      )}
      {error && <div className="form-err" role="alert">{t("forum.post.removeFailed", { error })}</div>}
    </>
  );

  if (phone) {
    return (
      <article className="post post-phone" data-n={post.n}>
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
    <article className="post post-desk" data-n={post.n}>
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
