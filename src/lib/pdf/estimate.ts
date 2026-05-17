import type { PDFFont, PDFPage, RGB } from 'pdf-lib';

export type EstimatePdfInput = {
  reference: string;
  jurisdictionLabel: string;
  activityLabel: string;
  generatedAt: string;
  oneTimeTotal: string;
  annualTotal: string;
  timeline: string;
  lineItems: { label: string; quantity: number; recurrence: string; total: string }[];
  requiredDocuments: string[];
  assumptions: string[];
};

export async function generateEstimatePdf(input: EstimatePdfInput): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.09, 0.11);
  const muted = rgb(0.36, 0.39, 0.45);
  const accent = rgb(0.05, 0.46, 0.43);

  page.drawRectangle({ x: 0, y: 780, width: 595.28, height: 62, color: accent });
  page.drawText('Mandoob', { x: 42, y: 806, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText('Company setup estimate', { x: 42, y: 742, size: 26, font: bold, color: ink });
  page.drawText(`Reference ${input.reference}`, { x: 42, y: 716, size: 11, font: regular, color: muted });

  drawField(page, bold, regular, 'Jurisdiction', input.jurisdictionLabel, 42, 666, muted, ink);
  drawField(page, bold, regular, 'Activity', input.activityLabel, 320, 666, muted, ink);
  drawField(page, bold, regular, 'One-time setup', input.oneTimeTotal, 42, 612, muted, ink);
  drawField(page, bold, regular, 'Annual recurring', input.annualTotal, 320, 612, muted, ink);
  drawField(page, bold, regular, 'Estimated timeline', input.timeline, 42, 558, muted, ink);
  drawField(page, bold, regular, 'Generated', new Date(input.generatedAt).toLocaleString('en-GB'), 320, 558, muted, ink);

  let y = 492;
  page.drawText('Itemized fees', { x: 42, y, size: 13, font: bold, color: ink });
  y -= 24;
  for (const item of input.lineItems.slice(0, 12)) {
    page.drawText(`${item.label} x${item.quantity}`, { x: 42, y, size: 10, font: regular, color: ink, maxWidth: 330 });
    page.drawText(item.recurrence.replace('_', ' '), { x: 385, y, size: 9, font: regular, color: muted });
    page.drawText(item.total, { x: 470, y, size: 10, font: bold, color: ink, maxWidth: 80 });
    y -= 18;
  }

  y -= 12;
  page.drawText('Required documents', { x: 42, y, size: 12, font: bold, color: ink });
  y -= 20;
  for (const document of input.requiredDocuments.slice(0, 8)) {
    page.drawText(`- ${document}`, { x: 42, y, size: 10, font: regular, color: muted, maxWidth: 500 });
    y -= 16;
  }

  y -= 10;
  page.drawText('Assumptions', { x: 42, y, size: 12, font: bold, color: ink });
  y -= 20;
  for (const assumption of input.assumptions.slice(0, 5)) {
    page.drawText(`- ${assumption}`, { x: 42, y, size: 9, font: regular, color: muted, maxWidth: 500 });
    y -= 15;
  }

  page.drawLine({ start: { x: 42, y: 74 }, end: { x: 553, y: 74 }, thickness: 1, color: rgb(0.86, 0.88, 0.91) });
  page.drawText('Generated on demand. This quote is not stored and is not a government fee guarantee.', {
    x: 42,
    y: 48,
    size: 9,
    font: regular,
    color: muted,
    maxWidth: 500,
  });

  return doc.save();
}

function drawField(
  page: PDFPage,
  bold: PDFFont,
  regular: PDFFont,
  label: string,
  value: string,
  x: number,
  y: number,
  muted: RGB,
  ink: RGB,
) {
  page.drawText(label, { x, y, size: 9, font: bold, color: muted });
  page.drawText(value, { x, y: y - 20, size: 13, font: regular, color: ink, maxWidth: 230 });
}
