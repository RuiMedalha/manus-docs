import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({
  payment: { id: 1, approvalStatus: "proposta" as "proposta" | "aprovada", debitAccountId: null as number | null, categoryId: null as number | null, status: "pendente", dueDate: "2026-09-01", amountCents: 12500, currency: "EUR" },
  entity: { id: 9, status: "proposto" as "proposto" | "ativo", name: "ACME", entityType: "fornecedor" as const },
}));

vi.mock("./db", () => ({
  getOrCreateTenantContext: vi.fn(async () => ({ tenant: { id: 7 }, membership: { role: "admin" } })),
  listPaymentSchedulesForTenant: vi.fn(async () => [state.payment]),
  listFinancialAccountsForTenant: vi.fn(async () => [{ id: 3, accountType: "banco", isActive: true }]),
  listFinancialCategoriesForTenant: vi.fn(async () => [{ id: 4, direction: "despesa", isActive: true }]),
  updatePaymentScheduleForTenant: vi.fn(async (_tenantId: number, _id: number, input: Record<string, unknown>) => { Object.assign(state.payment, input); return state.payment; }),
  createPaymentSchedule: vi.fn(), createOrUpdatePaymentFromDocument: vi.fn(), listDocumentsForTenant: vi.fn(async () => []), recordAudit: vi.fn(),
  listBusinessEntitiesForTenant: vi.fn(async () => [state.entity]),
  updateBusinessEntityForTenant: vi.fn(async (_tenantId: number, _id: number, input: Record<string, unknown>) => { Object.assign(state.entity, input); return state.entity; }),
  createFinancialAccount: vi.fn(), createFinancialCategory: vi.fn(), findOrCreateBusinessEntity: vi.fn(), listCrmConnectionsForTenant: vi.fn(async () => []), listCrmSyncRunsForTenant: vi.fn(async () => []), updateCrmConnection: vi.fn(), getCrmConnectionForTenant: vi.fn(), createCrmSyncRun: vi.fn(), finishCrmSyncRun: vi.fn(),
}));

import { masterDataRouter } from "./routers/master-data";
import { paymentsRouter } from "./routers/payments";

const ctx = { user: { id: 1, openId: "integration-user", role: "admin" }, req: {}, res: {} } as unknown as TrpcContext;

describe("integração financeira dos routers", () => {
  beforeEach(() => { state.payment = { id: 1, approvalStatus: "proposta", debitAccountId: null, categoryId: null, status: "pendente", dueDate: "2026-09-01", amountCents: 12500, currency: "EUR" }; state.entity = { id: 9, status: "proposto", name: "ACME", entityType: "fornecedor" }; });
  it("confirma uma entidade proposta no mesmo tenant", async () => {
    const caller = masterDataRouter.createCaller(ctx);
    const result = await caller.updateEntity({ id: 9, status: "ativo" });
    expect(result?.status).toBe("ativo");
  });
  it("bloqueia pagamento sem aprovação e permite liquidar após conta e categoria", async () => {
    const caller = paymentsRouter.createCaller(ctx);
    await expect(caller.updateStatus({ id: 1, status: "pago", paidAt: "2026-09-02" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const approved = await caller.approve({ id: 1, debitAccountId: 3, categoryId: 4 });
    expect(approved?.approvalStatus).toBe("aprovada");
    const settled = await caller.updateStatus({ id: 1, status: "pago", paidAt: "2026-09-02" });
    expect(settled?.status).toBe("pago");
  });
});
