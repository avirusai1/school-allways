export type ImportEntity = 'students' | 'staff';
export type ImportVendor = 'generic' | 'entab' | 'teachmint' | 'myclassboard';

export type WizardPhase =
  | 'upload'
  | 'mapping'
  | 'validation'
  | 'progress'
  | 'result';

export type SuggestedMapping = Record<string, { field: string; confidence: number }>;

export type ColumnMapping = Record<string, string>;

export interface UploadResponse {
  importId: string;
  detectedColumns: string[];
  suggestedMapping: SuggestedMapping;
  vendor: string;
}

export interface ValidationErrorItem {
  row: number;
  column: string;
  value: string;
  message: string;
}

export interface ValidationResult {
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: ValidationErrorItem[];
  warnings: Array<{ row: number; message: string }>;
}

export interface ImportStatus {
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  committedRows: number;
  progressPct: number;
  jobId?: string;
}

export interface ImportBatchListItem {
  id: string;
  entity: ImportEntity;
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  committedRows: number;
  createdAt: string;
  committedAt: string | null;
}

export const STUDENT_FIELD_OPTIONS = [
  { value: 'firstName', label: 'First name / student name' },
  { value: 'lastName', label: 'Last name' },
  { value: 'admissionNo', label: 'Admission number' },
  { value: 'dateOfBirth', label: 'Date of birth' },
  { value: 'phone', label: 'Guardian phone' },
  { value: 'className', label: 'Class' },
  { value: 'sectionName', label: 'Section' },
  { value: 'skip', label: "Don't import" },
] as const;

export const STAFF_FIELD_OPTIONS = [
  { value: 'firstName', label: 'First name' },
  { value: 'lastName', label: 'Last name' },
  { value: 'employeeCode', label: 'Employee code' },
  { value: 'phone', label: 'Phone' },
  { value: 'workEmail', label: 'Work email' },
  { value: 'designation', label: 'Designation' },
  { value: 'skip', label: "Don't import" },
] as const;

export const REQUIRED_STUDENT_FIELDS = ['firstName', 'admissionNo'] as const;
export const REQUIRED_STAFF_FIELDS = ['firstName', 'employeeCode'] as const;

export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

export function undoStillAvailable(committedAt: string | null | undefined): boolean {
  if (!committedAt) return false;
  const t = new Date(committedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < UNDO_WINDOW_MS;
}
