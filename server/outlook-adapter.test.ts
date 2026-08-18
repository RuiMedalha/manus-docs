import { describe, expect, it } from "vitest";
import { buildAttachmentUrl, buildMessagesUrl, buildMicrosoftAuthorizeUrl, decodeAttachmentBytes, selectEligibleAttachments } from "./outlook-adapter";

describe("adaptador Microsoft Outlook", () => {
  it("cria uma autorização delegada com escopos mínimos e estado anti-CSRF", () => {
    const url = new URL(buildMicrosoftAuthorizeUrl({ clientId: "client", redirectUri: "https://app.example.com/api/outlook/callback", state: "safe-state", microsoftTenantId: "tenant-1" }));
    expect(url.hostname).toBe("login.microsoftonline.com");
    expect(url.pathname).toContain("tenant-1");
    expect(url.searchParams.get("scope")).toContain("Mail.Read");
    expect(url.searchParams.get("state")).toBe("safe-state");
  });

  it("limita a pesquisa a mensagens com anexos e impede lotes excessivos", () => {
    const url = new URL(buildMessagesUrl(500));
    expect(url.searchParams.get("$top")).toBe("50");
    expect(url.searchParams.get("$filter")).toBe("hasAttachments eq true");
  });

  it("aceita apenas anexos documentais não inline dentro do limite de tamanho", () => {
    const selected = selectEligibleAttachments([
      { id: "pdf", name: "fatura.pdf", contentType: "application/pdf", size: 500 },
      { id: "inline", name: "logo.png", contentType: "image/png", size: 100, isInline: true },
      { id: "txt", name: "nota.txt", contentType: "text/plain", size: 100 },
      { id: "large", name: "grande.pdf", contentType: "application/pdf", size: 11 * 1024 * 1024 },
    ]);
    expect(selected.map(item => item.id)).toEqual(["pdf"]);
  });

  it("codifica identificadores de mensagem e anexo e descodifica conteúdo base64", () => {
    expect(buildAttachmentUrl("message/a", "attachment?b")).toContain("message%2Fa");
    expect(decodeAttachmentBytes({ id: "1", name: "a.pdf", contentType: "application/pdf", size: 2, contentBytes: "SGk=" }).toString()).toBe("Hi");
  });
});
