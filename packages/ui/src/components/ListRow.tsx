import type { ReactNode } from 'react';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  showDivider?: boolean;
  showChevron?: boolean;
}

/** Workhorse list row — rows + dividers, never cards. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onClick,
  showDivider = true,
  showChevron = false,
}: ListRowProps) {
  const minH = leading && subtitle ? 'min-h-[72px]' : subtitle ? 'min-h-[64px]' : 'min-h-[56px]';

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={[
          'flex w-full items-center gap-3 px-4 text-left',
          minH,
          onClick ? 'hover:bg-grey-50 active:bg-grey-50 cursor-pointer' : 'cursor-default',
        ].join(' ')}
      >
        {leading ? <div className="h-10 w-10 shrink-0">{leading}</div> : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-body-medium text-grey-900">{title}</div>
          {subtitle ? (
            <div className="mt-0.5 truncate text-body-small text-grey-500">{subtitle}</div>
          ) : null}
        </div>
        {trailing}
        {showChevron ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 256 256"
            className="shrink-0 text-grey-500"
            aria-hidden
          >
            <path
              fill="currentColor"
              d="M181.66 133.66l-80 80a8 8 0 0 1-11.32-11.32L164.69 128 90.34 53.66a8 8 0 0 1 11.32-11.32l80 80a8 8 0 0 1 0 11.32Z"
            />
          </svg>
        ) : null}
      </button>
      {showDivider ? (
        <div
          className="h-px bg-grey-200"
          style={{ marginLeft: leading ? 68 : 16 }}
        />
      ) : null}
    </div>
  );
}
