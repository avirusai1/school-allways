/**
 * Static skeleton blocks — NO shimmer (build/11 §7).
 * Grey/100 at the exact dimensions of the content they replace.
 */

export function Skeleton({
  width,
  height,
  className = '',
  rounded = 'sm',
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
  rounded?: 'sm' | 'md' | 'full';
}) {
  const radius =
    rounded === 'full' ? 'rounded-full' : rounded === 'md' ? 'rounded-md' : 'rounded-sm';
  return (
    <div
      aria-hidden
      className={`bg-grey-100 ${radius} ${className}`}
      style={{ width: width ?? '100%', height: height ?? 16 }}
    />
  );
}

export function SkeletonList({
  count = 5,
  rowHeight = 56,
}: {
  count?: number;
  rowHeight?: number;
}) {
  return (
    <div className="flex flex-col gap-0 px-4" aria-busy aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-grey-200"
          style={{ minHeight: rowHeight }}
        >
          <Skeleton width={40} height={40} rounded="full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton height={14} width="60%" />
            <Skeleton height={12} width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
}
