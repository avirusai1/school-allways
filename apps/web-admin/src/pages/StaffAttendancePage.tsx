import { useState } from 'react';
import { EmptyState } from '@saw/ui';

import { StaffAttendanceMarker } from '../features/staff-attendance/StaffAttendanceMarker';
import { todayIso } from '../features/staff-attendance/useStaffAttendance';
import { useAuth } from '../lib/auth';

/**
 * The staff register. Unlike the student one there is no section to choose and
 * no academic session to depend on — staff are employed by a branch, not
 * enrolled in a year — so the only control is the date.
 */
export function StaffAttendancePage() {
  const { session } = useAuth();
  const branchId = session?.branch?.id;
  const [day, setDay] = useState(todayIso());

  if (!branchId) {
    return (
      <EmptyState
        headline="No branch selected"
        body="Choose a branch in your session before marking staff attendance."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 text-grey-900">Staff attendance</h1>
          <p className="mt-1 text-body-small text-grey-600">
            {new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-body-small text-grey-700">Date</span>
          <input
            type="date"
            value={day}
            max={todayIso()}
            onChange={(e) => setDay(e.target.value || todayIso())}
            className="h-10 rounded-sm border border-grey-300 px-3 text-body text-grey-900 focus:border-blue-500 focus:outline-none"
          />
        </label>
      </div>

      <StaffAttendanceMarker key={day} branchId={branchId} day={day} />
    </div>
  );
}
