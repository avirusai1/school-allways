import ExcelJS from 'exceljs';

import type { ImportEntity } from '../import.types';
import { fieldsForEntity } from '../import.util';

const EXAMPLES: Record<ImportEntity, Record<string, string>> = {
  students: {
    firstName: 'Aarav',
    lastName: 'Sharma',
    admissionNo: 'ADM-2025-0142',
    dateOfBirth: '15/08/2015',
    gender: 'male',
    className: 'V',
    sectionName: 'A',
    rollNo: '12',
    phone: '9876543210',
    guardianName: 'Rajesh Sharma',
  },
  staff: {
    firstName: 'Priya',
    lastName: 'Nair',
    employeeCode: 'EMP-042',
    dateOfBirth: '10/03/1990',
    gender: 'female',
    designation: 'Teacher',
    department: 'Science',
    workEmail: 'priya.nair@school.edu',
    phone: '9123456789',
    joinedOn: '01/06/2022',
  },
};

export async function buildImportTemplate(entity: ImportEntity): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(entity === 'staff' ? 'Staff' : 'Students');

  const fields = fieldsForEntity(entity);
  const headers = fields.map((f) => fieldToHeader(f));

  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.addRow(fields.map((f) => EXAMPLES[entity][f] ?? ''));

  ws.columns.forEach((col) => {
    col.width = 18;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function fieldToHeader(field: string): string {
  const map: Record<string, string> = {
    firstName: 'Student Name',
    lastName: 'Surname',
    admissionNo: 'Admission No',
    employeeCode: 'Employee Code',
    dateOfBirth: 'DOB',
    className: 'Class',
    sectionName: 'Section',
    rollNo: 'Roll No',
    phone: 'Mobile',
    guardianName: 'Father Name',
    designation: 'Designation',
    department: 'Department',
    workEmail: 'Work Email',
    joinedOn: 'Joining Date',
    gender: 'Gender',
  };
  return map[field] ?? field;
}

export async function buildErrorsWorkbook(
  failedRows: Array<Record<string, string>>,
  whatsWrong: string[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Errors');

  if (failedRows.length === 0) {
    ws.addRow(['No errors']);
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  const headers = [...Object.keys(failedRows[0]), "What's wrong"];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };

  failedRows.forEach((row, i) => {
    ws.addRow([...headers.slice(0, -1).map((h) => row[h] ?? ''), whatsWrong[i] ?? '']);
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
