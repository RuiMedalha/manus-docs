import { decryptOutlookToken, encryptOutlookToken } from "./outlook-crypto";
import { buildAttachmentUrl, buildMessagesUrl, selectEligibleAttachments, type OutlookAttachment } from "./outlook-adapter";
import { getOutlookEnvironmentConfig } from "./outlook-config";
import { updateOutlookConnectionForTenant } from "./db";
import { extractSupplierInvoiceLinks } from "./email-link-security";

export type OutlookAttachmentPreview = {
  messageId: string;
  attachmentId: string;
  filename: string;
  contentType: string;
  size: number;
  subject: string;
  fromAddress: string | null;
  receivedAt: string | null;
};

export type OutlookSupplierLinkPreview = {
  messageId: string;
  url: string;
  hostname: string;
  provider: "Moloni" | "TOConline";
  subject: string;
  fromAddress: string | null;
  receivedAt: string | null;
};

type GraphMessage = { id: string; subject?: string; bodyPreview?: string; receivedDateTime?: string; from?: { emailAddress?: { address?: string } } };
type TokenConnection = { id: number; tenantId: number; refreshTokenCiphertext: string | null; microsoftTenantId: string | null };

async function graphJson<T>(accessToken: string, url: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  if (!response.ok) throw new Error(`A Microsoft Graph devolveu o estado ${response.status}.`);
  return response.json() as Promise<T>;
}

export async function getMicrosoftGraphAccessToken(connection: TokenConnection) {
  const environment = getOutlookEnvironmentConfig();
  if (!environment.config || !connection.refreshTokenCiphertext) throw new Error("A ligação Outlook não tem credenciais válidas no servidor.");
  const refreshToken = decryptOutlookToken(connection.refreshTokenCiphertext, process.env.JWT_SECRET ?? "");
  const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(connection.microsoftTenantId || environment.config.microsoftTenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: environment.config.clientId, client_secret: environment.config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token", scope: "openid profile offline_access User.Read Mail.Read" }),
  });
  if (!tokenResponse.ok) throw new Error(`Não foi possível renovar a autorização Microsoft (${tokenResponse.status}).`);
  const token = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!token.access_token) throw new Error("A Microsoft não devolveu um token de acesso válido.");
  await updateOutlookConnectionForTenant(connection.tenantId, connection.id, {
    status: "autorizada",
    refreshTokenCiphertext: token.refresh_token ? encryptOutlookToken(token.refresh_token, process.env.JWT_SECRET ?? "") : connection.refreshTokenCiphertext,
    tokenExpiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
    lastError: null,
  });
  return token.access_token;
}

export async function listOutlookAttachmentPreviews(accessToken: string, top = 20): Promise<OutlookAttachmentPreview[]> {
  const messages = await graphJson<{ value?: GraphMessage[] }>(accessToken, buildMessagesUrl(top));
  const attachmentRows = await Promise.all((messages.value ?? []).map(async message => {
    const result = await graphJson<{ value?: OutlookAttachment[] }>(accessToken, `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(message.id)}/attachments?$select=id,name,contentType,size,isInline`);
    return selectEligibleAttachments(result.value ?? []).map(attachment => ({
      messageId: message.id,
      attachmentId: attachment.id,
      filename: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size,
      subject: message.subject?.trim() || "(sem assunto)",
      fromAddress: message.from?.emailAddress?.address ?? null,
      receivedAt: message.receivedDateTime ?? null,
    }));
  }));
  return attachmentRows.flat();
}

export async function listOutlookSupplierLinkPreviews(accessToken: string, top = 20): Promise<OutlookSupplierLinkPreview[]> {
  const messages = await graphJson<{ value?: GraphMessage[] }>(accessToken, buildMessagesUrl(top, false));
  return (messages.value ?? []).flatMap(message => extractSupplierInvoiceLinks(`${message.subject ?? ""}\n${message.bodyPreview ?? ""}`).map(link => ({
    messageId: message.id,
    ...link,
    subject: message.subject?.trim() || "(sem assunto)",
    fromAddress: message.from?.emailAddress?.address ?? null,
    receivedAt: message.receivedDateTime ?? null,
  })));
}

export async function downloadOutlookAttachment(accessToken: string, messageId: string, attachmentId: string) {
  return graphJson<OutlookAttachment>(accessToken, buildAttachmentUrl(messageId, attachmentId));
}
