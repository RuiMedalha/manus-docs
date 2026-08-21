export type TaxCategory = "alimentacao" | "combustivel" | "utilidades" | "outro";

export function buildTaxProposal(category: TaxCategory, vatOriginalCents: number) {
  if (category === "alimentacao") return { ruleCode: "CIVA21_ALIMENTACAO", ruleVersion: "2026.1", vatDeductibleCents: 0, vatNonDeductibleCents: vatOriginalCents, rationale: "Proposta conservadora: o artigo 21.º do CIVA exclui em regra despesas de alimentação e bebidas. O contabilista deve confirmar se existe uma exceção aplicável." };
  if (category === "combustivel") return { ruleCode: "CIVA21_COMBUSTIVEL_REVIEW", ruleVersion: "2026.1", vatDeductibleCents: null, vatNonDeductibleCents: null, rationale: "É necessário confirmar tipo de combustível, veículo e utilização. O artigo 21.º prevê, em certos combustíveis, dedução de 50%, mas existem exceções de dedução total." };
  if (category === "utilidades") return { ruleCode: "CIVA21_UTILIDADES_REVIEW", ruleVersion: "2026.1", vatDeductibleCents: null, vatNonDeductibleCents: null, rationale: "Proposta de revisão normal: conservar o IVA original e confirmar a elegibilidade da despesa para a atividade antes de exportar." };
  return { ruleCode: "CIVA21_REVIEW_REQUIRED", ruleVersion: "2026.1", vatDeductibleCents: null, vatNonDeductibleCents: null, rationale: "Não existe uma percentagem proposta para esta categoria. O contabilista deve selecionar a regra e validar os valores antes de exportar." };
}
