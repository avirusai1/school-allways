import { useState } from 'react';
import type { FamilyChild } from '../lib/use-selected-child';

type Props = {
  children: FamilyChild[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

/** Compact child chip + sheet (build/13 §4). One tap from home (and shared pages). */
export function ChildSwitcher({ children, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const selected = children.find((c) => c.id === selectedId) ?? children[0];

  if (children.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-full items-center gap-2 rounded-md border border-grey-200 bg-grey-0 px-3 py-2 text-left transition-colors hover:border-grey-300 hover:bg-grey-25"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-blue-50 text-[12px] font-semibold text-blue-700">
          {(selected?.firstName ?? selected?.fullName ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-grey-900">
            {selected?.fullName ?? 'Child'}
            {children.length > 1 ? ' ▾' : ''}
          </span>
          {selected?.classLabel ? (
            <span className="block truncate text-[11px] text-grey-500">{selected.classLabel}</span>
          ) : null}
        </span>
      </button>

      {open && children.length > 1 ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default bg-transparent"
            aria-label="Close child switcher"
            onClick={() => setOpen(false)}
          />
          <ul
            role="listbox"
            className="absolute left-0 top-full z-40 mt-1 min-w-[220px] overflow-hidden rounded-md border border-grey-200 bg-grey-0 shadow-md"
          >
            {children.map((c) => {
              const active = c.id === selectedId;
              return (
                <li key={c.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    className={[
                      'flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px]',
                      active ? 'bg-blue-50 text-blue-700' : 'text-grey-800 hover:bg-grey-50',
                    ].join(' ')}
                    onClick={() => {
                      onSelect(c.id);
                      setOpen(false);
                    }}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-blue-50 text-[12px] font-semibold text-blue-700">
                      {c.firstName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.fullName}</span>
                      {c.classLabel ? (
                        <span className="block truncate text-[11px] text-grey-500">{c.classLabel}</span>
                      ) : null}
                    </span>
                    {active ? <span className="text-blue-700">✓</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
