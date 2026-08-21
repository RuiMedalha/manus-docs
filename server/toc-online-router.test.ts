import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({
  document: { id: 41, documentType: "fatura_recebida", status: "em_revisao", entityName: "Tefcold", nif: "PT500000000", documentNumber: "FT 41", documentDate: "2026-09-10", dueDate: "2026-09-18", totalCents: 12500, vatCents: 2336, currency: "EUR", paymentLifecycle: "aguarda_debito_direto", finalFolder: "/Fornecedores/Tefcold" } as any,
  exportRecord: undefined as any,
}));

vi.mock("./db", () => ({
  getOrCreateTenantContext: vi.fn(async (user: { id: number }) => ({ tenant: { id: 7 }, membership: { role: user.id === 2 ? "contabilidade" : user.id === 3 ? "operador" : "admin" } })),
  getDocumentForTenant: vi.fn(async () => state.document),
  listTocOnlineExportsForTenant: vi.fn(async () => state.exportRecord ? [{ export: state.exportRecord, document: state.document }] : []),
  getTocOnlineExportForTenant: vi.fn(async () => state.exportRecord),
  prepareTocOnlineExport: vi.fn(async (input: any) => { state.exportRecord = { id: 8, status: "pronto_para_revisao", ...input }; return state.exportRecord; }),
  approveTocOnlineExport: vi.fn(async (_tenantId: number, _documentId: number, userId: number) => { state.exportRecord = { ...state.exportRecord, status: "aprovado_para_envio", approvedByUserId: userId }; return state.exportRecord; }),
  recordAudit: vi.fn(),
}));

import * as db from "./db";
import { tocOnlineRouter } from "./routers/toc-online";

const adminCtx = { user: { id: 1, openId: "admin", role: "admin" }, req: {}, res: {} } as unknown as TrpcContext;
const accountingCtx = { user: { id: 2, openId: "accounting", role: "user" }, req: {}, res: {} } as unknown as TrpcContext;
const operatorCtx = { user: { id: 3, openId: "operator", role: "user" }, req: {}, res: {} } as unknown as TrpcContext;

describe("router TOConline", () => {
  beforeEach(() => { state.exportRecord = undefined; state.document.status = "em_revisao"; state.document.entityName = "Tefcold"; vi.mocked(db.recordAudit).mockClear(); });

  it("prepara uma fatura completa com snapshot e referência auditáveis", async () => {
    const result = await tocOnlineRouter.createCaller(adminCtx).prepare({ documentId: 41 });
    expect(result.status).toBe("pronto_para_revisao");
    expect(result.payloadSnapshot).toMatchObject({ documentId: 41, supplier: { name: "Tefcold" }, invoice: { number: "FT 41", totalCents: 12500 } });
    expect(db.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "toconline.prepared", metadata: expect.objectContaining({ documentId: 41 }) }));
  });

  it("bloqueia a preparação de uma fatura sem revisão", async () => {
    state.document.status = "novo";
    await expect(tocOnlineRouter.createCaller(adminCtx).prepare({ documentId: 41 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("exige contabilidade ou administração para aprovar a exportação", async () => {
    await tocOnlineRouter.createCaller(adminCtx).prepare({ documentId: 41 });
    await expect(tocOnlineRouter.createCaller(operatorCtx).approve({ documentId: 41 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const approved = await tocOnlineRouter.createCaller(accountingCtx).approve({ documentId: 41 });
    expect(approved.status).toBe("aprovado_para_envio");
    expect(db.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "toconline.approved_for_sending" }));
  });
});
