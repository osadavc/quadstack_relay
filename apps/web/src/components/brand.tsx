/*
 * Relay mark: two legs of a relay overlapping where the baton passes.
 * Geometry matches the Figma "Relay mark" component (two capsules on a 24 grid).
 */
export function RelayMark({
  size = 28,
  surface = "light",
  className = "",
}: {
  size?: number;
  surface?: "light" | "dark";
  className?: string;
}) {
  const tile =
    surface === "light" ? "var(--color-inverse)" : "rgb(252 252 250 / 0.12)";
  const glyph = "var(--color-fg-inverse)";
  const radius = Math.round(size * 0.26 * 10) / 10;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Relay"
      className={className}
    >
      <rect width={size} height={size} rx={radius} fill={tile} />
      <g
        transform={`translate(${size * 0.18} ${size * 0.18}) scale(${(size * 0.64) / 24})`}
      >
        <line
          x1="5"
          y1="9"
          x2="14.5"
          y2="9"
          stroke={glyph}
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <line
          x1="9.5"
          y1="15"
          x2="19"
          y2="15"
          stroke={glyph}
          strokeWidth="4.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
