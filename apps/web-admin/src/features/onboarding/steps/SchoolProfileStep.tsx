import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Select, TextField } from '@saw/ui';
import {
  useOnboardingActions,
  type OnboardingProfile,
} from '../useOnboardingState';

export type SchoolProfileStepHandle = {
  save: () => Promise<{ data: Record<string, unknown>; itemCount: number }>;
};

type Props = {
  profile: OnboardingProfile;
};

const BOARD_OPTIONS = [
  { value: 'cbse', label: 'CBSE' },
  { value: 'icse', label: 'ICSE' },
  { value: 'state_other', label: 'State' },
  { value: 'other', label: 'Other' },
];

export const SchoolProfileStep = forwardRef<SchoolProfileStepHandle, Props>(
  function SchoolProfileStep({ profile }, ref) {
    const { uploadLogo } = useOnboardingActions();
    const [name, setName] = useState(profile.name ?? '');
    const [board, setBoard] = useState(profile.board ?? 'cbse');
    const [affiliationNo, setAffiliationNo] = useState(profile.affiliationNo ?? '');
    const [udiseCode, setUdiseCode] = useState(profile.udiseCode ?? '');
    const [address, setAddress] = useState(profile.address ?? '');
    const [city, setCity] = useState(profile.city ?? '');
    const [state, setState] = useState(profile.state ?? '');
    const [pincode, setPincode] = useState(profile.pincode ?? '');
    const [phone, setPhone] = useState(profile.phone ?? '');
    const [email, setEmail] = useState(profile.email ?? '');
    const [logoUrl, setLogoUrl] = useState(profile.logoUrl);
    const [logoPath, setLogoPath] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      setName(profile.name ?? '');
      setBoard(profile.board ?? 'cbse');
      setAffiliationNo(profile.affiliationNo ?? '');
      setUdiseCode(profile.udiseCode ?? '');
      setAddress(profile.address ?? '');
      setCity(profile.city ?? '');
      setState(profile.state ?? '');
      setPincode(profile.pincode ?? '');
      setPhone(profile.phone ?? '');
      setEmail(profile.email ?? '');
      setLogoUrl(profile.logoUrl);
    }, [profile]);

    useImperativeHandle(ref, () => ({
      save: async () => {
        if (!name.trim()) throw new Error('School name is required.');
        return {
          itemCount: 1,
          data: {
            name: name.trim(),
            board,
            affiliationNo: affiliationNo.trim(),
            udiseCode: udiseCode.trim(),
            address: address.trim(),
            city: city.trim(),
            state: state.trim(),
            pincode: pincode.trim(),
            phone: phone.trim(),
            email: email.trim(),
            ...(logoPath ? { logoPath } : {}),
          },
        };
      },
    }));

    return (
      <div className="flex flex-col gap-4">
        <TextField
          label="School name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Select
          label="Board"
          options={BOARD_OPTIONS}
          value={board}
          onChange={(e) => setBoard(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Affiliation number"
            value={affiliationNo}
            onChange={(e) => setAffiliationNo(e.target.value)}
          />
          <TextField
            label="UDISE code"
            value={udiseCode}
            onChange={(e) => setUdiseCode(e.target.value)}
            maxLength={11}
          />
        </div>
        <TextField
          label="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} />
          <TextField label="State" value={state} onChange={(e) => setState(e.target.value)} />
          <TextField
            label="Pincode"
            value={pincode}
            onChange={(e) => setPincode(e.target.value)}
            maxLength={6}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <p className="mb-1.5 text-label text-grey-700">Logo</p>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-grey-200 bg-grey-50">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-caption text-grey-400">No logo</span>
              )}
            </div>
            <label className="cursor-pointer text-body-small font-medium text-blue-600 hover:underline">
              {uploadLogo.isPending ? 'Uploading…' : 'Upload logo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setError(null);
                  try {
                    // Preview immediately — don't wait for step save.
                    setLogoUrl(URL.createObjectURL(file));
                    const res = await uploadLogo.mutateAsync(file);
                    setLogoPath(res.logoPath);
                    if (res.logoUrl) setLogoUrl(res.logoUrl);
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : 'Could not upload logo.',
                    );
                  }
                }}
              />
            </label>
          </div>
          {error ? (
            <p className="mt-2 text-body-small text-red-700">{error}</p>
          ) : null}
        </div>
      </div>
    );
  },
);
