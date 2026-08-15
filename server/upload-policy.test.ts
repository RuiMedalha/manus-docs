import { describe, expect, it } from "vitest";
import { validateDocumentUpload } from "./upload-policy";

describe("política de upload documental", () => {
  it("aceita os formatos e limites suportados", () => {
    expect(validateDocumentUpload("application/pdf", 1024)).toBeNull();
    expect(validateDocumentUpload("image/jpeg", 10 * 1024 * 1024)).toBeNull();
  });
  it("rejeita formatos e tamanhos inválidos antes do armazenamento", () => {
    expect(validateDocumentUpload("text/plain", 1024)).toContain("Formato");
    expect(validateDocumentUpload("application/pdf", 0)).toContain("1 byte");
  });
});
