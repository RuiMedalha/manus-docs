import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createBankImportWithTransactions, findDuplicateBankImport, getOrCreateTenantContext, listBankImportTemplatesForTenant, listBankTransactionsForTenant, recordAudit, saveBankImportTemplate } from "../db";
import { normaliseBankRows, parseCsv, type CsvMapping } from "../bank-import";
import { canPerform } from "../security";
import { protectedProcedure, router } from "../_core/trpc";

const mappingSchema = z.object({ date: z.string().min(1), description: z.string().min(1), amount: z.string().nullable().optional(), debit: z.string().nullable().optional(), credit: z.string().nullable().optional(), balance: z.string().nullable().optional(), reference: z.string().nullable().optional() }).refine(value => Boolean(value.amount || value.debit || value.credit), { message: "Mapeie Valor ou pelo menos Débito/Crédito." });
const decimalSchema = z.enum(["virgula", "ponto"]);

function assertImportAccess(role: Parameters<typeof canPerform>[0]) {
  if (!canPerform(role, "imports:write")) throw new TRPCError({ code: "FORBIDDEN", message: "O seu papel não permite importar extratos." });
}

function contentFromBase64(base64: string) {
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "O CSV deve ter entre 1 byte e 5 MB." });
  return buffer;
}

export const bankImportRouter = router({
  templates: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    return listBankImportTemplatesForTenant(tenantContext.tenant.id);
  }),
  transactions: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    return listBankTransactionsForTenant(tenantContext.tenant.id);
  }),
  preview: protectedProcedure.input(z.object({ base64: z.string().min(1) })).mutation(async ({ input }) => {
    const parsed = parseCsv(contentFromBase64(input.base64).toString("utf8"));
    if (!parsed.headers.length) throw new TRPCError({ code: "BAD_REQUEST", message: "O CSV não tem cabeçalhos ou linhas válidas." });
    return { headers: parsed.headers, records: parsed.records.slice(0, 8), totalRows: parsed.records.length };
  }),
  saveTemplate: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120), mapping: mappingSchema, dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]), decimalSeparator: decimalSchema })).mutation(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    assertImportAccess(tenantContext.membership.role);
    const template = await saveBankImportTemplate({ tenantId: tenantContext.tenant.id, name: input.name, mapping: input.mapping, dateFormat: input.dateFormat, decimalSeparator: input.decimalSeparator, createdByUserId: ctx.user.id });
    await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "bank_template.saved", resourceType: "bankImportTemplate", resourceId: String(template.id), metadata: { name: template.name } });
    return template;
  }),
  import: protectedProcedure.input(z.object({ filename: z.string().min(1).max(255), base64: z.string().min(1), mapping: mappingSchema, dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]), decimalSeparator: decimalSchema, templateId: z.number().int().positive().nullable().optional() })).mutation(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    assertImportAccess(tenantContext.membership.role);
    const buffer = contentFromBase64(input.base64);
    const parsed = parseCsv(buffer.toString("utf8"));
    const normalized = normaliseBankRows({ records: parsed.records, mapping: input.mapping as CsvMapping, dateFormat: input.dateFormat, decimalSeparator: input.decimalSeparator });
    if (normalized.errors.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Foram encontradas ${normalized.errors.length} linhas inválidas. Corrija o mapeamento ou o ficheiro.` });
    if (!normalized.transactions.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Não foram encontrados movimentos para importar." });
    const dates = normalized.transactions.map(item => item.transactionDate).sort();
    const duplicate = await findDuplicateBankImport(tenantContext.tenant.id, { fileHash: createHash("sha256").update(buffer).digest("hex"), periodStart: dates[0] ?? null, periodEnd: dates.at(-1) ?? null, rowCount: normalized.transactions.length });
    if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "Este extrato, ou um extrato com o mesmo período e número de linhas, já foi importado." });
    const created = await createBankImportWithTransactions({ tenantId: tenantContext.tenant.id, uploadedByUserId: ctx.user.id, templateId: input.templateId ?? null, filename: input.filename, fileHash: createHash("sha256").update(buffer).digest("hex"), periodStart: dates[0] ?? null, periodEnd: dates.at(-1) ?? null, rowCount: normalized.transactions.length, transactions: normalized.transactions });
    await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "bank_import.completed", resourceType: "bankImport", resourceId: String(created.id), metadata: { filename: input.filename, rowCount: normalized.transactions.length } });
    return { ...created, rowCount: normalized.transactions.length };
  }),
});
