import jsQR from "jsqr";

export type AtQrDocument = {
  raw: string;
  issuerNif: string | null;
  documentTypeCode: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  atcud: string | null;
};

export type CaptureStage = "idle" | "file_selected" | "reading_qr" | "qr_found" | "qr_not_found" | "uploading" | "ocr_queued";

export function captureStageMessage(stage: CaptureStage) {
  const messages: Record<CaptureStage, string> = {
    idle: "Pronto para fotografar ou selecionar um ficheiro.",
    file_selected: "Ficheiro selecionado. A preparar a leitura do código.",
    reading_qr: "A procurar QR Code AT na fotografia…",
    qr_found: "QR Code AT lido. Confirme os campos antes de guardar.",
    qr_not_found: "Não foi encontrado QR Code AT. Pode continuar: o OCR analisará o documento.",
    uploading: "A guardar o ficheiro seguro e a preparar a fila OCR…",
    ocr_queued: "Documento guardado. A análise OCR ficou na fila para revisão.",
  };
  return messages[stage];
}

function toIsoDate(value: string | undefined) {
  if (!value || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function parseAtQrPayload(raw: string): AtQrDocument | null {
  const fields = new Map<string, string>();
  for (const segment of raw.split("*")) {
    const separator = segment.indexOf(":");
    if (separator <= 0) continue;
    fields.set(segment.slice(0, separator).trim().toUpperCase(), segment.slice(separator + 1).trim());
  }
  if (!fields.has("A") || !fields.has("G")) return null;
  return {
    raw,
    issuerNif: fields.get("A") || null,
    documentTypeCode: fields.get("D") || null,
    documentNumber: fields.get("G") || null,
    documentDate: toIsoDate(fields.get("F")),
    atcud: fields.get("H") || null,
  };
}

export function documentTypeFromAtCode(code: string | null): "fatura_recebida" | "recibo" | "comprovativo" | "outro" {
  const normalized = code?.trim().toUpperCase() ?? "";
  if (["FT", "FS", "FA", "FR"].includes(normalized)) return "fatura_recebida";
  if (["RG", "RC"].includes(normalized)) return "recibo";
  if (["RP", "RE"].includes(normalized)) return "comprovativo";
  return "outro";
}

export async function readQrFromImage(file: File): Promise<AtQrDocument | null> {
  if (!file.type.startsWith("image/")) return null;
  const source = await loadImageForQr(file);
  const scale = Math.min(1, 1800 / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source.drawable, 0, 0, width, height);
  source.release();
  const code = jsQR(context.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: "attemptBoth" });
  return code ? parseAtQrPayload(code.data) : null;
}

export async function loadImageForQr(file: File): Promise<{ drawable: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { drawable: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  }
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Não foi possível abrir a fotografia."));
    image.src = objectUrl;
  });
  return { drawable: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(objectUrl) };
}
