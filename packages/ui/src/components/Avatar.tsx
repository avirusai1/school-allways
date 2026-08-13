export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 32 | 40 | 48;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export function Avatar({ name, src, size = 40, className = '' }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      className={[
        'inline-flex items-center justify-center rounded-full bg-blue-100 text-caption font-semibold text-blue-700',
        className,
      ].join(' ')}
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  );
}
