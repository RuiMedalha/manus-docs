export const supportedDocumentTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function validateDocumentUpload(contentType: string, sizeBytes: number) {
  if (!supportedDocumentTypes.has(contentType)) return "Formato não suportado. Use PDF, JPG, PNG ou DOCX.";
  if (sizeBytes <= 0 || sizeBytes > 10 * 1024 * 1024) return "O ficheiro deve ter entre 1 byte e 10 MB.";
  return null;
}
