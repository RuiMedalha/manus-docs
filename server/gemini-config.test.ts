import { describe, expect, it } from "vitest";
import { DEFAULT_GEMINI_VISION_MODEL, getGeminiRuntimeConfig } from "./gemini-config";

describe("getGeminiRuntimeConfig", () => {
  it("uses the cheapest configured vision default without activating the provider", () => {
    expect(getGeminiRuntimeConfig({})).toMatchObject({
      enabled: false,
      configured: false,
      model: DEFAULT_GEMINI_VISION_MODEL,
    });
  });

  it("only enables Gemini when an administrator configures both the switch and a key", () => {
    expect(getGeminiRuntimeConfig({ GEMINI_ENABLED: "true" }).enabled).toBe(false);
    expect(
      getGeminiRuntimeConfig({
        GEMINI_ENABLED: "true",
        GEMINI_API_KEY: "test-key",
        GEMINI_MODEL: "gemini-3.7-flash",
      }),
    ).toMatchObject({ enabled: true, configured: true, model: "gemini-3.7-flash" });
  });

  it("keeps document size and daily limits within safe bounds", () => {
    expect(
      getGeminiRuntimeConfig({
        GEMINI_MAX_DOCUMENT_BYTES: "999999999",
        GEMINI_DAILY_DOCUMENT_LIMIT: "999999",
      }),
    ).toMatchObject({ maxDocumentBytes: 10 * 1024 * 1024, dailyDocumentLimit: 10_000 });
  });
});
