/**
 * Two fee DTOs — never merge, never filter one at the controller.
 * Teachers get FeeStatusDto (fee.status.read). Accounts get FeeInvoiceDto.
 */

export class FeeStatusDto {
  studentId!: string;
  status!: string;
  amountDuePaise!: number;
  ageingBucket!: number;
}

export class FeeInvoiceLineDto {
  id!: string;
  feeHeadId!: string;
  description!: string | null;
  grossAmountPaise!: number;
  concessionAmountPaise!: number;
  netAmountPaise!: number;
  paidAmountPaise!: number;
  appliedConcessionIds!: string[];
}

export class FeePaymentSummaryDto {
  id!: string;
  receiptNo!: string | null;
  paymentDate!: string;
  amountPaise!: number;
  mode!: string;
  status!: string;
  referenceNo!: string | null;
  gatewayPaymentId!: string | null;
}

export class FeeInvoiceDto {
  id!: string;
  studentId!: string;
  invoiceNo!: string;
  issueDate!: string;
  dueDate!: string;
  status!: string;
  grossAmountPaise!: number;
  concessionAmountPaise!: number;
  lateFeePaise!: number;
  netAmountPaise!: number;
  paidAmountPaise!: number;
  balancePaise!: number;
  ageingBucket!: number;
  lines!: FeeInvoiceLineDto[];
  payments!: FeePaymentSummaryDto[];
}

export function toFeeStatusDto(row: {
  studentId: string;
  status: string;
  balancePaise: number;
  ageingBucket: number | null;
}): FeeStatusDto {
  return {
    studentId: row.studentId,
    status: row.status,
    amountDuePaise: row.balancePaise,
    ageingBucket: row.ageingBucket ?? 0,
  };
}

export function toFeeInvoiceDto(input: {
  invoice: {
    id: string;
    studentId: string;
    invoiceNo: string;
    issueDate: string;
    dueDate: string;
    status: string;
    grossAmountPaise: number;
    concessionAmountPaise: number;
    lateFeePaise: number;
    netAmountPaise: number;
    paidAmountPaise: number;
    balancePaise: number;
    ageingBucket: number | null;
  };
  lines: Array<{
    id: string;
    feeHeadId: string;
    description: string | null;
    grossAmountPaise: number;
    concessionAmountPaise: number;
    netAmountPaise: number;
    paidAmountPaise: number;
    appliedConcessionIds: string[] | null;
  }>;
  payments: Array<{
    id: string;
    receiptNo: string | null;
    paymentDate: string;
    amountPaise: number;
    mode: string;
    status: string;
    referenceNo: string | null;
    gatewayPaymentId: string | null;
  }>;
}): FeeInvoiceDto {
  return {
    id: input.invoice.id,
    studentId: input.invoice.studentId,
    invoiceNo: input.invoice.invoiceNo,
    issueDate: input.invoice.issueDate,
    dueDate: input.invoice.dueDate,
    status: input.invoice.status,
    grossAmountPaise: input.invoice.grossAmountPaise,
    concessionAmountPaise: input.invoice.concessionAmountPaise,
    lateFeePaise: input.invoice.lateFeePaise,
    netAmountPaise: input.invoice.netAmountPaise,
    paidAmountPaise: input.invoice.paidAmountPaise,
    balancePaise: input.invoice.balancePaise,
    ageingBucket: input.invoice.ageingBucket ?? 0,
    lines: input.lines.map((l) => ({
      id: l.id,
      feeHeadId: l.feeHeadId,
      description: l.description,
      grossAmountPaise: l.grossAmountPaise,
      concessionAmountPaise: l.concessionAmountPaise,
      netAmountPaise: l.netAmountPaise,
      paidAmountPaise: l.paidAmountPaise,
      appliedConcessionIds: l.appliedConcessionIds ?? [],
    })),
    payments: input.payments.map((p) => ({
      id: p.id,
      receiptNo: p.receiptNo,
      paymentDate: p.paymentDate,
      amountPaise: p.amountPaise,
      mode: p.mode,
      status: p.status,
      referenceNo: p.referenceNo,
      gatewayPaymentId: p.gatewayPaymentId,
    })),
  };
}

/** Keys that must NEVER appear on a FeeStatusDto payload. */
export const FEE_STATUS_FORBIDDEN_KEYS = [
  'payments',
  'lines',
  'receiptNo',
  'gatewayPaymentId',
  'gatewayOrderId',
  'referenceNo',
  'mode',
  'invoiceNo',
  'grossAmountPaise',
  'paidAmountPaise',
] as const;
