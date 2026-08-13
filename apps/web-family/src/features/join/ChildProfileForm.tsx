import { useState } from 'react';
import { Button, Select, TextField } from '@saw/ui';

import { apiFetch, apiUpload, ApiError } from '../../lib/api';
import type { JoinStudent } from '../../lib/auth';

const BLOOD_GROUPS = [
  { value: 'a_pos', label: 'A+' },
  { value: 'a_neg', label: 'A−' },
  { value: 'b_pos', label: 'B+' },
  { value: 'b_neg', label: 'B−' },
  { value: 'ab_pos', label: 'AB+' },
  { value: 'ab_neg', label: 'AB−' },
  { value: 'o_pos', label: 'O+' },
  { value: 'o_neg', label: 'O−' },
];

type Draft = {
  addressLine1: string;
  city: string;
  pincode: string;
  dateOfBirth: string;
  bloodGroup: string;
  photoPath: string | null;
  photoPreview: string | null;
  docType: string;
  documentName: string | null;
};

const emptyDraft: Draft = {
  addressLine1: '',
  city: '',
  pincode: '',
  dateOfBirth: '',
  bloodGroup: '',
  photoPath: null,
  photoPreview: null,
  docType: '',
  documentName: null,
};

/**
 * The self-fill step the invitation promised. It renders only the fields the
 * school's import left blank on each child, so a parent whose school already
 * uploaded addresses sees a photo picker and nothing else.
 *
 * This is a parent standing in a corridor on a phone, not an admin at a desk:
 * everything here is skippable, and skipping still lands them in the app.
 */
export function ChildProfileForm({
  students,
  onDone,
}: {
  students: JoinStudent[];
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const student = students[index];
  if (!student) return null;

  const draft = drafts[student.id] ?? emptyDraft;
  const missing = new Set(student.missingFields);
  const isLast = index === students.length - 1;

  function patch(next: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [student!.id]: { ...draft, ...next } }));
  }

  async function onPickPhoto(file: File) {
    setError(null);
    // Shown immediately from the local file rather than waiting for the
    // round-trip — on a school-gate connection that wait is long enough to
    // look broken.
    patch({ photoPreview: URL.createObjectURL(file) });
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await apiFetch<{ photoPath: string }>(
        `/family/children/${student!.id}/photo`,
        { method: 'POST', body: form },
      );
      patch({ photoPath: res.photoPath, photoPreview: URL.createObjectURL(file) });
    } catch (err) {
      patch({ photoPreview: null });
      setError(err instanceof ApiError ? err.message : 'Could not upload that photo.');
    }
  }

  async function onPickDocument(file: File) {
    if (!draft.docType.trim()) {
      setError('Enter what kind of document this is first.');
      return;
    }
    setError(null);
    const form = new FormData();
    form.append('file', file);
    form.append('docType', draft.docType.trim());
    if (draft.documentName) form.append('title', draft.documentName);
    try {
      await apiUpload(`/family/children/${student!.id}/document`, form);
      patch({ documentName: file.name });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload that document.');
    }
  }

  async function onSave() {
    setBusy(true);
    setError(null);

    const body: Record<string, string> = {};
    if (draft.addressLine1.trim()) body.addressLine1 = draft.addressLine1.trim();
    if (draft.city.trim()) body.city = draft.city.trim();
    if (draft.pincode.trim()) body.pincode = draft.pincode.trim();
    if (draft.dateOfBirth) body.dateOfBirth = draft.dateOfBirth;
    if (draft.bloodGroup) body.bloodGroup = draft.bloodGroup;
    if (draft.photoPath) body.photoPath = draft.photoPath;

    try {
      // Nothing typed is not an error — it is the parent choosing to skip.
      if (Object.keys(body).length > 0) {
        await apiFetch(`/family/children/${student!.id}/profile`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      }
      if (isLast) onDone();
      else setIndex((i) => i + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save those details.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-overline text-grey-600">
        {students.length > 1 ? `${index + 1} of ${students.length}` : 'ALMOST DONE'}
      </p>
      <h1 className="mt-1 text-h1 text-grey-900">Complete {student.name}&apos;s details</h1>
      <p className="mt-2 text-body-small text-grey-600">
        Your school has the rest. You can skip anything and add it later.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {missing.has('photo') && (
          <div>
            <p className="text-label text-grey-700">Photo</p>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-grey-200 bg-grey-50">
                {draft.photoPreview ? (
                  <img src={draft.photoPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-caption text-grey-400">None</span>
                )}
              </div>
              <label className="cursor-pointer text-body-small text-blue-600">
                Choose photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onPickPhoto(f);
                  }}
                />
              </label>
            </div>
          </div>
        )}

        {missing.has('address') && (
          <>
            <TextField
              label="Home address"
              value={draft.addressLine1}
              onChange={(e) => patch({ addressLine1: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="City"
                value={draft.city}
                onChange={(e) => patch({ city: e.target.value })}
              />
              <TextField
                label="Pincode"
                inputMode="numeric"
                value={draft.pincode}
                onChange={(e) => patch({ pincode: e.target.value })}
              />
            </div>
          </>
        )}

        {missing.has('dateOfBirth') && (
          <TextField
            label="Date of birth"
            type="date"
            value={draft.dateOfBirth}
            onChange={(e) => patch({ dateOfBirth: e.target.value })}
          />
        )}

        {missing.has('bloodGroup') && (
          <Select
            label="Blood group"
            value={draft.bloodGroup}
            onChange={(e) => patch({ bloodGroup: e.target.value })}
            options={[{ value: '', label: 'Not sure' }, ...BLOOD_GROUPS]}
          />
        )}

        <div>
          <TextField
            label="Document type"
            placeholder="e.g. Birth certificate, Aadhaar, transfer certificate"
            value={draft.docType}
            onChange={(e) => patch({ docType: e.target.value })}
          />
          <div className="mt-2">
            <label className="cursor-pointer text-body-small text-blue-600">
              {draft.documentName ? `Uploaded: ${draft.documentName}` : 'Upload a document'}
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickDocument(f);
                }}
              />
            </label>
            <p className="mt-1 text-caption text-grey-500">Optional — your school may ask for ID proof.</p>
          </div>
        </div>

        {error && <p className="text-body-small text-red-700">{error}</p>}

        <Button loading={busy} expanded onClick={() => void onSave()}>
          {isLast ? 'Save and continue' : 'Save and next child'}
        </Button>
        <button
          type="button"
          className="text-body-small text-grey-600 underline"
          onClick={() => (isLast ? onDone() : setIndex((i) => i + 1))}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
