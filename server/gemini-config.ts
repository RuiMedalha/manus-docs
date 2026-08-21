export const DEFAULT_GEMINI_VISION_MODEL = "gemini-3.1-flash-lite";
export const MAX_GEMINI_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type GeminiRuntimeConfig = {
  enabled: boolean;
  configured: boolean;
  model: string;
  maxDocumentBytes: number;
  dailyDocumentLimit: number;
};

export function getGeminiRuntimeConfig(env: Record<string, string | undefined>): GeminiRuntimeConfig {
  const maxDocumentBytes = Number(env.GEMINI_MAX_DOCUMENT_BYTES ?? MAX_GEMINI_DOCUMENT_BYTES);
  const dailyDocumentLimit = Number(env.GEMINI_DAILY_DOCUMENT_LIMIT ?? 50);
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_VISION_MODEL;
  const configured = Boolean(env.GEMINI_API_KEY?.trim());

  return {
    enabled: env.GEMINI_ENABLED === "true" && configured,
    configured,
    model,
    maxDocumentBytes:
      Number.isSafeInteger(maxDocumentBytes) && maxDocumentBytes > 0
        ? Math.min(maxDocumentBytes, MAX_GEMINI_DOCUMENT_BYTES)
        : MAX_GEMINI_DOCUMENT_BYTES,
    dailyDocumentLimit:
      Number.isSafeInteger(dailyDocumentLimit) && dailyDocumentLimit > 0
        ? Math.min(dailyDocumentLimit, 10_000)
        : 50,
  };
}
