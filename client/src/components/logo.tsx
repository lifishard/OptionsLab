// OptionsLab mark: two intersecting rising polylines forming a wave/peak
// with an implied Δ (delta) apex — the core symbol of an options desk.
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label="OptionsLab"
      role="img"
    >
      {/* rising P&L polyline forming a Δ-like peak */}
      <path d="M2 20 L8 8 L12 14 L18 4 L22 12" />
      {/* the crossing hedge line */}
      <path d="M2 12 L22 20" opacity="0.45" />
    </svg>
  );
}
