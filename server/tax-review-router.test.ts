import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({ document: { id: 51, documentType: "fatura_recebida", status: "em_revisao", vatCents: 2300 } as any, proposal: undefined as any }));
vi.mock("./db", () => ({
  getOrCreateTenantContext: vi.fn(async (user: { id: number }) => ({ tenant: { id: 7 }, membership: { role: user.id === 2 ? "contabilidade" : user.id === 3 ? "operador" : "admin" } })),
  getDocumentForTenant: vi.fn(async () => state.document),
  listTaxReviewProposalsForTenant: vi.fn(async () => []),
  getTaxReviewProposalForTenant: vi.fn(async () => state.proposal),
  saveTaxReviewProposal: vi.fn(async (input: any) => { state.proposal = { id: 9, reviewStatus: "pendente", ...input }; return state.proposal; }),
  confirmTaxReviewProposal: vi.fn(async (input: any) => { state.proposal = { ...state.proposal, ...input }; return state.proposal; }),
  recordAudit: vi.fn(),
}));
import * as db from "./db";
import { taxReviewRouter } from "./routers/tax-review";
const adminCtx = { user: { id: 1, openId: "admin", role: "admin" }, req: {}, res: {} } as unknown as TrpcContext;
const accountingCtx = { user: { id: 2, openId: "accounting", role: "user" }, req: {}, res: {} } as unknown as TrpcContext;
const operatorCtx = { user: { id: 3, openId: "operator", role: "user" }, req: {}, res: {} } as unknown as TrpcContext;

describe("router de revisão de IVA", () => {
  beforeEach(() => { state.proposal = undefined; vi.mocked(db.recordAudit).mockClear(); });
  it("prepara uma proposta de alimentação e audita a regra", async () => {
    const proposal = await taxReviewRouter.createCaller(adminCtx).propose({ documentId: 51, taxCategory: "alimentacao" });
    expect(proposal).toMatchObject({ vatDeductibleCents: 0, vatNonDeductibleCents: 2300, reviewStatus: "pendente" });
    expect(db.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "tax_review.proposed" }));
  });
  it("rejeita confirmação por operador e valores que não preservam o IVA", async () => {
    await taxReviewRouter.createCaller(adminCtx).propose({ documentId: 51, taxCategory: "alimentacao" });
    await expect(taxReviewRouter.createCaller(operatorCtx).confirm({ documentId: 51, reviewStatus: "confirmado_contabilista", vatDeductibleCents: 0, vatNonDeductibleCents: 2300 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(taxReviewRouter.createCaller(accountingCtx).confirm({ documentId: 51, reviewStatus: "confirmado_contabilista", vatDeductibleCents: 1000, vatNonDeductibleCents: 1000 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
