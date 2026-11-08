// A small icon per profile source, tinted by the --hue-* tokens (the same idea as the tab icons of the app).
import type { CSSProperties, ReactElement } from "react";
import type { ProfileSource } from "@/mock/profiles";

const PATHS: Record<ProfileSource, ReactElement> = {
  // an open book: a character taken from a Roleplay card
  roleplay: <path d="M3 6.5C5.5 5 8.5 5 12 7c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5zM12 7v12.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" />,
  // a pencil: made here, by you
  own: <path d="M4 20l1-4.2L16.5 4.3a1.8 1.8 0 0 1 2.5 0l.7.7a1.8 1.8 0 0 1 0 2.5L8.2 19zM14.5 6.3l3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" />,
  // a person: your persona
  persona: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c.8-3.6 3.6-5.5 7.5-5.5s6.7 1.9 7.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />,
};

export function SourceIcon({ source, size = 14 }: { source: ProfileSource; size?: number }) {
  const style: CSSProperties = { color: `var(--hue-${source})`, flex: "none" };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={style}>
      {PATHS[source]}
    </svg>
  );
}
