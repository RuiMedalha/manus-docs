import type { Request, Response } from "express";
import { getOcrProcessingConfigByTaskUid } from "./db";
import { processOcrBatch } from "./ocr-processor";
import { sdk } from "./_core/sdk";

export async function processScheduledOcr(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const config = await getOcrProcessingConfigByTaskUid(user.taskUid);
    if (!config || !config.automaticEnabled) return res.json({ ok: true, skipped: "disabled_or_orphan" });
    const results = await processOcrBatch(config.tenantId, config.batchSize);
    return res.json({ ok: true, processed: results.filter(result => result.status !== "empty").length, results: results.map(result => result.status) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return res.status(500).json({ error: message, timestamp: new Date().toISOString(), context: { url: req.originalUrl } });
  }
}
