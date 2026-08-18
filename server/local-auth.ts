import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import * as db from "./db";

const PASSWORD_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const REFRESH_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_DURATION_MS = 30 * 60 * 1000;

export const LOCAL_REFRESH_COOKIE = "docuflux_refresh";

export function normaliseEmail(email: string) {
  return email.trim().toLocaleLowerCase("en-US");
}

export function assertPasswordPolicy(password: string) {
  if (password.length < 12) throw new Error("A palavra-passe deve ter pelo menos 12 caracteres.");
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) throw new Error("A palavra-passe deve incluir letras e números.");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function registerLocalAccount(input: { email: string; password: string; name: string }) {
  const email = normaliseEmail(input.email);
  assertPasswordPolicy(input.password);
  if (await db.getLocalCredentialByEmail(email)) throw new Error("Já existe uma conta local com este email.");
  const passwordHash = await bcrypt.hash(input.password, PASSWORD_ROUNDS);
  const user = await db.createLocalUser({ openId: `local:${randomUUID()}`, email, name: input.name.trim() || email.split("@")[0]!, loginMethod: "local" });
  const tenantContext = await db.getOrCreateTenantContext(user);
  await db.createLocalCredential({ tenantId: tenantContext.tenant.id, userId: user.id, email, passwordHash });
  await db.recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: user.id, action: "auth.local_registered", resourceType: "user", resourceId: String(user.id) });
  return user;
}

export async function verifyLocalPassword(input: { email: string; password: string }) {
  const email = normaliseEmail(input.email);
  const credential = await db.getLocalCredentialByEmail(email);
  if (!credential) return null;
  if (credential.lockedUntil && credential.lockedUntil > new Date()) throw new Error("A conta está temporariamente bloqueada. Tente novamente dentro de alguns minutos.");
  const valid = await bcrypt.compare(input.password, credential.passwordHash);
  if (!valid) {
    const attempts = credential.failedAttempts + 1;
    await db.updateLocalCredentialSecurity(credential.id, { failedAttempts: attempts, lockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS) : null });
    return null;
  }
  await db.updateLocalCredentialSecurity(credential.id, { failedAttempts: 0, lockedUntil: null });
  return credential;
}

export async function createRefreshSession(input: { tenantId: number; userId: number }) {
  const token = randomBytes(48).toString("base64url");
  const session = await db.createLocalAuthSession({ tenantId: input.tenantId, userId: input.userId, refreshTokenHash: hashOpaqueToken(token), expiresAt: new Date(Date.now() + REFRESH_DURATION_MS) });
  return { session, refreshToken: token };
}

export async function createPasswordReset(emailInput: string) {
  const credential = await db.getLocalCredentialByEmail(normaliseEmail(emailInput));
  if (!credential) return null;
  const token = randomBytes(32).toString("base64url");
  await db.updateLocalCredentialReset(credential.id, { resetTokenHash: hashOpaqueToken(token), resetExpiresAt: new Date(Date.now() + RESET_DURATION_MS) });
  return { credential, token };
}

export async function resetLocalPassword(input: { token: string; password: string }) {
  assertPasswordPolicy(input.password);
  const credential = await db.getLocalCredentialByResetHash(hashOpaqueToken(input.token));
  if (!credential || !credential.resetExpiresAt || credential.resetExpiresAt < new Date()) throw new Error("O pedido de reposição expirou ou é inválido.");
  await db.updateLocalCredentialPassword(credential.id, await bcrypt.hash(input.password, PASSWORD_ROUNDS));
  await db.revokeAllLocalAuthSessions(credential.userId);
  return credential;
}
