/**
 * Minimal PDF 1.4 generator — Helvetica, no extra dependency.
 * Invoice PDFs are small text documents; pulling a PDF library onto a 2 vCPU
 * box is not justified. Flag for CA review: layout is functional, not a
 * statutory template.
 */

function pdfEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function buildSimplePdf(lines: string[]): Buffer {
  const contentLines = lines.map((line, i) => {
    const y = 800 - i * 14;
    return `BT /F1 10 Tf 50 ${y} Td (${pdfEscape(line)}) Tj ET`;
  });
  const stream = contentLines.join('\n');
  const streamBuf = Buffer.from(stream, 'utf8');

  const objects: string[] = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${streamBuf.length} >> stream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ];

  let offset = '%PDF-1.4\n'.length;
  const xref: number[] = [0];
  const body: string[] = [];
  for (const obj of objects) {
    xref.push(offset);
    body.push(obj);
    offset += Buffer.byteLength(obj, 'utf8');
  }
  const xrefStart = offset;
  const xrefTable = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...xref.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n `),
    'trailer << /Size ' + (objects.length + 1) + ' /Root 1 0 R >>',
    'startxref',
    String(xrefStart),
    '%%EOF',
  ].join('\n');

  return Buffer.from('%PDF-1.4\n' + body.join('') + xrefTable, 'utf8');
}
