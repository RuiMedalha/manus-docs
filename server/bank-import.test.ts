import { describe, expect, it } from "vitest";
import { normaliseBankRows, parseCsv } from "./bank-import";

describe("normalização de extratos CSV", () => {
  it("lê CSV separado por ponto e vírgula e valores com vírgula decimal", () => {
    const parsed = parseCsv("Data;Descrição;Valor;Referência\n15/08/2026;\"Pagamento fornecedor\";-1.250,45;FT-9");
    const result = normaliseBankRows({ records: parsed.records, mapping: { date: "Data", description: "Descrição", amount: "Valor", reference: "Referência" }, dateFormat: "DD/MM/YYYY", decimalSeparator: "virgula" });
    expect(result.errors).toEqual([]);
    expect(result.transactions[0]).toMatchObject({ transactionDate: "2026-08-15", amountCents: -125045, reference: "FT-9" });
  });

  it("suporta colunas separadas de débito e crédito", () => {
    const result = normaliseBankRows({ records: [{ Data: "2026-08-10", Texto: "Recebimento", Debito: "", Credito: "21.50" }], mapping: { date: "Data", description: "Texto", debit: "Debito", credit: "Credito" }, dateFormat: "YYYY-MM-DD", decimalSeparator: "ponto" });
    expect(result.transactions[0]?.amountCents).toBe(2150);
  });
});
