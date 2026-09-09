import { pdf } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

export async function pdfBlobFromDocument(document: ReactElement): Promise<Blob> {
  return pdf(document).toBlob();
}

export function openPdfPreview(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
