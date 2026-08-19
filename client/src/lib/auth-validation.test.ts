import { describe, expect, it } from "vitest";
import { friendlyAuthErrorMessage, INVALID_EMAIL_MESSAGE, isValidEmail } from "./auth-validation";

describe("validação do acesso local", () => {
  it("aceita e rejeita emails de forma legível", () => {
    expect(isValidEmail("nome@empresa.pt")).toBe(true);
    expect(isValidEmail("sem-arroba")).toBe(false);
  });

  it("não mostra a estrutura técnica do validador ao utilizador", () => {
    const rawError = { message: '[{"origin":"string","code":"invalid_format","format":"email","path":["email"],"message":"Indique um email válido."}]' };
    expect(friendlyAuthErrorMessage(rawError)).toBe(INVALID_EMAIL_MESSAGE);
  });
});
