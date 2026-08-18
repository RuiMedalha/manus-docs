import { describe, expect, it } from "vitest";
import { assertPasswordPolicy, hashOpaqueToken, normaliseEmail } from "./local-auth";

describe("autenticação local", () => {
  it("normaliza emails e produz hashes opacos determinísticos", () => {
    expect(normaliseEmail("  Rui@EXAMPLE.com ")).toBe("rui@example.com");
    expect(hashOpaqueToken("token-a")).toBe(hashOpaqueToken("token-a"));
    expect(hashOpaqueToken("token-a")).not.toBe(hashOpaqueToken("token-b"));
  });
  it("exige uma palavra-passe longa com letras e números", () => {
    expect(() => assertPasswordPolicy("curta1")).toThrow();
    expect(() => assertPasswordPolicy("apenasletraslongas")).toThrow();
    expect(() => assertPasswordPolicy("PalavraSecreta2026")).not.toThrow();
  });
});
