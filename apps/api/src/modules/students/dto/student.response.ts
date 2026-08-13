import { maskPhone } from '../../../common/utils/phone.util';
import { publicFileUrl } from '../../../common/utils/url.util';

export class StudentListItemDto {
  id!: string;
  admissionNo!: string;
  fullName!: string;
  rollNo!: string | null;
  className!: string | null;
  sectionName!: string | null;
  photoUrl!: string | null;
  gender!: string | null;
  isRteStudent!: boolean;
  attendancePercentageBp!: number | null;
  status!: string;
}

export class GuardianSummaryDto {
  id!: string;
  fullName!: string;
  relation!: string;
  isPrimary!: boolean;
  phone!: string | null;
  canPayFees!: boolean;
  canPickup!: boolean;
}

export class StudentDetailDto extends StudentListItemDto {
  firstName!: string;
  middleName!: string | null;
  lastName!: string | null;
  dateOfBirth!: string | null;
  bloodGroup!: string | null;
  socialCategory!: string | null;
  address!: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    district: string | null;
    state: string | null;
    pincode: string | null;
  };
  apaar!: { id: string | null; status: string; generatedAt: string | null };
  guardians!: GuardianSummaryDto[];
}

export interface StudentListRow {
  id: string;
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  photoPath: string | null;
  gender: string | null;
  isRteStudent: boolean;
  rollNo: string | null;
  status: string;
  sectionName: string | null;
  className: string | null;
  attendancePercentageBp: number | null;
}

export function toListItem(row: StudentListRow, filesBaseUrl: string): StudentListItemDto {
  return {
    id: row.id,
    admissionNo: row.admissionNo,
    fullName: [row.firstName, row.middleName, row.lastName].filter(Boolean).join(' '),
    rollNo: row.rollNo,
    className: row.className,
    sectionName: row.sectionName,
    photoUrl: publicFileUrl(filesBaseUrl, row.photoPath),
    gender: row.gender,
    isRteStudent: row.isRteStudent,
    attendancePercentageBp: row.attendancePercentageBp,
    status: row.status,
  };
}

export { maskPhone };
