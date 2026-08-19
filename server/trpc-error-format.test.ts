import { describe, expect, it } from "vitest";
import { clientSafeErrorMessage } from "./_core/trpc";

describe("normalização de erros tRPC", () => {
  it("não expõe SQL ou parâmetros quando ocorre uma falha interna", () => {
    const rawMessage = "Failed query: select * from documents where id = NaN params: 60002,NaN,1";
    const safeMessage = clientSafeErrorMessage("INTERNAL_SERVER_ERROR", rawMessage);
    expect(safeMessage).toBe("Ocorreu um problema ao tratar o pedido. Tente novamente ou contacte o administrador.");
    expect(safeMessage).not.toContain("select");
    expect(safeMessage).not.toContain("NaN");
  });

  it("mantém as mensagens de validação controladas pelo backend", () => {
    expect(clientSafeErrorMessage("BAD_REQUEST", "Identificador de documento inválido.")).toBe("Identificador de documento inválido.");
  });
});
