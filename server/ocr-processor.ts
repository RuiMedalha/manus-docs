import { claimNextDocumentProcessingJob, completeDocumentProcessingJob, failDocumentProcessingJob, getDocumentForTenant, recordAudit } from "./db";
import mammoth from "mammoth";
import { ocrOutputSchema, parseOcrSuggestion, type OcrSuggestion } from "./ocr-classification";
import { invokeLLM } from "./_core/llm";
import { storageGetSignedUrl } from "./storage";

const extractionInstruction = `És um assistente de classificação documental e contabilística em português. Lê apenas o ficheiro fornecido e devolve metadados estruturados; nunca inventes valores, NIF, IVA, totais ou datas. Usa null quando um campo não estiver legível. Converte dinheiro para cêntimos inteiros, datas ISO YYYY-MM-DD e moeda ISO de três letras.

Classifica primeiro o tipo documental: usa fatura_recebida apenas para documentos de compra com fatura, fatura_emitida para vendas faturadas, recibo para recibos, comprovativo para pagamentos ou extratos comprovativos e encomenda para pedidos de compra. Uma nota de envio, guia de transporte, packing list ou documento logístico sem valor faturado deve ficar como outro, nunca como fatura.

Depois avalia accountingNature: despesa, receita, imposto, tesouraria, suporte_operacional, sem_relevancia_contabilistica ou requer_revisao. Para uma nota de envio/guia logística, usa normalmente suporte_operacional e operacoes_logistica; para fatura de fornecedor, despesa e contabilidade_compras; para fatura emitida, receita e contabilidade_vendas; para comprovativos bancários, tesouraria e contabilidade_tesouraria. Se a evidência for insuficiente, usa requer_revisao e a_rever.

accountingSummary explica em uma frase a natureza do documento, sem aconselhamento fiscal. archiveReason explica em uma frase por que a área de arquivo proposta é adequada. requiresAccountingReview deve ser true para documentos contabilísticos, valores incertos ou classificações a rever. entityRole é fornecedor para faturas recebidas, cliente para faturas emitidas e desconhecido quando não há evidência. O texto OCR contém uma transcrição curta dos elementos relevantes.`;

export async function classifyDocument(document: { fileKey: string; contentType: string; originalFilename: string }): Promise<OcrSuggestion> {
  const signedUrl = await storageGetSignedUrl(document.fileKey);
  if (document.contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error("Não foi possível obter o DOCX para extração.");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(await response.arrayBuffer()) });
    if (!result.value.trim()) throw new Error("O DOCX não contém texto legível para classificação.");
    return invokeStructuredClassification(document.originalFilename, [{ type: "text", text: `Classifica o documento ${document.originalFilename}. Conteúdo extraído do DOCX:\n${result.value.slice(0, 12_000)}` }]);
  }
  const filePart = document.contentType === "application/pdf"
    ? { type: "file_url" as const, file_url: { url: signedUrl, mime_type: "application/pdf" as const } }
    : { type: "image_url" as const, image_url: { url: signedUrl, detail: "high" as const } };
  return invokeStructuredClassification(document.originalFilename, [{ type: "text", text: `Classifica o documento ${document.originalFilename}.` }, filePart]);
}

async function invokeStructuredClassification(filename: string, parts: Array<{ type: "text"; text: string } | { type: "file_url"; file_url: { url: string; mime_type: "application/pdf" } } | { type: "image_url"; image_url: { url: string; detail: "high" } }>): Promise<OcrSuggestion> {
  const response = await invokeLLM({
    model: "gemini-3-flash-preview",
    maxTokens: 4000,
    messages: [
      { role: "system", content: extractionInstruction },
      { role: "user", content: parts },
    ],
    outputSchema: ocrOutputSchema,
  });
  const completionText = response.choices[0]?.message.content;
  if (typeof completionText !== "string") throw new Error("O modelo não devolveu uma classificação textual.");
  return parseOcrSuggestion(JSON.parse(completionText));
}

export async function processNextOcrJob(tenantId: number) {
  const job = await claimNextDocumentProcessingJob(tenantId);
  if (!job) return { status: "empty" as const };
  try {
    const document = await getDocumentForTenant(tenantId, job.documentId);
    if (!document) throw new Error("O documento já não está disponível nesta organização.");
    const suggestion = await classifyDocument(document);
    const completed = await completeDocumentProcessingJob(tenantId, job.id, { extractedText: suggestion.ocrText, suggestion, confidence: suggestion.confidence });
    await recordAudit({ tenantId, actorUserId: job.requestedByUserId, action: "ocr.completed", resourceType: "documentProcessingJob", resourceId: String(job.id), metadata: { documentId: job.documentId, confidence: suggestion.confidence } });
    return { status: "completed" as const, job: completed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no OCR.";
    const failed = await failDocumentProcessingJob(tenantId, job.id, message);
    await recordAudit({ tenantId, actorUserId: job.requestedByUserId, action: "ocr.failed", resourceType: "documentProcessingJob", resourceId: String(job.id), metadata: { documentId: job.documentId, message } });
    return { status: "failed" as const, job: failed, message };
  }
}

export async function processOcrBatch(tenantId: number, batchSize: number) {
  const results = [] as Array<Awaited<ReturnType<typeof processNextOcrJob>>>;
  for (let index = 0; index < Math.max(1, Math.min(batchSize, 5)); index += 1) {
    const result = await processNextOcrJob(tenantId);
    results.push(result);
    if (result.status === "empty") break;
  }
  return results;
}
