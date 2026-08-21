import { describe, expect, it } from "vitest";
import { buildTaxProposal } from "./tax-proposal-rules";

describe("regras de proposta fiscal assistida", () => {
  it("propõe IVA não dedutível para alimentação, mantendo o IVA original", () => {
    expect(buildTaxProposal("alimentacao", 2300)).toMatchObject({ ruleCode: "CIVA21_ALIMENTACAO", vatDeductibleCents: 0, vatNonDeductibleCents: 2300 });
  });

  it("não presume percentagem para combustível sem confirmação profissional", () => {
    expect(buildTaxProposal("combustivel", 2300)).toMatchObject({ ruleCode: "CIVA21_COMBUSTIVEL_REVIEW", vatDeductibleCents: null, vatNonDeductibleCents: null });
  });
});
