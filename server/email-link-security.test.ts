import { describe, expect, it, vi } from "vitest";
import { downloadApprovedSupplierDocument, extractSupplierInvoiceLinks } from "./email-link-security";

describe("links de fatura recebidos por email", () => {
  it("extrai somente HTTPS de fornecedores aprovados", () => {
    const links = extractSupplierInvoiceLinks('Fatura: https://www.moloni.pt/doc/123.pdf e https://manual.toconline.pt/doc/456.pdf. Ignorar https://malicioso.example/x.pdf');
    expect(links).toEqual([{ url: "https://www.moloni.pt/doc/123.pdf", hostname: "www.moloni.pt", provider: "Moloni" }, { url: "https://manual.toconline.pt/doc/456.pdf", hostname: "manual.toconline.pt", provider: "TOConline" }]);
  });

  it("obtém um PDF aprovado sem seguir automaticamente para domínio externo", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="fatura.pdf"' } }));
    const result = await downloadApprovedSupplierDocument({ url: "https://www.moloni.pt/documentos/1", fetcher });
    expect(result).toMatchObject({ contentType: "application/pdf", filename: "fatura.pdf", hostname: "www.moloni.pt" });
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "manual" }));
  });

  it("bloqueia redirecionamentos para domínios não aprovados", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://externo.example/fatura.pdf" } }));
    await expect(downloadApprovedSupplierDocument({ url: "https://www.moloni.pt/documentos/1", fetcher })).rejects.toThrow("não pertence");
  });
});
