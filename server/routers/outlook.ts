import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createOutlookImportRun, getOrCreateTenantContext, getOutlookConnectionForTenant, listOutlookImportRunsForTenant, recordAudit, updateOutlookConnectionForTenant } from "../db";
import { decodeAttachmentBytes, selectEligibleAttachments } from "../outlook-adapter";
import { getOutlookAuthorizationForUser } from "../outlook-oauth";
import { downloadOutlookAttachment, getMicrosoftGraphAccessToken, listOutlookAttachmentPreviews, listOutlookSupplierLinkPreviews } from "../outlook-client";
import { importEmailAttachmentToInbox } from "../email-document-import";
import { getOutlookEnvironmentConfig } from "../outlook-config";
import { downloadApprovedSupplierDocument } from "../email-link-security";
import { canPerform } from "../security";
import { protectedProcedure, router } from "../_core/trpc";

function requireOutlookAdmin(role: Parameters<typeof canPerform>[0]) {
  if (!canPerform(role, "settings:manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem configurar ou importar a partir do Outlook." });
}

export const outlookRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    const environment = getOutlookEnvironmentConfig();
    const connection = await getOutlookConnectionForTenant(tenantContext.tenant.id);
    return { connection: connection ? { ...connection, refreshTokenCiphertext: undefined } : null, environmentReady: Boolean(environment.config), missingEnvironment: environment.missing };
  }),
  imports: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    return listOutlookImportRunsForTenant(tenantContext.tenant.id);
  }),
  beginAuthorization: protectedProcedure.mutation(async ({ ctx }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    requireOutlookAdmin(tenantContext.membership.role);
    const authorization = getOutlookAuthorizationForUser({ tenantId: tenantContext.tenant.id, userId: ctx.user.id });
    if (!authorization.url) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `A ligação Microsoft requer: ${authorization.missing.join(", ")}.` });
    return authorization;
  }),
  previewMessages: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(25).default(15) }).optional()).query(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    requireOutlookAdmin(tenantContext.membership.role);
    const connection = await getOutlookConnectionForTenant(tenantContext.tenant.id);
    if (!connection || connection.status !== "autorizada") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Autorize uma caixa Outlook ativa antes da pré-visualização." });
    try {
      const token = await getMicrosoftGraphAccessToken(connection);
      return listOutlookAttachmentPreviews(token, input?.limit ?? 15);
    } catch (error) {
      await updateOutlookConnectionForTenant(tenantContext.tenant.id, connection.id, { status: "erro", lastError: error instanceof Error ? error.message : "Falha desconhecida." });
      throw new TRPCError({ code: "BAD_GATEWAY", message: "Não foi possível consultar a caixa Microsoft 365." });
    }
  }),
  previewSupplierLinks: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(25).default(15) }).optional()).query(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    requireOutlookAdmin(tenantContext.membership.role);
    const connection = await getOutlookConnectionForTenant(tenantContext.tenant.id);
    if (!connection || connection.status !== "autorizada") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Autorize uma caixa Outlook ativa antes da pré-visualização." });
    try {
      const token = await getMicrosoftGraphAccessToken(connection);
      return listOutlookSupplierLinkPreviews(token, input?.limit ?? 15);
    } catch (error) {
      await updateOutlookConnectionForTenant(tenantContext.tenant.id, connection.id, { status: "erro", lastError: error instanceof Error ? error.message : "Falha desconhecida." });
      throw new TRPCError({ code: "BAD_GATEWAY", message: "Não foi possível consultar links de documentos na caixa Microsoft 365." });
    }
  }),
  importAttachments: protectedProcedure.input(z.object({ attachments: z.array(z.object({ messageId: z.string().min(1).max(255), attachmentId: z.string().min(1).max(255) })).min(1).max(20) })).mutation(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    requireOutlookAdmin(tenantContext.membership.role);
    const connection = await getOutlookConnectionForTenant(tenantContext.tenant.id);
    if (!connection || connection.status !== "autorizada") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Autorize uma caixa Outlook ativa antes de importar anexos." });
    const requested = new Set(input.attachments.map(item => `${item.messageId}:${item.attachmentId}`));
    try {
      const token = await getMicrosoftGraphAccessToken(connection);
      const preview = await listOutlookAttachmentPreviews(token, 25);
      const selected = preview.filter(item => requested.has(`${item.messageId}:${item.attachmentId}`));
      if (selected.length !== requested.size) throw new TRPCError({ code: "BAD_REQUEST", message: "Uma ou mais seleções já não são anexos elegíveis da caixa Outlook." });
      const results: Array<{ filename: string; status: "imported" | "duplicate" | "failed"; documentId?: number; error?: string }> = [];
      for (const item of selected) {
        try {
          const attachment = await downloadOutlookAttachment(token, item.messageId, item.attachmentId);
          if (!selectEligibleAttachments([attachment]).length) throw new Error("O anexo deixou de cumprir as regras de importação.");
          const result = await importEmailAttachmentToInbox({ tenant: tenantContext.tenant, userId: ctx.user.id, filename: item.filename, contentType: item.contentType, bytes: decodeAttachmentBytes(attachment), sourceAddress: item.fromAddress, sourceSubject: item.subject });
          results.push({ filename: item.filename, status: result.status, documentId: result.status === "imported" ? result.document.id : undefined });
        } catch (error) { results.push({ filename: item.filename, status: "failed", error: error instanceof Error ? error.message : "Falha desconhecida." }); }
      }
      const importedDocumentCount = results.filter(item => item.status === "imported").length;
      const failedCount = results.filter(item => item.status === "failed").length;
      const run = await createOutlookImportRun({ tenantId: tenantContext.tenant.id, outlookConnectionId: connection.id, triggeredByUserId: ctx.user.id, status: failedCount ? (importedDocumentCount ? "parcial" : "falhou") : "concluida", messageCount: new Set(selected.map(item => item.messageId)).size, attachmentCount: selected.length, importedDocumentCount, summary: { results } });
      await updateOutlookConnectionForTenant(tenantContext.tenant.id, connection.id, { lastImportedAt: new Date(), status: "autorizada", lastError: failedCount ? `${failedCount} anexo(s) não foram importados.` : null });
      await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "outlook.import_completed", resourceType: "outlookImportRun", resourceId: String(run.id), metadata: { importedDocumentCount, failedCount, attachmentCount: selected.length } });
      return { run, results };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      await updateOutlookConnectionForTenant(tenantContext.tenant.id, connection.id, { status: "erro", lastError: error instanceof Error ? error.message : "Falha desconhecida." });
      throw new TRPCError({ code: "BAD_GATEWAY", message: "Não foi possível importar os anexos selecionados do Outlook." });
    }
  }),
  importSupplierLinks: protectedProcedure.input(z.object({ links: z.array(z.object({ messageId: z.string().min(1).max(255), url: z.string().url().max(2048) })).min(1).max(10) })).mutation(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    requireOutlookAdmin(tenantContext.membership.role);
    const connection = await getOutlookConnectionForTenant(tenantContext.tenant.id);
    if (!connection || connection.status !== "autorizada") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Autorize uma caixa Outlook ativa antes de importar links." });
    try {
      const token = await getMicrosoftGraphAccessToken(connection);
      const preview = await listOutlookSupplierLinkPreviews(token, 25);
      const allowed = new Map(preview.map(item => [`${item.messageId}:${item.url}`, item]));
      const results: Array<{ hostname: string; status: "imported" | "duplicate" | "failed"; documentId?: number; error?: string }> = [];
      for (const requested of input.links) {
        const item = allowed.get(`${requested.messageId}:${requested.url}`);
        if (!item) { results.push({ hostname: "link inválido", status: "failed", error: "O link já não está disponível nas mensagens recentes ou não pertence a um fornecedor aprovado." }); continue; }
        try {
          const document = await downloadApprovedSupplierDocument({ url: item.url });
          const result = await importEmailAttachmentToInbox({ tenant: tenantContext.tenant, userId: ctx.user.id, filename: document.filename, contentType: document.contentType, bytes: document.bytes, sourceAddress: item.fromAddress, sourceSubject: item.subject, sourceKind: "link", sourceLinkHost: document.hostname });
          results.push({ hostname: document.hostname, status: result.status, documentId: result.status === "imported" ? result.document.id : undefined });
        } catch (error) { results.push({ hostname: item.hostname, status: "failed", error: error instanceof Error ? error.message : "Falha desconhecida." }); }
      }
      const importedDocumentCount = results.filter(item => item.status === "imported").length;
      const failedCount = results.filter(item => item.status === "failed").length;
      const run = await createOutlookImportRun({ tenantId: tenantContext.tenant.id, outlookConnectionId: connection.id, triggeredByUserId: ctx.user.id, status: failedCount ? (importedDocumentCount ? "parcial" : "falhou") : "concluida", messageCount: new Set(input.links.map(item => item.messageId)).size, attachmentCount: input.links.length, importedDocumentCount, summary: { source: "supplier-links", results } });
      await updateOutlookConnectionForTenant(tenantContext.tenant.id, connection.id, { lastImportedAt: new Date(), status: "autorizada", lastError: failedCount ? `${failedCount} link(s) não foram importados.` : null });
      await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "outlook.supplier_links_import_completed", resourceType: "outlookImportRun", resourceId: String(run.id), metadata: { importedDocumentCount, failedCount, linkCount: input.links.length } });
      return { run, results };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: "BAD_GATEWAY", message: "Não foi possível importar os links selecionados. O documento pode ter expirado ou exigir acesso no portal." });
    }
  }),
});
