import type { CSSProperties } from "react";

// The boards set the letter avatar's size and font per place (28, 40, 96 px ...),
// so the forum draws its own with the shared `.av` class instead of <Avatar>.
export const MY_BG = "hsl(210 45% 38%)";
export const bgOf = (hue: number): string => `hsl(${hue} 40% 32%)`;
export const initial = (name: string): string => name.trim().slice(0, 1).toUpperCase();

export function Ava({ text, bg, size, font, radius = 6 }: { text: string; bg: string; size: number; font: number; radius?: number }) {
  const style: CSSProperties = { width: size, height: size, fontSize: font, borderRadius: radius, background: bg };
  return <div className="av" style={style} aria-hidden="true">{text}</div>;
}
