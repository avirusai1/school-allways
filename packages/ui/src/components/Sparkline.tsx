export interface SparklineProps {
  /** Oldest first. Fewer than two points renders nothing. */
  values: number[];
  /** Describes the trend for screen readers — the shape alone says nothing. */
  label: string;
  height?: number;
  className?: string;
}

/**
 * One line, one colour, no axes, no legend (build/14 §11). A trend the eye
 * reads in a glance; the exact figures live in the tile above it.
 */
export function Sparkline({
  values,
  label,
  height = 40,
  className = '',
}: SparklineProps) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  // A flat run would divide by zero and collapse the line onto the top edge.
  const span = max - min || 1;
  const stepX = 100 / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = 100 - ((v - min) / span) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 100 100"
      // The viewBox is unitless so the line stretches to the card; without this
      // the aspect ratio would letterbox it.
      preserveAspectRatio="none"
      height={height}
      className={`w-full ${className}`}
    >
      <polyline
        points={points}
        fill="none"
        className="stroke-blue-500"
        strokeWidth={2}
        // Stroke scales with the viewBox otherwise, so a wide card would draw a
        // hairline and a narrow one a slab.
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
