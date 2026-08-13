import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  TextField,
} from '@saw/ui';

import {
  downloadGuardianCredentialsCsv,
  useBulkIssueGuardians,
  useBulkUpdateGuardianEmails,
  useInviteGuardiansById,
  usePendingGuardians,
  type IssuedGuardianAccount,
} from '../features/guardians/useGuardianAccounts';

export function GuardianAccountsPage() {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [issued, setIssued] = useState<IssuedGuardianAccount[] | null>(null);
  const [emailResult, setEmailResult] = useState<{
    updated: number;
    unmatched: string[];
    inviteReadyGuardianIds: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingQ = usePendingGuardians({ q });
  const bulkIssue = useBulkIssueGuardians();
  const emailUpload = useBulkUpdateGuardianEmails();
  const invite = useInviteGuardiansById();

  const guardians = useMemo(() => pendingQ.data?.data ?? [], [pendingQ.data?.data]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === guardians.length ? new Set() : new Set(guardians.map((g) => g.id)),
    );
  }

  async function generateCredentials(all = false) {
    setError(null);
    try {
      const body = all
        ? { all: true as const }
        : { ids: [...selected] };
      const res = await bulkIssue.mutateAsync(body);
      setIssued(res.issued);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate credentials.');
    }
  }

  async function downloadCsv() {
    setError(null);
    try {
      const body =
        selected.size > 0
          ? { ids: [...selected] }
          : { all: true as const };
      await downloadGuardianCredentialsCsv(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download CSV.');
    }
  }

  async function onEmailFile(file: File) {
    setError(null);
    try {
      const res = await emailUpload.mutateAsync(file);
      setEmailResult({
        updated: res.updated,
        unmatched: res.unmatched,
        inviteReadyGuardianIds: res.inviteReadyGuardianIds,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload emails.');
    }
  }

  async function sendInvites() {
    if (!emailResult?.inviteReadyGuardianIds.length) return;
    setError(null);
    try {
      await invite.mutateAsync(emailResult.inviteReadyGuardianIds);
      setEmailResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send invites.');
    }
  }

  if (pendingQ.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height={40} className="w-72" />
        <Skeleton height={240} />
      </div>
    );
  }

  if (pendingQ.isError) {
    return (
      <ErrorState
        message="Could not load guardians waiting for accounts."
        onRetry={() => void pendingQ.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-h1 text-grey-900">Guardian accounts</h1>
        <p className="mt-1 text-body-small text-grey-600">
          Generate front-desk login credentials for parents with a phone on file but no active
          account yet. Passwords are shown once — print or download before leaving this page.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-body-small text-red-800">
          {error}
        </p>
      ) : null}

      <Card className="p-4">
        <h2 className="text-h3 text-grey-900">Upload parent emails</h2>
        <p className="mt-1 text-body-small text-grey-600">
          Two columns: phone and email. Matches guardians by phone — does not send invites
          automatically.
        </p>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          className="mt-3 block text-body-small"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onEmailFile(file);
            e.target.value = '';
          }}
        />
        {emailResult ? (
          <div className="mt-3 flex flex-col gap-2 text-body-small text-grey-800">
            <p>
              Updated {emailResult.updated} guardian
              {emailResult.updated === 1 ? '' : 's'}.
              {emailResult.unmatched.length > 0
                ? ` ${emailResult.unmatched.length} phone number(s) did not match anyone.`
                : ''}
            </p>
            {emailResult.inviteReadyGuardianIds.length > 0 ? (
              <Button
                type="button"
                variant="secondary"
                disabled={invite.isPending}
                onClick={() => void sendInvites()}
              >
                Send email invites to {emailResult.inviteReadyGuardianIds.length} guardian
                {emailResult.inviteReadyGuardianIds.length === 1 ? '' : 's'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="Search by name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-w-[220px]"
        />
        {guardians.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={toggleAll}>
              {selected.size === guardians.length ? 'Clear selection' : 'Select all'}
            </Button>
            <Button
              type="button"
              disabled={selected.size === 0 || bulkIssue.isPending}
              onClick={() => void generateCredentials(false)}
            >
              Generate for selected ({selected.size})
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={bulkIssue.isPending}
              onClick={() => void generateCredentials(true)}
            >
              Generate for all eligible ({guardians.length})
            </Button>
            <Button type="button" variant="ghost" onClick={() => void downloadCsv()}>
              Download CSV
            </Button>
          </div>
        ) : null}
      </div>

      {issued ? (
        <Card className="p-4 print:block">
          <p className="mb-3 font-medium text-amber-800">
            Print this now — temporary passwords cannot be retrieved again.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-small">
              <thead>
                <tr className="border-b border-grey-200 text-grey-600">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Class</th>
                  <th className="py-2">Temporary password</th>
                </tr>
              </thead>
              <tbody>
                {issued.map((row) => (
                  <tr key={row.id} className="border-b border-grey-100">
                    <td className="py-2 pr-4">{row.fullName}</td>
                    <td className="py-2 pr-4 font-mono">{row.phone}</td>
                    <td className="py-2 pr-4">{row.sectionLabel ?? '—'}</td>
                    <td className="py-2 font-mono">{row.temporaryPassword}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex gap-2 print:hidden">
            <Button type="button" onClick={() => window.print()}>
              Print
            </Button>
            <Button type="button" variant="ghost" onClick={() => setIssued(null)}>
              Dismiss
            </Button>
          </div>
        </Card>
      ) : null}

      {guardians.length === 0 ? (
        <EmptyState
          headline="No guardians waiting for credentials"
          body="Everyone with a phone on file may already have an active account, or there are no enrolled students yet."
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-body-small">
            <thead className="bg-grey-50 text-grey-600">
              <tr>
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2">Parent</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2">Email on file</th>
              </tr>
            </thead>
            <tbody>
              {guardians.map((g) => (
                <tr key={g.id} className="border-t border-grey-100">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(g.id)}
                      onChange={() => toggle(g.id)}
                      aria-label={`Select ${g.fullName}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-grey-900">{g.fullName}</td>
                  <td className="px-3 py-2 font-mono">{g.phone}</td>
                  <td className="px-3 py-2">{g.sectionLabel || '—'}</td>
                  <td className="px-3 py-2">{g.hasEmail ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
