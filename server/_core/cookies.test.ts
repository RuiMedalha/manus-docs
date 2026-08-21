import { afterEach, describe, expect, it, vi } from "vitest";
import { getSessionCookieOptions } from "./cookies";

const request = (protocol: string, forwardedProto?: string) => ({
  protocol,
  headers: forwardedProto ? { "x-forwarded-proto": forwardedProto } : {},
}) as never;

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  vi.unstubAllEnvs();
});

describe("cookies de sessão", () => {
  it("usa cookie seguro e SameSite Lax em produção atrás do Coolify", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(getSessionCookieOptions(request("http"))).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });

  it("reconhece HTTPS encaminhado por proxy fora de produção", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(getSessionCookieOptions(request("http", "https"))).toMatchObject({
      sameSite: "lax",
      secure: true,
    });
  });
});
