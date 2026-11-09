// A picture inside a message or a post: the picture itself (a link that opens it full size), a placeholder while a character's
// picture is being drawn, or a short note when it could not be drawn. The shapes come from the plugins (`image` of a message or post).
import { useT } from "@/i18n/index";
import "./pictures.css";

export interface MsgImage {
  state: "ready" | "pending" | "failed";
  url?: string;
  alt?: string;
  prompt?: string;
  /** Drawn by a model (not attached by the user). */
  gen?: boolean;
}

export function MsgPicture({ image }: { image: MsgImage }) {
  const t = useT();
  if (image.state === "pending") {
    return (
      <div className="mp mp-wait" role="status">
        <span className="mp-spin" aria-hidden="true" />
        <span>{t("pic.waiting")}</span>
        <span className="mp-sub">{t("pic.waitingHint")}</span>
      </div>
    );
  }
  if (image.state === "failed" || !image.url) return <div className="mp mp-fail">{t("pic.lost")}</div>;
  return (
    <a className="mp mp-img" href={image.url} target="_blank" rel="noopener noreferrer" title={t("pic.open")}>
      <img src={image.url} alt={image.alt || t("pic.alt")} loading="lazy" />
      {image.gen && <span className="mp-tag">{t("pic.generated")}</span>}
    </a>
  );
}
