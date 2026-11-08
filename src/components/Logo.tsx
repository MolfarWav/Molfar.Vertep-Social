/** The Vertep eye, small (the top bar). The big mark is `LogoMark`. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <g fill="none" stroke="#a3323a" strokeWidth="3">
        <circle cx="50" cy="50" r="30" />
        <path d="M50 22L78 50L50 78L22 50Z" />
        <path d="M31 50Q50 33 69 50Q50 67 31 50Z" />
      </g>
      <circle cx="50" cy="50" r="5" fill="#a3323a" />
    </svg>
  );
}
