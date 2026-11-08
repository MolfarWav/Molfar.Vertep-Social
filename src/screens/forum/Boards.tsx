// The board list: a table per category on desktop (topics, posts, last post
// columns), cards per category on phone. Both open a topic on click (mock).
import { useT } from "@/i18n/index";
import { hueOf, type MockBoard, type MockCategory } from "@/mock/forum";
import { Ava, bgOf, initial } from "./Ava";
import { ChatIcon } from "./Icons";
import { countLabel } from "./labels";

function iconColor(b: MockBoard): string {
  return b.unread ? "var(--accent)" : "var(--muted)";
}

export function BoardTable({ categories, onOpen }: { categories: MockCategory[]; onOpen: () => void }) {
  const t = useT();
  return (
    <>
      {categories.map((c) => (
        <div className="cat" key={c.id}>
          <div className="catbar">
            <span />
            <span>{c.name}</span>
            <span className="c">{t("forum.cat.topics")}</span>
            <span className="c">{t("forum.cat.posts")}</span>
            <span>{t("forum.cat.last")}</span>
          </div>
          {c.boards.map((b) => (
            <div className="frow" key={b.id}>
              <div className="ico">
                <ChatIcon color={iconColor(b)} />
              </div>
              <div style={{ minWidth: 0 }}>
                <button type="button" className="linkbtn ft" onClick={onOpen}>{b.name}</button>
                <div className="fd">{b.desc}</div>
                <div className="fs">
                  {t("forum.subs")} <b>{b.subs}</b>
                </div>
              </div>
              <div className="num">{b.topics}</div>
              <div className="num">{b.posts}</div>
              <div className="last">
                {b.last ? (
                  <>
                    <Ava text={initial(b.last.who)} bg={bgOf(hueOf(b.last.who))} size={28} font={13} />
                    <div className="t">
                      <button type="button" className="linkbtn lt" onClick={onOpen}>{b.last.title}</button>
                      <span className="lw">{t("forum.byDesk", { who: b.last.who, when: b.last.when })}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <Ava text="–" bg="transparent" size={28} font={13} />
                    <div className="t">
                      <span className="lt">{t("forum.noPosts")}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export function BoardCards({ categories, onOpen }: { categories: MockCategory[]; onOpen: () => void }) {
  const t = useT();
  return (
    <>
      {categories.map((c) => (
        <div className="pcat" key={c.id}>
          <div className="pbar">{c.name}</div>
          {c.boards
            .filter((b) => b.onPhone !== false)
            .map((b) => (
              <div className="pcard" key={b.id}>
                <div className="phead">
                  <div className="ico">
                    <ChatIcon color={iconColor(b)} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <button type="button" className="linkbtn ft" onClick={onOpen}>{b.name}</button>
                    <div className="fd">{b.descPhone ?? b.desc}</div>
                  </div>
                </div>
                <div className="pcnt">
                  {countLabel(t, "topics", b.topics)} · {countLabel(t, "posts", b.posts)}
                </div>
                <div className="plast">
                  {b.last ? (
                    <>
                      <Ava text={initial(b.last.who)} bg={bgOf(hueOf(b.last.who))} size={24} font={12} />
                      <span className="plast-text">
                        <button type="button" className="linkbtn lt" onClick={onOpen}>{b.last.title}</button>
                        {" · "}
                        {t("forum.byPhone", { who: b.last.who, when: b.last.whenShort })}
                      </span>
                    </>
                  ) : (
                    <>
                      <Ava text="–" bg="transparent" size={24} font={12} />
                      <span className="plast-text">
                        <span className="lt">{t("forum.noPosts")}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
        </div>
      ))}
    </>
  );
}
