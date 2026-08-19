import { describe, expect, it, vi } from "vitest";
import { getAuthorizedDocumentUrl } from "./document-file-access";

describe("acesso seguro ao documento", () => {
  it("devolve a URL assinada do armazenamento em vez de um caminho relativo da aplicação", async () => {
    const getSignedUrl = vi.fn().mockResolvedValue("https://storage.example.test/assinada/documento.pdf");
    await expect(getAuthorizedDocumentUrl("tenant-1/documents/fatura.pdf", getSignedUrl)).resolves.toBe("https://storage.example.test/assinada/documento.pdf");
    expect(getSignedUrl).toHaveBeenCalledWith("tenant-1/documents/fatura.pdf");
  });
});
