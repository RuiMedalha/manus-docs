import { afterEach, describe, expect, it, vi } from "vitest";
import { captureStageMessage, documentTypeFromAtCode, loadImageForQr, parseAtQrPayload } from "./at-qr";

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
