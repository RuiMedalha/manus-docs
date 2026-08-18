import { describe, expect, it } from "vitest";
import { createOutlookOAuthState, verifyOutlookOAuthState } from "./outlook-oauth";

describe("estado OAuth Microsoft", () => {
  it("assina e valida o tenant e utilizador que iniciaram a autorização", () => {
    const state = createOutlookOAuthState({ tenantId: 9, userId: 4, secret: "test-secret" });
    expect(verifyOutlookOAuthState(state, "test-secret")).toMatchObject({ tenantId: 9, userId: 4 });
  });
  it("rejeita estados alterados e assinados por uma chave diferente", () => {
    const state = createOutlookOAuthState({ tenantId: 9, userId: 4, secret: "test-secret" });
    expect(verifyOutlookOAuthState(`${state}x`, "test-secret")).toBeNull();
    expect(verifyOutlookOAuthState(state, "other-secret")).toBeNull();
  });
});
