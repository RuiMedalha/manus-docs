import { describe, expect, it } from "vitest";
import { decryptOutlookToken, encryptOutlookToken } from "./outlook-crypto";
import { getOutlookEnvironmentConfig } from "./outlook-config";

describe("segurança da ligação Outlook", () => {
  it("cifra e decifra um token Microsoft sem o guardar em texto simples", () => {
    const encrypted = encryptOutlookToken("refresh-token", "test-secret");
    expect(encrypted).not.toContain("refresh-token");
    expect(decryptOutlookToken(encrypted, "test-secret")).toBe("refresh-token");
    expect(() => decryptOutlookToken(encrypted, "wrong-secret")).toThrow();
  });

  it("assinala a configuração Outlook incompleta sem expor segredos", () => {
    const previous = { id: process.env.MICROSOFT_CLIENT_ID, secret: process.env.MICROSOFT_CLIENT_SECRET, redirect: process.env.MICROSOFT_REDIRECT_URI };
    delete process.env.MICROSOFT_CLIENT_ID; delete process.env.MICROSOFT_CLIENT_SECRET; delete process.env.MICROSOFT_REDIRECT_URI;
    const status = getOutlookEnvironmentConfig();
    expect(status.config).toBeNull();
    expect(status.missing).toContain("MICROSOFT_CLIENT_ID");
    process.env.MICROSOFT_CLIENT_ID = previous.id; process.env.MICROSOFT_CLIENT_SECRET = previous.secret; process.env.MICROSOFT_REDIRECT_URI = previous.redirect;
  });
});
