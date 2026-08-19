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

type QrRegion = { x: number; y: number; width: number; height: number; scale: number };
export const qrRotationAngles = [0, 90, 180, 270] as const;

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

export function qrScanRegions(width: number, height: number): QrRegion[] {
  const lowerHalf = Math.floor(height * 0.45);
  const halfWidth = Math.floor(width / 2);
  const receiptX = Math.floor(width * 0.2);
  const receiptY = Math.floor(height * 0.22);
  const receiptWidth = Math.floor(width * 0.6);
  const receiptHeight = Math.floor(height * 0.52);
  return [
    { x: 0, y: 0, width, height, scale: 1 },
    { x: receiptX, y: receiptY, width: receiptWidth, height: receiptHeight, scale: 2.6 },
    { x: receiptX, y: Math.floor(height * 0.34), width: receiptWidth, height: Math.floor(height * 0.34), scale: 3 },
    { x: 0, y: height - lowerHalf, width, height: lowerHalf, scale: 1.8 },
    { x: 0, y: height - lowerHalf, width: halfWidth, height: lowerHalf, scale: 2.1 },
    { x: halfWidth, y: height - lowerHalf, width: width - halfWidth, height: lowerHalf, scale: 2.1 },
  ];
}

function increaseContrast(image: ImageData) {
  const adjusted = new Uint8ClampedArray(image.data);
  for (let index = 0; index < adjusted.length; index += 4) {
    const luminance = (adjusted[index] * 0.2126 + adjusted[index + 1] * 0.7152 + adjusted[index + 2] * 0.0722 - 128) * 1.7 + 128;
    const value = Math.max(0, Math.min(255, luminance));
    adjusted[index] = value;
    adjusted[index + 1] = value;
    adjusted[index + 2] = value;
  }
  return new ImageData(adjusted, image.width, image.height);
}

export function decodeAtQr(image: ImageData) {
  for (const angle of qrRotationAngles) {
    const rotated = rotateQrImage(image, angle);
    for (const data of [rotated.data, increaseContrast(rotated).data]) {
      const code = jsQR(data, rotated.width, rotated.height, { inversionAttempts: "attemptBoth" });
      if (code) {
        const parsed = parseAtQrPayload(code.data);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

export function rotateQrImage(image: ImageData, angle: typeof qrRotationAngles[number]) {
  if (angle === 0) return image;
  const rotatedWidth = angle === 180 ? image.width : image.height;
  const rotatedHeight = angle === 180 ? image.height : image.width;
  const rotated = new Uint8ClampedArray(rotatedWidth * rotatedHeight * 4);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const sourceIndex = (y * image.width + x) * 4;
      const targetX = angle === 90 ? image.height - 1 - y : angle === 180 ? image.width - 1 - x : y;
      const targetY = angle === 90 ? x : angle === 180 ? image.height - 1 - y : image.width - 1 - x;
      const targetIndex = (targetY * rotatedWidth + targetX) * 4;
      rotated[targetIndex] = image.data[sourceIndex];
      rotated[targetIndex + 1] = image.data[sourceIndex + 1];
      rotated[targetIndex + 2] = image.data[sourceIndex + 2];
      rotated[targetIndex + 3] = image.data[sourceIndex + 3];
    }
  }
  return new ImageData(rotated, rotatedWidth, rotatedHeight);
}

async function decodeWithNativeDetector(file: File) {
  const BarcodeDetector = (globalThis as typeof globalThis & { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (image: ImageBitmap) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
  if (!BarcodeDetector || typeof createImageBitmap !== "function") return null;
  const bitmap = await createImageBitmap(file);
  try {
    const results = await new BarcodeDetector({ formats: ["qr_code"] }).detect(bitmap);
    for (const result of results) {
      const parsed = parseAtQrPayload(result.rawValue);
      if (parsed) return parsed;
    }
  } catch {
    // O fallback jsQR continua disponível para browsers sem este detetor ou sem suporte QR.
  } finally {
    bitmap.close();
  }
  return null;
}

export async function readQrFromImage(file: File): Promise<AtQrDocument | null> {
  if (!file.type.startsWith("image/")) return null;
  const nativeResult = await decodeWithNativeDetector(file);
  if (nativeResult) return nativeResult;
  const source = await loadImageForQr(file);
  try {
    for (const region of qrScanRegions(source.width, source.height)) {
      const outputScale = Math.min(region.scale, 2400 / Math.max(region.width, region.height));
      const width = Math.max(1, Math.round(region.width * outputScale));
      const height = Math.max(1, Math.round(region.height * outputScale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) continue;
      context.drawImage(source.drawable, region.x, region.y, region.width, region.height, 0, 0, width, height);
      const parsed = decodeAtQr(context.getImageData(0, 0, width, height));
      if (parsed) return parsed;
    }
    return null;
  } finally {
    source.release();
  }
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
