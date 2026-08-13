export type ImportEntity = 'students' | 'staff';
export type ImportVendor = 'generic' | 'entab' | 'teachmint' | 'myclassboard';
export type ColumnMappingValue = string | 'skip';
export type ColumnMapping = Record<string, ColumnMappingValue>;

export interface SuggestedMapping {
  field: string;
  confidence: number;
}

export interface RawImportRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface MappedImportRow {
  rowNumber: number;
  fields: Record<string, string | null>;
}

export interface ValidationErrorItem {
  row: number;
  column: string;
  value: string;
  message: string;
}

export interface ValidationWarningItem {
  row: number;
  message: string;
}

export interface ValidationResult {
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: ValidationErrorItem[];
  warnings: ValidationWarningItem[];
  /** Row numbers (spreadsheet line) that failed validation. */
  errorRowNumbers: number[];
}

export interface ImportStatusResponse {
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  committedRows: number;
  progressPct: number;
  jobId?: string;
}

export interface ImportCommitJob {
  tenantId: string;
  userId: string | null;
  importId: string;
  partialCommit: boolean;
}
