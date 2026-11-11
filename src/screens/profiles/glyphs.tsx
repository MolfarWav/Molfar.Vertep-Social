// Icons and tones of the profile editor: one icon per tab and per section, one tone per kind of content, like the Settings blocks
// (`screens/settings/tone.tsx`, which keeps its own set for its own blocks). The colour never names a thing alone: the title always does too.
import type { ReactNode } from "react";

export type Tone = "cyan" | "rose" | "violet" | "teal" | "sky" | "amber" | "emerald" | "orange";
export type GlyphName =
  | "user" | "heart" | "users" | "mic" | "pulse" | "chat" | "sprout" | "book" | "cpu" | "star" | "tag" | "eye" | "clock" | "bolt" | "img"
  | "spark" | "smile" | "map" | "tree" | "search" | "plus" | "x" | "trash" | "check" | "brief" | "chevR" | "chevD" | "back" | "cam";

const P: Record<GlyphName, ReactNode> = {
  user: (<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /></>),
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z" />,
  users: (<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c3 0 5 2 5 5" /></>),
  mic: (<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>),
  pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  chat: <path d="M5 4h14a2 2 0 012 2v9a2 2 0 01-2 2h-7l-5 4v-4H5a2 2 0 01-2-2V6a2 2 0 012-2z" />,
  sprout: (<><path d="M12 21v-9" /><path d="M12 12c0-4-2.5-6.5-7-6.5 0 4 2.5 6.5 7 6.5z" /><path d="M12 14c0-3.5 2.2-6 7-6 0 3.8-2.6 6-7 6z" /></>),
  book: (<><path d="M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3z" /><path d="M5 17a3 3 0 013-3h10" /></>),
  cpu: (<><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></>),
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  tag: (<><path d="M3 12V4h8l9 9-8 8z" /><circle cx="7.5" cy="8.5" r="1" /></>),
  eye: (<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  clock: (<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>),
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  img: (<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M4 18l5-5 4 4 3-3 4 4" /></>),
  spark: <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />,
  smile: (<><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M8.5 14c1.9 2 5.1 2 7 0" /></>),
  map: (<><circle cx="12" cy="12" r="2" /><circle cx="5" cy="6" r="1.5" /><circle cx="19" cy="7" r="1.5" /><circle cx="6" cy="18" r="1.5" /><circle cx="18" cy="18" r="1.5" /><path d="M6 7l5 4M18 8l-5 3M7 17l4-4M17 17l-4-4" /></>),
  tree: (<><rect x="9" y="3" width="6" height="4" rx="1" /><rect x="3" y="15" width="6" height="4" rx="1" /><rect x="15" y="15" width="6" height="4" rx="1" /><path d="M12 7v4M6 15v-4h12v4" /></>),
  search: (<><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  check: <path d="M5 12l5 5 9-10" />,
  brief: (<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" /></>),
  chevR: <path d="M9 6l6 6-6 6" />,
  chevD: <path d="M6 9l6 6 6-6" />,
  back: <path d="M15 6l-6 6 6 6" />,
  cam: (<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>),
};

/** One icon, drawn with the text colour; 16 px by default. */
export function Gl({ name, size = 16 }: { name: GlyphName; size?: number }) {
  return (
    <svg className="gl" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}
