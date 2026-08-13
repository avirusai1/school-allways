import { describe, expect, it } from 'vitest';

import { toStaffListItem } from './staff.response';

describe('StaffListItemDto', () => {
  it('never exposes personalPhone in parent-reachable responses', () => {
    const dto = toStaffListItem(
      {
        id: 'staff-1',
        employeeCode: 'T-001',
        firstName: 'Priya',
        middleName: null,
        lastName: 'Menon',
        designation: 'Maths Teacher',
        photoPath: null,
        workPhone: '911234567890',
        workEmail: 'priya@school.edu.in',
        personalPhone: '919876543210',
        isTeaching: true,
        status: 'active',
      },
      'https://files.example.com',
    );

    expect(dto).not.toHaveProperty('personalPhone');
    expect(JSON.stringify(dto)).not.toContain('919876543210');
    expect(dto.workPhone).toBe('911234567890');
  });
});
