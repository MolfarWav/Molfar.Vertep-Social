import type { CSSProperties } from "react";

/** A square letter avatar. The hue comes from the profile; `dim` is for offline contacts. */
export function Avatar({ name, hue, size = 32, dim = false, radius = 6 }: { name: string; hue: number; size?: number; dim?: boolean; radius?: number }) {
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.44),
    borderRadius: radius,
    background: `hsl(${hue} 40% ${dim ? 26 : 32}%)`,
  };
  return (
    <div className="av" style={style} aria-hidden="true">
      {name.trim().slice(0, 1).toUpperCase()}
    </div>
  );
}

/** Colour for a character's name in a message log. Lightness follows the theme. */
export const themColor = (hue: number): string => `hsl(${hue} 55% var(--them-l))`;
