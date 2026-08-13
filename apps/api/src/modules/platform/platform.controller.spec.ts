import { describe, expect, it, vi } from 'vitest';

import { ApiException } from '../../common/errors/api.exception';
import { PlatformController } from './platform.controller';

describe('PlatformController invoice PDF download', () => {
  const invoices = {
    generate: vi.fn(),
    getPdf: vi.fn(),
    regeneratePdf: vi.fn(),
  };
  const controller = new PlatformController(
    {} as never,
    {} as never,
    {} as never,
    invoices as never,
  );

  const TENANT = '11111111-1111-1111-1111-111111111111';
  const INV = '22222222-2222-2222-2222-222222222222';

  function res() {
    return {
      setHeader: vi.fn(),
      send: vi.fn(),
    };
  }

  it('409 on pending', async () => {
    invoices.getPdf.mockRejectedValue(
      new ApiException(409, 'INVOICE_PDF_PENDING', 'still generating'),
    );
    await expect(controller.downloadInvoicePdf(TENANT, INV, res() as never)).rejects.toMatchObject({
      code: 'INVOICE_PDF_PENDING',
    });
  });

  it('409 on failed', async () => {
    invoices.getPdf.mockRejectedValue(
      new ApiException(409, 'INVOICE_PDF_FAILED', 'render failed'),
    );
    await expect(controller.downloadInvoicePdf(TENANT, INV, res() as never)).rejects.toMatchObject({
      code: 'INVOICE_PDF_FAILED',
    });
  });

  it('200 + PDF bytes on ready', async () => {
    const pdf = Buffer.from('%PDF-1.4 ready');
    invoices.getPdf.mockResolvedValue({ buffer: pdf, filename: 'SAW-2026-27-000007.pdf' });
    const response = res();
    await controller.downloadInvoicePdf(TENANT, INV, response as never);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="SAW-2026-27-000007.pdf"',
    );
    expect(response.send).toHaveBeenCalledWith(pdf);
  });

  it('404 on unknown id', async () => {
    invoices.getPdf.mockRejectedValue(new ApiException(404, 'NOT_FOUND', 'Invoice not found'));
    await expect(controller.downloadInvoicePdf(TENANT, INV, res() as never)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
