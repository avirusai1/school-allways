import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  applyTenantBrand,
  Brand,
  Button,
  Card,
  ErrorState,
  SectionHeader,
  TextField,
} from '@saw/ui';
import { apiFetch, apiUpload } from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * White-label branding — logo and accent color, changeable any time by a
 * school admin. Every school gets its own copy of this screen; nothing here
 * is platform-wide. `tenant.branding` endpoints exist server-side only for
 * `tenant.settings.manage`, so this is the only place they're called from.
 */
export function SettingsPage() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [colorDraft, setColorDraft] = useState(session?.tenant.primaryColor ?? '#1B5E9C');
  const [previewing, setPreviewing] = useState(false);

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiUpload<{ logoUrl: string | null }>('/tenant/branding/logo', form);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['session'] }),
  });

  const removeLogo = useMutation({
    mutationFn: () => apiFetch('/tenant/branding/logo', { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['session'] }),
  });

  const saveColor = useMutation({
    mutationFn: (primaryColor: string | null) =>
      apiFetch('/tenant/branding/color', {
        method: 'POST',
        body: JSON.stringify({ primaryColor }),
      }),
    onSuccess: () => {
      setPreviewing(false);
      void qc.invalidateQueries({ queryKey: ['session'] });
    },
  });

  const previewColor = (hex: string) => {
    setColorDraft(hex);
    setPreviewing(true);
    applyTenantBrand(hex);
  };

  const cancelPreview = () => {
    setPreviewing(false);
    setColorDraft(session?.tenant.primaryColor ?? '#1B5E9C');
    applyTenantBrand(session?.tenant.primaryColor);
  };

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-h1 text-grey-900">Settings</h1>
        <p className="mt-1 text-body-small text-grey-600">{session?.tenant.name}</p>
      </div>

      <section>
        <SectionHeader
          title="Branding"
          overline="WHITE-LABEL"
        />
        <p className="mb-4 text-body-small text-grey-600">
          Replace "School All Ways" with your own logo and colors across the admin
          console, the parent app, and the school apps — only for your school.
          Other schools on the platform are never affected.
        </p>

        <Card>
          <div className="flex flex-col gap-6">
            <div>
              <div className="mb-2 text-label text-grey-700">Logo</div>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-grey-200 bg-grey-25 p-2">
                  <Brand logoUrl={session?.tenant.logoUrl} name={session?.tenant.name} />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button
                      size="compact"
                      variant="outline"
                      onClick={() => fileInput.current?.click()}
                      disabled={uploadLogo.isPending}
                    >
                      {uploadLogo.isPending ? 'Uploading…' : 'Upload logo'}
                    </Button>
                    {session?.tenant.logoUrl && (
                      <Button
                        size="compact"
                        variant="ghost"
                        onClick={() => removeLogo.mutate()}
                        disabled={removeLogo.isPending}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-body-small text-grey-500">PNG or JPG, up to 2 MB.</p>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadLogo.mutate(file);
                    e.target.value = '';
                  }}
                />
              </div>
              {uploadLogo.isError && (
                <ErrorState
                  message={
                    uploadLogo.error instanceof Error
                      ? uploadLogo.error.message
                      : 'Could not upload the logo'
                  }
                  onRetry={() => fileInput.current?.click()}
                />
              )}
            </div>

            <div>
              <div className="mb-2 text-label text-grey-700">Accent color</div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={colorDraft}
                  onChange={(e) => previewColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-sm border border-grey-300 bg-transparent p-1"
                  aria-label="Accent color"
                />
                <TextField
                  label="Hex value"
                  value={colorDraft}
                  onChange={(e) => previewColor(e.target.value)}
                  className="w-36"
                />
                {previewing && (
                  <>
                    <Button
                      size="compact"
                      onClick={() => saveColor.mutate(colorDraft)}
                      disabled={saveColor.isPending}
                    >
                      {saveColor.isPending ? 'Saving…' : 'Save'}
                    </Button>
                    <Button size="compact" variant="ghost" onClick={cancelPreview}>
                      Cancel
                    </Button>
                  </>
                )}
              </div>
              <p className="mt-2 text-body-small text-grey-500">
                Previewed live across this screen before you save — nobody else sees it
                until you do.
              </p>
              {saveColor.isError && (
                <ErrorState
                  message={
                    saveColor.error instanceof Error
                      ? saveColor.error.message
                      : 'Could not save the color'
                  }
                  onRetry={() => saveColor.mutate(colorDraft)}
                />
              )}
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
