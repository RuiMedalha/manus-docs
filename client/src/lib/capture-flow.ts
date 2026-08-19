import { documentTypeFromAtCode, type AtQrDocument, type CaptureStage } from "./at-qr";

export type CaptureFormFields = {
  documentType: "fatura_recebida" | "fatura_emitida" | "recibo" | "comprovativo" | "encomenda" | "outro";
  nif: string;
  documentNumber: string;
  documentDate: string;
};

export function captureStageForSelectedFile(file: Pick<File, "type"> | null): CaptureStage {
  if (!file) return "idle";
  return file.type.startsWith("image/") ? "reading_qr" : "file_selected";
}

export function captureStageForQrResult(qr: AtQrDocument | null): CaptureStage {
  return qr ? "qr_found" : "qr_not_found";
}

export function applyAtQrToCaptureFields(current: CaptureFormFields, qr: AtQrDocument): CaptureFormFields {
  return {
    documentType: documentTypeFromAtCode(qr.documentTypeCode),
    nif: qr.issuerNif ?? current.nif,
    documentNumber: qr.documentNumber ?? current.documentNumber,
    documentDate: qr.documentDate ?? current.documentDate,
  };
}

export function buildUploadMetadata(fields: CaptureFormFields) {
  return {
    documentType: fields.documentType,
    nif: fields.nif || undefined,
    documentNumber: fields.documentNumber || undefined,
    documentDate: fields.documentDate || undefined,
  };
}
