import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';

export type DataTableDensity = 'comfortable' | 'compact';

export interface DataTableColumn<T> {
  id: string;
  header: string;
  /** Numeric columns are right-aligned with tabular figures. */
  numeric?: boolean;
  cell: (row: T) => ReactNode;
  width?: number | string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  density?: DataTableDensity;
  selectedKeys?: Set<string>;
  onRowClick?: (row: T) => void;
  /** Virtualise when above this count (default 100). */
  virtualizeAbove?: number;
  maxHeight?: number;
  className?: string;
}

/**
 * Web admin table — sticky header, dividers, no zebra.
 * Lightweight windowing above [virtualizeAbove] without extra deps.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  density = 'comfortable',
  selectedKeys,
  onRowClick,
  virtualizeAbove = 100,
  maxHeight = 480,
  className = '',
}: DataTableProps<T>) {
  const rowH = density === 'compact' ? 40 : 48;
  const shouldVirtualize = rows.length > virtualizeAbove;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const { start, end, padTop, padBottom } = useMemo(() => {
    if (!shouldVirtualize) {
      return { start: 0, end: rows.length, padTop: 0, padBottom: 0 };
    }
    const visible = Math.ceil(maxHeight / rowH) + 4;
    const s = Math.max(0, Math.floor(scrollTop / rowH) - 2);
    const e = Math.min(rows.length, s + visible);
    return {
      start: s,
      end: e,
      padTop: s * rowH,
      padBottom: Math.max(0, (rows.length - e) * rowH),
    };
  }, [shouldVirtualize, scrollTop, maxHeight, rowH, rows.length]);

  const slice = rows.slice(start, end);

  return (
    <div
      className={`overflow-auto rounded-md border border-grey-200 ${className}`}
      style={{ maxHeight }}
      ref={scrollerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-grey-50">
          <tr className="h-10">
            {columns.map((c) => (
              <th
                key={c.id}
                className={[
                  'px-3 text-overline uppercase text-grey-700',
                  c.numeric ? 'text-right' : 'text-left',
                ].join(' ')}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {padTop > 0 ? (
            <tr aria-hidden>
              <td colSpan={columns.length} style={{ height: padTop, padding: 0 }} />
            </tr>
          ) : null}
          {slice.map((row) => {
            const key = rowKey(row);
            const selected = selectedKeys?.has(key);
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={[
                  'border-b border-grey-200',
                  onRowClick ? 'cursor-pointer hover:bg-grey-25' : '',
                  selected ? 'bg-blue-50' : '',
                ].join(' ')}
                style={{ height: rowH }}
              >
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={[
                      'px-3 text-body text-grey-900',
                      c.numeric ? 'text-right tabular-nums text-numeric' : '',
                    ].join(' ')}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
          {padBottom > 0 ? (
            <tr aria-hidden>
              <td colSpan={columns.length} style={{ height: padBottom, padding: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
