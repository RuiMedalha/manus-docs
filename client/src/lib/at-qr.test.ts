import { afterEach, describe, expect, it, vi } from "vitest";
import qrcode from "qrcode-generator";
import { captureStageMessage, decodeAtQr, documentTypeFromAtCode, loadImageForQr, parseAtQrPayload, qrRotationAngles, qrScanRegions, rotateQrImage } from "./at-qr";

class TestImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

function qrImageData(payload: string) {
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();
  const quietZone = 4;
  const pixelSize = 5;
  const modules = qr.getModuleCount();
  const side = (modules + quietZone * 2) * pixelSize;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (!qr.isDark(row, column)) continue;
      for (let y = 0; y < pixelSize; y += 1) {
        for (let x = 0; x < pixelSize; x += 1) {
          const targetX = (column + quietZone) * pixelSize + x;
          const targetY = (row + quietZone) * pixelSize + y;
          const index = (targetY * side + targetX) * 4;
          data[index] = 0;
          data[index + 1] = 0;
          data[index + 2] = 0;
        }
      }
    }
  }
  return new TestImageData(data, side, side) as unknown as ImageData;
}

describe("leitura de QR Code AT", () => {
  const payload = "A:PT500000000*B:PT999999990*C:PT*D:FT*E:N*F:20250724*G:FT 2025/123*H:CSDF7T5E-123*I:1";

  it("extrai identificadores fiscais seguros e normaliza a data", () => {
    expect(parseAtQrPayload(payload)).toMatchObject({ issuerNif: "PT500000000", documentTypeCode: "FT", documentNumber: "FT 2025/123", documentDate: "2025-07-24", atcud: "CSDF7T5E-123" });
  });

  it("não aceita um QR sem os campos mínimos AT", () => {
    expect(parseAtQrPayload("A:PT500000000*F:20250724")).toBeNull();
  });

  it("mapeia tipos AT conhecidos para a classificação de receção", () => {
    expect(documentTypeFromAtCode("FT")).toBe("fatura_recebida");
    expect(documentTypeFromAtCode("RG")).toBe("recibo");
    expect(documentTypeFromAtCode("NC")).toBe("outro");
  });

  it("expõe estados claros de captura até à fila OCR", () => {
    expect(captureStageMessage("reading_qr")).toContain("QR Code AT");
    expect(captureStageMessage("ocr_queued")).toContain("fila");
  });

  it("varre a imagem completa e zonas inferiores ampliadas para QR AT pequeno", () => {
    const regions = qrScanRegions(2400, 3200);
    expect(regions).toHaveLength(4);
    expect(regions[0]).toMatchObject({ x: 0, y: 0, width: 2400, height: 3200, scale: 1 });
    expect(regions.slice(1).every(region => region.y > 0 && region.scale > 1)).toBe(true);
  });

  it("inclui quatro orientações de leitura para fotografias móveis rodadas", () => {
    expect(qrRotationAngles).toEqual([0, 90, 180, 270]);
  });

  it("recupera um QR AT real depois de a fotografia ser rodada", () => {
    const originalImageData = globalThis.ImageData;
    vi.stubGlobal("ImageData", TestImageData);
    try {
      const rotated = rotateQrImage(qrImageData(payload), 90);
      expect(decodeAtQr(rotated)).toMatchObject({ issuerNif: "PT500000000", documentNumber: "FT 2025/123" });
    } finally {
      vi.stubGlobal("ImageData", originalImageData);
    }
  });

  it("usa uma imagem HTML como fallback quando createImageBitmap não existe", async () => {
    const originalCreateImageBitmap = globalThis.createImageBitmap;
    const originalImage = globalThis.Image;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    class FakeImage {
      naturalWidth = 1200;
      naturalHeight = 800;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_: string) { queueMicrotask(() => this.onload?.()); }
    }
    try {
      vi.stubGlobal("createImageBitmap", undefined);
      vi.stubGlobal("Image", FakeImage);
      URL.createObjectURL = vi.fn(() => "blob:test");
      URL.revokeObjectURL = vi.fn();
      const image = await loadImageForQr(new File(["photo"], "photo.jpg", { type: "image/jpeg" }));
      expect(image.width).toBe(1200);
      expect(image.height).toBe(800);
      image.release();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
    } finally {
      vi.stubGlobal("createImageBitmap", originalCreateImageBitmap);
      vi.stubGlobal("Image", originalImage);
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
    }
  });
});
