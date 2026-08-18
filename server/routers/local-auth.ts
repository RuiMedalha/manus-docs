import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { parse } from "cookie";
import { z } from "zod";
import * as db from "../db";
import { createPasswordReset, createRefreshSession, hashOpaqueToken, LOCAL_REFRESH_COOKIE, registerLocalAccount, resetLocalPassword, verifyLocalPassword } from "../local-auth";
import { sendPasswordResetWithSes } from "../ses-email";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { publicProcedure, router } from "../_core/trpc";

const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const credentialsSchema = z.object({ email: z.string().email("Indique um email válido."), password: z.string().min(1) });

async function issueLocalCookies(ctx: { req: any; res: any }, user: { id: number; openId: string; tenantId: number; name: string | null; email: string | null }) {
  const tenant = await db.getOrCreateTenantContext(user);
  const { refreshToken } = await createRefreshSession({ tenantId: tenant.tenant.id, userId: user.id });
  const accessToken = await sdk.createSessionToken(user.openId, { name: user.name ?? user.email ?? "Utilizador", expiresInMs: ACCESS_TTL_MS });
  const options = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, accessToken, { ...options, maxAge: ACCESS_TTL_MS });
  ctx.res.cookie(LOCAL_REFRESH_COOKIE, refreshToken, { ...options, maxAge: REFRESH_TTL_MS });
  return { user, tenantId: tenant.tenant.id };
}

export const localAuthRouter = router({
  register: publicProcedure.input(credentialsSchema.extend({ name: z.string().trim().min(2).max(160) })).mutation(async ({ ctx, input }) => {
    try {
      const user = await registerLocalAccount(input);
      return await issueLocalCookies(ctx, user);
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível criar a conta." });
    }
  }),
  login: publicProcedure.input(credentialsSchema).mutation(async ({ ctx, input }) => {
    try {
      const credential = await verifyLocalPassword(input);
      if (!credential) throw new Error("Email ou palavra-passe incorretos.");
      const result = await issueLocalCookies(ctx, credential.user);
      await db.recordAudit({ tenantId: result.tenantId, actorUserId: credential.user.id, action: "auth.local_login", resourceType: "user", resourceId: String(credential.user.id) });
      return result;
    } catch (error) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: error instanceof Error ? error.message : "Não foi possível iniciar sessão." });
    }
  }),
  refresh: publicProcedure.mutation(async ({ ctx }) => {
    const token = parse(ctx.req.headers.cookie ?? "")[LOCAL_REFRESH_COOKIE];
    const session = token ? await db.getLocalAuthSessionByHash(hashOpaqueToken(token)) : null;
    if (!session || session.revokedAt || session.expiresAt < new Date()) throw new TRPCError({ code: "UNAUTHORIZED", message: "A sessão expirou. Inicie sessão novamente." });
    await db.revokeLocalAuthSession(session.id);
    return issueLocalCookies(ctx, session.user);
  }),
  requestPasswordReset: publicProcedure.input(z.object({ email: z.string().email() })).mutation(async ({ ctx, input }) => {
    const reset = await createPasswordReset(input.email);
    if (reset) {
      const configuredOrigin = process.env.APP_BASE_URL?.replace(/\/$/, "");
      const requestOrigin = `${ctx.req.protocol ?? "https"}://${ctx.req.get?.("host") ?? ctx.req.headers.host ?? "localhost"}`;
      const resetUrl = `${configuredOrigin ?? requestOrigin}/acesso?reset=${encodeURIComponent(reset.token)}`;
      await sendPasswordResetWithSes({ to: input.email, resetUrl });
    }
    return { success: true };
  }),
  resetPassword: publicProcedure.input(z.object({ token: z.string().min(24), password: z.string().min(1) })).mutation(async ({ input }) => {
    try {
      await resetLocalPassword(input);
      return { success: true };
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível repor a palavra-passe." });
    }
  }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const token = parse(ctx.req.headers.cookie ?? "")[LOCAL_REFRESH_COOKIE];
    if (token) {
      const session = await db.getLocalAuthSessionByHash(hashOpaqueToken(token));
      if (session) await db.revokeLocalAuthSession(session.id);
    }
    const options = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...options, maxAge: -1 });
    ctx.res.clearCookie(LOCAL_REFRESH_COOKIE, { ...options, maxAge: -1 });
    return { success: true };
  }),
});
