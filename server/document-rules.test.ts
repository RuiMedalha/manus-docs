import { describe, expect, it } from "vitest";
import { applyFolderTemplate, ruleMatchesDocument } from "./document-rules";

describe("regras de pasta documental", () => {
  const document = { documentType: "fatura_recebida", entityName: "Alfa & Filhos", documentDate: "2026-08-15" };

  it("seleciona uma regra compatível por tipo e entidade", () => {
    expect(ruleMatchesDocument({ documentType: "fatura_recebida", entityName: "alfa", folderTemplate: "/x" }, document)).toBe(true);
    expect(ruleMatchesDocument({ documentType: "recibo", folderTemplate: "/x" }, document)).toBe(false);
  });

  it("substitui variáveis do padrão e protege segmentos de pasta", () => {
    expect(applyFolderTemplate("/{Ano}/{Mes}/{Tipo}/{Entidade}", document)).toBe("/2026/08/fatura recebida/Alfa & Filhos");
  });
});
