import { publicFileUrl } from '../../../common/utils/url.util';

/** Parent-reachable staff summary — personalPhone is deliberately absent. */
export class StaffListItemDto {
  id!: string;
  employeeCode!: string;
  fullName!: string;
  designation!: string | null;
  photoUrl!: string | null;
  workPhone!: string | null;
  workEmail!: string | null;
  isTeaching!: boolean;
  status!: string;
}

export interface StaffRow {
  id: string;
  employeeCode: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  designation: string | null;
  photoPath: string | null;
  workPhone: string | null;
  workEmail: string | null;
  personalPhone: string | null;
  isTeaching: boolean;
  status: string;
}

export function toStaffListItem(row: StaffRow, filesBaseUrl: string): StaffListItemDto {
  return {
    id: row.id,
    employeeCode: row.employeeCode,
    fullName: [row.firstName, row.middleName, row.lastName].filter(Boolean).join(' '),
    designation: row.designation,
    photoUrl: publicFileUrl(filesBaseUrl, row.photoPath),
    workPhone: row.workPhone,
    workEmail: row.workEmail,
    isTeaching: row.isTeaching,
    status: row.status,
  };
}
