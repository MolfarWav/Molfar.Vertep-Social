// The profile list: search, source filter, rows, and the empty state with
// "Clear search". Desktop puts it in a 320 px column; the phone is its own
// screen (header, search under it, filter pills, the list, a New button).
import type { ReactNode } from "react";
import { useT } from "@/i18n/index";
import { Avatar } from "@/components/Avatar";
import { useChrome } from "@/shell/nav";
import { SOURCE_KEY, type MockProfile } from "@/mock/profiles";
import { FILTERS, countBySource, filterProfiles, splitMatch, type SourceFilter } from "./search";

export interface ListProps {
  /** All profiles (the total in "Found N of M" and the title). */
  profiles: MockProfile[];
  query: string;
  onQuery: (q: string) => void;
  source: SourceFilter;
  onSource: (s: SourceFilter) => void;
  selectedId: string;
  /** Desktop: select the profile for the editor beside it. Phone: open its editor. */
  onPick: (id: string) => void;
  /** The Import button. Not built yet: optional, does nothing when missing. */
  onImport?: () => void;
}

const FILTER_KEY: Record<SourceFilter, string> = {
  all: "profiles.filter.all",
  roleplay: "profiles.filter.roleplay",
  own: "profiles.filter.own",
  persona: "profiles.filter.persona",
};

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ClearIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ImportIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The name with the matched part in the accent colour. */
function Name({ name, query }: { name: string; query: string }) {
  const { before, hit, after } = splitMatch(name, query);
  return (
    <span className="nm">
      {before}
      {hit && <b className="hit">{hit}</b>}
      {after}
    </span>
  );
}

/** Shared model: what is shown, the counts, whether to show "Found N of M". */
function useListModel(props: ListProps) {
  const t = useT();
  const shown = filterProfiles(props.profiles, props.query, props.source);
  const counts = countBySource(props.profiles);
  const filtering = props.query.trim() !== "" || props.source !== "all";
  const found = filtering ? (
    <div className="cnt">{t("profiles.found", { n: shown.length, m: props.profiles.length })}</div>
  ) : null;
  return { t, shown, counts, found };
}

function Rows({ items, query, selectedId, onPick, phone, onClear }: { items: MockProfile[]; query: string; selectedId: string; onPick: (id: string) => void; phone: boolean; onClear: () => void }) {
  const t = useT();
  if (items.length === 0) {
    return (
      <div className="empty">
        <p>{t("profiles.empty.title", { q: query.trim() })}</p>
        <button type="button" className="btn" onClick={onClear}>{t("profiles.empty.clear")}</button>
      </div>
    );
  }
  return (
    <div className="rows">
      {items.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`crow${phone ? " crow-p" : ""}${!phone && p.id === selectedId ? " sel" : ""}`}
          aria-current={!phone && p.id === selectedId ? "true" : undefined}
          onClick={() => onPick(p.id)}
        >
          <Avatar name={p.name} hue={p.hue} size={phone ? 40 : 36} />
          <span className="t">
            <Name name={p.name} query={query} />
            <span className="s">{t(SOURCE_KEY[p.source])}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange, phone, children }: { value: string; onChange: (v: string) => void; phone: boolean; children?: ReactNode }) {
  const t = useT();
  return (
    <div className={phone ? "srch-p" : "srch"}>
      <SearchIcon />
      <input
        type="search"
        aria-label={t("profiles.search.label")}
        placeholder={t("profiles.search.placeholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {children}
    </div>
  );
}

/** Desktop: the list column. */
export function ProfileListDesktop(props: ListProps) {
  const { t, shown, counts, found } = useListModel(props);
  const clear = () => props.onQuery("");
  return (
    <aside className="pl-desk">
      <div className="tbar">{t("profiles.listTitle", { n: props.profiles.length })}</div>
      <div className="desk-btns">
        <button type="button" className="btn cta">{t("profiles.new")}</button>
        <button type="button" className="btn" onClick={props.onImport}>{t("profiles.import")}</button>
      </div>
      <SearchBox value={props.query} onChange={props.onQuery} phone={false} />
      <div className="seg seg-small" role="radiogroup" aria-label={t("profiles.filter.label")}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={props.source === f}
            className={props.source === f ? "on" : ""}
            onClick={() => props.onSource(f)}
          >
            {t(FILTER_KEY[f])} {counts[f]}
          </button>
        ))}
      </div>
      {found}
      <Rows items={shown} query={props.query} selectedId={props.selectedId} onPick={props.onPick} phone={false} onClear={clear} />
    </aside>
  );
}

/** Phone: the whole screen. The shell's top bar is hidden; this header replaces it. */
export function ProfileListPhone(props: ListProps) {
  useChrome({ bar: false });
  const { t, shown, found } = useListModel(props);
  const clear = () => props.onQuery("");
  return (
    <div className="pl-phone">
      <header className="hd-list">
        <h1 className="title">{t("profiles.title")}</h1>
        <button type="button" className="hbtn" aria-label={t("profiles.import")} onClick={props.onImport}>
          <ImportIcon />
        </button>
      </header>
      <SearchBox value={props.query} onChange={props.onQuery} phone>
        {props.query !== "" && (
          <button type="button" className="hbtn x" aria-label={t("profiles.search.clear")} onClick={clear}>
            <ClearIcon />
          </button>
        )}
      </SearchBox>
      <div className="pills" role="radiogroup" aria-label={t("profiles.filter.label")}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={props.source === f}
            className={`pill${props.source === f ? " on" : ""}`}
            onClick={() => props.onSource(f)}
          >
            {t(FILTER_KEY[f])}
          </button>
        ))}
      </div>
      {found}
      <Rows items={shown} query={props.query} selectedId={props.selectedId} onPick={props.onPick} phone onClear={clear} />
      <button type="button" className="fab">{t("profiles.fab")}</button>
    </div>
  );
}
