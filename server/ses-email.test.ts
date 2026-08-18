import { describe, expect, it } from "vitest";
import { buildPasswordResetEmail, getSesSmtpConfig, sendPasswordResetWithSes } from "./ses-email";

describe("email transacional SES", () => {
  it("não considera o SES configurado quando faltam segredos", () => {
    expect(getSesSmtpConfig({ SES_SMTP_HOST: "email-smtp.eu-west-1.amazonaws.com" })).toBeNull();
  });
  it("constrói um email de reposição sem incluir o token fora do URL seguro", () => {
    const email = buildPasswordResetEmail("https://app.exemplo.pt/acesso?reset=token-seguro");
    expect(email.subject).toContain("repor");
    expect(email.html).toContain("https://app.exemplo.pt/acesso?reset=token-seguro");
  });
  it("não tenta estabelecer ligação SMTP quando o SES não está configurado", async () => {
    const previous = { ...process.env };
    delete process.env.SES_SMTP_HOST;
    delete process.env.SES_SMTP_USER;
    delete process.env.SES_SMTP_PASSWORD;
    delete process.env.SES_FROM_EMAIL;
    await expect(sendPasswordResetWithSes({ to: "utilizador@exemplo.pt", resetUrl: "https://app.exemplo.pt/acesso?reset=seguro" })).resolves.toEqual({ delivered: false, reason: "not_configured" });
    Object.assign(process.env, previous);
  });
});
