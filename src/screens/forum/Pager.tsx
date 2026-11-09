// Page links of a long topic: first, previous, "Page 2 of 5", next, last. Not drawn for a topic of one page.
import { useT } from "@/i18n/index";

export type PageTarget = number | "last";

export interface PagerProps {
  page: number;
  pages: number;
  onPage: (page: PageTarget) => void;
}

export function Pager({ page, pages, onPage }: PagerProps) {
  const t = useT();
  if (pages <= 1) return null;
  const atStart = page <= 1;
  const atEnd = page >= pages;
  return (
    <nav className="pager" aria-label={t("forum.pager.label")}>
      <button type="button" className="btn sm" disabled={atStart} onClick={() => onPage(1)} aria-label={t("forum.pager.first")} title={t("forum.pager.first")}>
        «
      </button>
      <button type="button" className="btn sm" disabled={atStart} onClick={() => onPage(page - 1)} aria-label={t("forum.pager.prev")} title={t("forum.pager.prev")}>
        ‹
      </button>
      <span className="pager-now" aria-live="polite">{t("forum.topic.page", { page, pages })}</span>
      <button type="button" className="btn sm" disabled={atEnd} onClick={() => onPage(page + 1)} aria-label={t("forum.pager.next")} title={t("forum.pager.next")}>
        ›
      </button>
      <button type="button" className="btn sm" disabled={atEnd} onClick={() => onPage("last")} aria-label={t("forum.pager.last")} title={t("forum.pager.last")}>
        »
      </button>
    </nav>
  );
}
