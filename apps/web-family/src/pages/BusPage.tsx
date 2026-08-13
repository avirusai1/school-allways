import { EmptyState } from '@saw/ui';

export function BusPage() {
  return (
    <div>
      <h1 className="text-h1 text-grey-900">Bus</h1>
      <div className="mt-6">
        <EmptyState
          headline="Live tracking on the app"
          body="For battery-friendly live maps, open the School All Ways family app. Route info and ETAs sync there."
        />
      </div>
    </div>
  );
}
