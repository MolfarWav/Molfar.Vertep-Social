import type { Status } from "@/mock/status";

// Five petals around the Vertep "eye". Status is told three ways: colour, the
// mark in the centre, and a word beside it (the caller prints the word).
// "away" and "na" share the warn colour on purpose; the mark tells them apart.
const MARK: Record<Status, string> = {
  online: "M12 12h.01",
  away: "M12 9.6V12l1.8 1.2",
  dnd: "M9.8 12h4.4",
  na: "M10 10l4 4M14 10l-4 4",
  off: "M12 12h.01",
};
const COLOR: Record<Status, string> = {
  online: "var(--ok)",
  away: "var(--warn)",
  dnd: "var(--bad)",
  na: "var(--warn)",
  off: "var(--faint)",
};
const PETALS = [0, 72, 144, 216, 288];

export function Flower({ status, size = 20 }: { status: Status; size?: number }) {
  const stroke = COLOR[status];
  const off = status === "off";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <g fill={off ? "none" : stroke} stroke={stroke} strokeWidth="1.2">
        {PETALS.map((r) => (
          <ellipse key={r} cx="12" cy="6.4" rx="3.5" ry="5" transform={r ? `rotate(${r} 12 12)` : undefined} />
        ))}
      </g>
      <circle cx="12" cy="12" r="4" fill={off ? "none" : "var(--base)"} stroke={stroke} strokeWidth="1.2" />
      <path d={MARK[status]} stroke={stroke} strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** The old ICQ cue: an envelope replaces the flower while a message waits. */
export function Envelope({ size = 20, label }: { size?: number; label: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label}>
      <rect x="3" y="6" width="18" height="13" rx="2" fill="none" stroke="var(--accent)" strokeWidth="1.8" />
      <path d="M3.5 7.5L12 14l8.5-6.5" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
