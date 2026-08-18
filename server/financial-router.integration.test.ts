import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({
  payment: { id: 1, approvalStatus: "proposta" as "proposta" | "aprovada", debitAccountId: null as number | null, categoryId: null as number | null, status: "pendente", dueDate: "2026-09-01", amountCents: 12500, currency: "EUR" },
  entity: { id: 9, status: "proposto" as "proposto" | "ativo", name: "ACME", entityType: "fornecedor" as const },
  policies: [] as Array<{ id: number; tenantId: number; name: string; minAmountCents: number; categoryId: number | null; requiredRole: "admin" | "contabilidade" | "operador" | "aprovador"; enabled: boolean }>,
}));

vi.mock("./db", () => ({
  getOrCreateTenantContext: vi.fn(async (user: { id: number }) => ({ tenant: { id: 7 }, membership: { role: user.id === 2 ? "contabilidade" : "admin" } })),
  listPaymentSchedulesForTenant: vi.fn(async () => [state.payment]),
  listPaymentApprovalPoliciesForTenant: vi.fn(async () => state.policies),
  createPaymentApprovalPolicy: vi.fn(async (input: Omit<(typeof state.policies)[number], "id">) => { const policy = { ...input, id: state.policies.length + 1, enabled: input.enabled ?? true }; state.policies.push(policy); return policy; }),
  updatePaymentApprovalPolicyForTenant: vi.fn(async (_tenantId: number, id: number, input: Record<string, unknown>) => { const policy = state.policies.find(item => item.id === id); if (policy) Object.assign(policy, input); return policy; }),
  deletePaymentApprovalPolicyForTenant: vi.fn(async (_tenantId: number, id: number) => { state.policies = state.policies.filter(item => item.id !== id); }),
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
const accountingCtx = { user: { id: 2, openId: "accounting-user", role: "user" }, req: {}, res: {} } as unknown as TrpcContext;

describe("integração financeira dos routers", () => {
  beforeEach(() => { state.payment = { id: 1, approvalStatus: "proposta", debitAccountId: null, categoryId: null, status: "pendente", dueDate: "2026-09-01", amountCents: 12500, currency: "EUR" }; state.entity = { id: 9, status: "proposto", name: "ACME", entityType: "fornecedor" }; state.policies = []; });
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
  it("cria, edita, suspende e remove políticas no tenant ativo", async () => {
    const caller = paymentsRouter.createCaller(ctx);
    const created = await caller.createPolicy({ name: "Aprovação elevada", minAmountCents: 10000, requiredRole: "admin" });
    expect(created.name).toBe("Aprovação elevada");
    const updated = await caller.updatePolicy({ id: created.id, enabled: false, name: "Aprovação suspensa" });
    expect(updated?.enabled).toBe(false);
    expect(updated?.name).toBe("Aprovação suspensa");
    const reactivated = await caller.updatePolicy({ id: created.id, enabled: true });
    expect(reactivated?.enabled).toBe(true);
    await caller.deletePolicy({ id: created.id });
    expect(await caller.listPolicies()).toEqual([]);
  });
  it("aplica uma política de montante e categoria antes de aprovar", async () => {
    const caller = paymentsRouter.createCaller(ctx);
    await caller.createPolicy({ name: "Despesas de administração", minAmountCents: 10000, categoryId: 4, requiredRole: "admin" });
    const approved = await caller.approve({ id: 1, debitAccountId: 3, categoryId: 4 });
    expect(approved?.approvalStatus).toBe("aprovada");
  });
  it("bloqueia aprovação quando o papel não cumpre uma política aplicável", async () => {
    const admin = paymentsRouter.createCaller(ctx);
    await admin.createPolicy({ name: "Aprovação dedicada", minAmountCents: 10000, categoryId: 4, requiredRole: "aprovador" });
    const accounting = paymentsRouter.createCaller(accountingCtx);
    await expect(accounting.approve({ id: 1, debitAccountId: 3, categoryId: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("não aplica uma política quando o montante ou a categoria não coincidem", async () => {
    const admin = paymentsRouter.createCaller(ctx);
    await admin.createPolicy({ name: "Apenas categoria 8", minAmountCents: 20000, categoryId: 8, requiredRole: "aprovador" });
    const accounting = paymentsRouter.createCaller(accountingCtx);
    const approved = await accounting.approve({ id: 1, debitAccountId: 3, categoryId: 4 });
    expect(approved?.approvalStatus).toBe("aprovada");
  });
});
