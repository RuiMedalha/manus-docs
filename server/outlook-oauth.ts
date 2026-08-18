import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Express } from "express";
import { getOrCreateTenantContext, recordAudit, upsertOutlookConnection } from "./db";
import { buildMicrosoftAuthorizeUrl } from "./outlook-adapter";
import { getOutlookEnvironmentConfig } from "./outlook-config";
import { encryptOutlookToken } from "./outlook-crypto";

type OutlookState = { tenantId: number; userId: number; expiresAt: number; nonce: string };

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createOutlookOAuthState(input: { tenantId: number; userId: number; secret: string }) {
  const payload: OutlookState = { tenantId: input.tenantId, userId: input.userId, expiresAt: Date.now() + 10 * 60 * 1000, nonce: randomUUID() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, input.secret)}`;
}

export function verifyOutlookOAuthState(state: string, secret: string): OutlookState | null {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded, secret);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OutlookState;
    return parsed.expiresAt > Date.now() && parsed.tenantId > 0 && parsed.userId > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function getOutlookAuthorizationForUser(input: { tenantId: number; userId: number }) {
  const environment = getOutlookEnvironmentConfig();
  if (!environment.config) return { url: null, missing: environment.missing };
  const state = createOutlookOAuthState({ tenantId: input.tenantId, userId: input.userId, secret: process.env.JWT_SECRET ?? "" });
  return { url: buildMicrosoftAuthorizeUrl({ clientId: environment.config.clientId, redirectUri: environment.config.redirectUri, state, microsoftTenantId: environment.config.microsoftTenantId }), missing: [] as string[] };
}

async function exchangeCode(code: string, config: NonNullable<ReturnType<typeof getOutlookEnvironmentConfig>["config"]>) {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(config.microsoftTenantId)}/oauth2/v2.0/token`;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: config.redirectUri, grant_type: "authorization_code" }) });
  if (!response.ok) throw new Error(`A Microsoft recusou a autorização (${response.status}).`);
  return response.json() as Promise<{ refresh_token?: string; expires_in?: number; access_token: string }>;
}

export function registerOutlookOAuthRoutes(app: Express) {
  app.get("/api/outlook/callback", async (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const verified = verifyOutlookOAuthState(state, process.env.JWT_SECRET ?? "");
    const environment = getOutlookEnvironmentConfig();
    if (!verified || !code || !environment.config) return res.redirect("/outlook?status=error");
    try {
      const tokens = await exchangeCode(code, environment.config);
      if (!tokens.refresh_token) throw new Error("A Microsoft não devolveu um token renovável.");
      const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!profileResponse.ok) throw new Error("Não foi possível identificar a caixa Outlook autorizada.");
      const profile = await profileResponse.json() as { id?: string; mail?: string; userPrincipalName?: string };
      const mailboxAddress = profile.mail || profile.userPrincipalName;
      if (!mailboxAddress || !profile.id) throw new Error("A conta Microsoft não tem uma caixa de correio elegível.");
      const connection = await upsertOutlookConnection({ tenantId: verified.tenantId, connectedByUserId: verified.userId, microsoftTenantId: environment.config.microsoftTenantId, mailboxAddress, graphUserId: profile.id, refreshTokenCiphertext: encryptOutlookToken(tokens.refresh_token, process.env.JWT_SECRET ?? ""), tokenExpiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000), status: "autorizada", lastError: null });
      await recordAudit({ tenantId: verified.tenantId, actorUserId: verified.userId, action: "outlook.connected", resourceType: "outlookConnection", resourceId: String(connection?.id), metadata: { mailboxAddress } });
      return res.redirect("/outlook?status=connected");
    } catch (error) {
      console.error("[Outlook] OAuth callback failed", error);
      return res.redirect("/outlook?status=error");
    }
  });
}
