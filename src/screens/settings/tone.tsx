import type { ReactNode } from "react";

// One colour and one icon per settings block, like the tinted title bars of Roleplay's settings (one hue per kind of content).
// The colour never names a block alone: the title and the icon always do. The CSS for the tones is in settings.css.

export type Tone = "cyan" | "rose" | "emerald" | "amber" | "violet" | "teal" | "sky" | "orange";
export type Glyph = "forum" | "messenger" | "life" | "community" | "members" | "pictures" | "models" | "notify" | "language" | "access" | "reset" | "other";

/** What each block looks like: its tone and icon, by the name the screens use. */
export const LOOK: Record<Glyph, Tone> = {
  forum: "cyan",
  messenger: "rose",
  life: "emerald",
  community: "sky",
  members: "rose",
  pictures: "amber",
  models: "violet",
  notify: "teal",
  language: "sky",
  access: "orange",
  reset: "rose",
  other: "violet",
};

const PATHS: Record<Glyph, ReactNode> = {
  // two overlapping speech bubbles
  forum: (
    <>
      <path d="M4 5h11a1 1 0 011 1v6a1 1 0 01-1 1H9l-3 3v-3H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
      <path d="M19 9h1a1 1 0 011 1v6a1 1 0 01-1 1h-1v3l-3-3h-5" />
    </>
  ),
  // one speech bubble with a smile
  messenger: (
    <>
      <path d="M5 4h14a2 2 0 012 2v9a2 2 0 01-2 2h-7l-5 4v-4H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
      <path d="M9 10h.01M15 10h.01M9.5 13.2c1.4 1.2 3.6 1.2 5 0" />
    </>
  ),
  // a sprout
  life: (
    <>
      <path d="M12 21v-9" />
      <path d="M12 12c0-4-2.5-6.5-7-6.5 0 4 2.5 6.5 7 6.5z" />
      <path d="M12 14c0-3.5 2.2-6 7-6 0 3.8-2.6 6-7 6z" />
    </>
  ),
  // two people
  community: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16 14.2c3 0 5 2 5 5" />
    </>
  ),
  // a picture: frame, sun, hills
  pictures: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M21 16l-5-5-8 9" />
    </>
  ),
  // a chip
  models: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
    </>
  ),
  // a bell
  notify: (
    <>
      <path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z" />
      <path d="M10 21h4" />
    </>
  ),
  // a heart
  members: (
    <>
      <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
    </>
  ),
  // a globe
  language: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z" />
    </>
  ),
  // a key
  access: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M16 7l3 3M14 9l2 2" />
    </>
  ),
  // a circular arrow
  reset: (
    <>
      <path d="M4 12a8 8 0 108-8 8 8 0 00-6 2.7" />
      <path d="M4 4v4h4" />
    </>
  ),
  // sliders
  other: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
};

/** A block's icon: 18 px, drawn with the text colour of its tone. */
export function BlockIcon({ glyph, size = 18 }: { glyph: Glyph; size?: number }) {
  return (
    <svg className="bi" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[glyph]}
    </svg>
  );
}
