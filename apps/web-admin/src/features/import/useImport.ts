import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDownloadBlob, apiFetch, apiUpload } from '../../lib/api';
import type {
  ColumnMapping,
  ImportBatchListItem,
  ImportEntity,
  ImportStatus,
  ImportVendor,
  UploadResponse,
  ValidationResult,
} from './import.types';

export function useImportBatches(branchId: string | undefined) {
  return useQuery({
    queryKey: ['imports', branchId],
    enabled: Boolean(branchId),
    queryFn: () =>
      apiFetch<ImportBatchListItem[]>(
        `/import?branchId=${encodeURIComponent(branchId!)}`,
      ),
    staleTime: 30_000,
  });
}

export function useImportStatus(importId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['import-status', importId],
    enabled: Boolean(importId) && enabled,
    queryFn: () => apiFetch<ImportStatus>(`/import/${importId}/status`),
    refetchInterval: (q) => {
      if (typeof document !== 'undefined' && document.hidden) return false;
      const status = q.state.data?.status;
      if (!status) return 1500;
      if (status === 'committed' || status === 'failed' || status === 'undone') return false;
      return 1500;
    },
  });
}

export function useImportActions(branchId: string | undefined) {
  const qc = useQueryClient();

  const upload = useMutation({
    mutationFn: async (params: {
      file: File;
      entity: ImportEntity;
      vendor: ImportVendor;
    }) => {
      if (!branchId) throw new Error('No branch selected');
      const form = new FormData();
      form.append('file', params.file);
      form.append('branchId', branchId);
      form.append('entity', params.entity);
      form.append('vendor', params.vendor);
      return apiUpload<UploadResponse>('/import/upload', form);
    },
  });

  const mapColumns = useMutation({
    mutationFn: (params: {
      importId: string;
      mapping: ColumnMapping;
      vendor?: ImportVendor;
    }) =>
      apiFetch<{ importId: string; mapping: ColumnMapping }>(
        `/import/${params.importId}/map`,
        {
          method: 'POST',
          body: JSON.stringify({
            mapping: params.mapping,
            vendor: params.vendor,
          }),
        },
      ),
  });

  const validate = useMutation({
    mutationFn: (importId: string) =>
      apiFetch<ValidationResult>(`/import/${importId}/validate`, {
        method: 'POST',
      }),
  });

  const commit = useMutation({
    mutationFn: (params: { importId: string; partialCommit?: boolean }) =>
      apiFetch<{ jobId: string; importId: string }>(
        `/import/${params.importId}/commit`,
        {
          method: 'POST',
          body: JSON.stringify({
            partialCommit: params.partialCommit ?? true,
          }),
        },
      ),
  });

  const undo = useMutation({
    mutationFn: (importId: string) =>
      apiFetch<{ undone: boolean }>(`/import/${importId}/undo`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['imports', branchId] });
    },
  });

  return { upload, mapColumns, validate, commit, undo };
}

export async function downloadTemplate(entity: ImportEntity): Promise<void> {
  const blob = await apiDownloadBlob(`/import/template?entity=${entity}`);
  triggerDownload(blob, `${entity}-import-template.xlsx`);
}

export async function downloadErrorRows(importId: string): Promise<void> {
  const blob = await apiDownloadBlob(`/import/${importId}/errors.xlsx`);
  triggerDownload(blob, `import-errors-${importId.slice(0, 8)}.xlsx`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
