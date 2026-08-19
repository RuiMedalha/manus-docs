const OUTLOOK_SCOPES = ["openid", "profile", "offline_access", "User.Read", "Mail.Read"] as const;
const SUPPORTED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export type OutlookAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string;
  isInline?: boolean;
};

export function getOutlookScopes() {
  return [...OUTLOOK_SCOPES];
}

export function buildMicrosoftAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  microsoftTenantId?: string;
}) {
  const tenant = input.microsoftTenantId?.trim() || "common";
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", getOutlookScopes().join(" "));
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function buildMessagesUrl(top = 25, attachmentsOnly = true) {
  const safeTop = Math.max(1, Math.min(top, 50));
  const url = new URL("https://graph.microsoft.com/v1.0/me/messages");
  url.searchParams.set("$top", String(safeTop));
  if (attachmentsOnly) url.searchParams.set("$filter", "hasAttachments eq true");
  url.searchParams.set("$select", "id,subject,receivedDateTime,from,hasAttachments,bodyPreview");
  url.searchParams.set("$orderby", "receivedDateTime DESC");
  return url.toString();
}

export function buildAttachmentUrl(messageId: string, attachmentId: string) {
  return `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

export function selectEligibleAttachments(attachments: OutlookAttachment[], maxSizeBytes = 10 * 1024 * 1024) {
  return attachments.filter(attachment =>
    Boolean(attachment.id && attachment.name) &&
    !attachment.isInline &&
    SUPPORTED_DOCUMENT_TYPES.has(attachment.contentType) &&
    attachment.size > 0 &&
    attachment.size <= maxSizeBytes,
  );
}

export function decodeAttachmentBytes(attachment: OutlookAttachment) {
  if (!attachment.contentBytes) throw new Error("O anexo Outlook não inclui conteúdo para importação.");
  return Buffer.from(attachment.contentBytes, "base64");
}
