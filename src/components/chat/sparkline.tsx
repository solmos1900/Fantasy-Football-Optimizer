"use client";

type Point = { week: number; points: number | null };

export function MiniSparkline({
  points,
  className,
}: {
  points: Point[];
  className?: string;
}) {
  const vals = points
    .map((p) => p.points)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (vals.length < 2) {
    return (
      <span className={className ?? "text-[10px] text-emerald-950/40"}>—</span>
    );
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 64;
  const h = 18;
  const step = w / (points.length - 1 || 1);
  const path = points
    .map((p, i) => {
      const y =
        p.points == null
          ? null
          : h - 2 - ((p.points - min) / span) * (h - 4);
      return y == null ? null : `${i === 0 ? "M" : "L"}${i * step},${y}`;
    })
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
