import { describe, expect, it } from "vitest";
import { applyAtQrToCaptureFields, buildUploadMetadata, captureStageForQrResult, captureStageForSelectedFile } from "./capture-flow";

describe("integração do fluxo de captura Inbox", () => {
  const initial = { documentType: "outro" as const, nif: "", documentNumber: "", documentDate: "" };
  const qr = { raw: "A:PT500000000*D:FT*F:20250724*G:FT 2025/123", issuerNif: "PT500000000", documentTypeCode: "FT", documentNumber: "FT 2025/123", documentDate: "2025-07-24", atcud: null };

  it("transita de fotografia para leitura QR e para estado sem QR", () => {
    expect(captureStageForSelectedFile({ type: "image/jpeg" })).toBe("reading_qr");
    expect(captureStageForQrResult(null)).toBe("qr_not_found");
    expect(captureStageForSelectedFile({ type: "application/pdf" })).toBe("file_selected");
  });

  it("pré-preenche a fatura a partir de QR AT e envia os campos corretos", () => {
    const filled = applyAtQrToCaptureFields(initial, qr);
    expect(filled).toEqual({ documentType: "fatura_recebida", nif: "PT500000000", documentNumber: "FT 2025/123", documentDate: "2025-07-24" });
    expect(buildUploadMetadata(filled)).toEqual({ documentType: "fatura_recebida", nif: "PT500000000", documentNumber: "FT 2025/123", documentDate: "2025-07-24" });
  });
});
