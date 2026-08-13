import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Select, TextField } from '@saw/ui';
import {
  pickCurrentSession,
  useSessions,
} from '../../academic/useAcademic';

export type AcademicSessionStepHandle = {
  save: () => Promise<{ data: Record<string, unknown>; itemCount: number }>;
};

type Props = { branchId: string };

function defaultSessionName(): string {
  const y = new Date().getFullYear();
  // Indian academic year typically starts April — before April use prior label.
  const start = new Date().getMonth() < 3 ? y - 1 : y;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function defaultDates() {
  const y = new Date().getFullYear();
  const startYear = new Date().getMonth() < 3 ? y - 1 : y;
  return {
    startDate: `${startYear}-04-01`,
    endDate: `${startYear + 1}-03-31`,
  };
}

const TERM_OPTIONS = [
  { value: '2_terms', label: '2 terms' },
  { value: '3_terms', label: '3 terms' },
  { value: '4_quarters', label: '4 quarters' },
];

export const AcademicSessionStep = forwardRef<AcademicSessionStepHandle, Props>(
  function AcademicSessionStep({ branchId }, ref) {
    const sessionsQ = useSessions(branchId);
    const current = pickCurrentSession(sessionsQ.data);
    const defaults = defaultDates();
    const [name, setName] = useState(defaultSessionName());
    const [startDate, setStartDate] = useState(defaults.startDate);
    const [endDate, setEndDate] = useState(defaults.endDate);
    const [termStructure, setTermStructure] = useState('2_terms');
    const [addNationalHolidays, setAddNationalHolidays] = useState(false);

    useEffect(() => {
      if (!current) return;
      setName(current.name);
      setStartDate(current.startDate);
      setEndDate(current.endDate);
    }, [current]);

    useImperativeHandle(ref, () => ({
      save: async () => {
        if (!name.trim() || !startDate || !endDate) {
          throw new Error('Session name and dates are required.');
        }
        return {
          itemCount: 1,
          data: {
            name: name.trim(),
            startDate,
            endDate,
            termStructure,
            addNationalHolidays,
          },
        };
      },
    }));

    return (
      <div className="flex flex-col gap-4">
        <TextField
          label="Session name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          hint="Example: 2026-27"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <TextField
            label="End date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <Select
          label="Term structure"
          options={TERM_OPTIONS}
          value={termStructure}
          onChange={(e) => setTermStructure(e.target.value)}
        />
        <label className="flex items-start gap-3 rounded-sm border border-grey-200 px-3 py-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={addNationalHolidays}
            onChange={(e) => setAddNationalHolidays(e.target.checked)}
          />
          <span>
            <span className="block text-body font-medium text-grey-900">
              Add national holidays
            </span>
            <span className="text-body-small text-grey-600">
              Prefills calendar days (Republic Day, Independence Day, Gandhi
              Jayanti, and a few fixed dates) for this session.
            </span>
          </span>
        </label>
      </div>
    );
  },
);
