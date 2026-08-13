import { describe, expect, it } from 'vitest';

import {
  FEE_STATUS_FORBIDDEN_KEYS,
  toFeeInvoiceDto,
  toFeeStatusDto,
} from './fee-dtos';

describe('FeeStatusDto vs FeeInvoiceDto', () => {
  it('FeeStatusDto contains no payment or invoice-detail fields', () => {
    const status = toFeeStatusDto({
      studentId: 'st-1',
      status: 'overdue',
      balancePaise: 125_050,
      ageingBucket: 30,
    });

    expect(Object.keys(status).sort()).toEqual(
      ['ageingBucket', 'amountDuePaise', 'status', 'studentId'].sort(),
    );

    for (const key of FEE_STATUS_FORBIDDEN_KEYS) {
      expect(status).not.toHaveProperty(key);
    }

    // Explicit: no nested payment detail either
    expect(JSON.stringify(status)).not.toMatch(/gateway|receipt|payment|line/i);
  });

  it('FeeInvoiceDto carries lines and payments for accounts', () => {
    const full = toFeeInvoiceDto({
      invoice: {
        id: 'inv-1',
        studentId: 'st-1',
        invoiceNo: 'INV-2026-0001',
        issueDate: '2026-04-01',
        dueDate: '2026-04-15',
        status: 'partially_paid',
        grossAmountPaise: 200_000,
        concessionAmountPaise: 20_000,
        lateFeePaise: 0,
        netAmountPaise: 180_000,
        paidAmountPaise: 50_000,
        balancePaise: 130_000,
        ageingBucket: 0,
      },
      lines: [
        {
          id: 'ln-1',
          feeHeadId: 'h1',
          description: 'Tuition',
          grossAmountPaise: 200_000,
          concessionAmountPaise: 20_000,
          netAmountPaise: 180_000,
          paidAmountPaise: 50_000,
          appliedConcessionIds: ['sib'],
        },
      ],
      payments: [
        {
          id: 'pay-1',
          receiptNo: 'R-1',
          paymentDate: '2026-04-10',
          amountPaise: 50_000,
          mode: 'upi',
          status: 'success',
          referenceNo: 'UTR123',
          gatewayPaymentId: 'pay_abc',
        },
      ],
    });

    expect(full.lines).toHaveLength(1);
    expect(full.payments[0]?.gatewayPaymentId).toBe('pay_abc');
    expect(full.balancePaise).toBe(130_000);
  });
});
