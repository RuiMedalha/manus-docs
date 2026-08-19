import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { captureStageMessage, documentTypeFromAtCode, readQrFromImage, type AtQrDocument, type CaptureStage } from "@/lib/at-qr";
import { applyAtQrToCaptureFields, buildUploadMetadata, captureStageForQrResult, captureStageForSelectedFile } from "@/lib/capture-flow";
import { validDocumentId } from "@/lib/document-id";
import {
  Bot,
  CheckCircle2,
  Eye,
  FileUp,
  Filter,
  FolderOpen,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Play,
  Search,
  Sparkles,
  UploadCloud,
  Wand2,
} from "lucide-react";
import React, { ChangeEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const typeLabels: Record<string, string> = {
  fatura_recebida: "Fatura recebida",
  fatura_emitida: "Fatura emitida",
  recibo: "Recibo",
  comprovativo: "Comprovativo",
  encomenda: "Encomenda",
  outro: "Outro",
};
const statusLabels: Record<string, string> = {
  novo: "Novo",
  processado: "Processado",
  em_revisao: "Em revisão",
  arquivado: "Arquivado",
};
const ocrStatus: Record<string, string> = {
  pendente: "Na fila",
  em_processamento: "A processar",
  concluido: "Sugestão pronta",
  falhou: "Falhou",
  ignorado: "Ignorado",
};
const accepted =
  "application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type DocumentType =
  | "fatura_recebida"
  | "fatura_emitida"
  | "recibo"
  | "comprovativo"
  | "encomenda"
  | "outro";
type DocumentStatus = "novo" | "processado" | "em_revisao" | "arquivado";

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () =>
      reject(new Error("Não foi possível ler o ficheiro."));
    reader.readAsDataURL(file);
  });
}
function toCents(value: string) {
  return value ? Math.round(Number(value.replace(",", ".")) * 100) : null;
}
function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function text(value: unknown) {
  return typeof value === "string" && value ? value : "—";
}
function euros(value: unknown) {
  return typeof value === "number"
    ? new Intl.NumberFormat("pt-PT", {
        style: "currency",
        currency: "EUR",
      }).format(value / 100)
    : "—";
}
function maskSupplierLink(value: string) {
  try {
    const url = new URL(value);
    const path = url.pathname.length > 36 ? `${url.pathname.slice(0, 33)}…` : url.pathname;
    return `${url.hostname}${path}`;
  } catch {
    return "Link de fornecedor";
  }
}

export default function InboxPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | DocumentStatus>("all");
  const [documentType, setDocumentType] = useState<DocumentType>("outro");
  const [entityName, setEntityName] = useState("");
  const [nif, setNif] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [total, setTotal] = useState("");
  const [atQr, setAtQr] = useState<AtQrDocument | null>(null);
  const [qrScanState, setQrScanState] = useState<"idle" | "reading" | "found" | "not_found">("idle");
  const [captureStage, setCaptureStage] = useState<CaptureStage>("idle");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [reviewJobId, setReviewJobId] = useState<number | null>(null);
  const [reviewFolder, setReviewFolder] = useState("");
  const [moveDocument, setMoveDocument] = useState<{ id: number; name: string; folder: string } | null>(null);
  const [manualFolder, setManualFolder] = useState("");
  const [selectedOcrIds, setSelectedOcrIds] = useState<number[]>([]);
  const [emailLinkReviewRequested, setEmailLinkReviewRequested] = useState(false);
  const [selectedEmailLinks, setSelectedEmailLinks] = useState<string[]>([]);
  const [editType, setEditType] = useState<DocumentType>("outro");
  const [editStatus, setEditStatus] = useState<DocumentStatus>("novo");
  const [editEntity, setEditEntity] = useState("");
  const [editNif, setEditNif] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editDocumentDate, setEditDocumentDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editTotal, setEditTotal] = useState("");
  const [editVat, setEditVat] = useState("");
  const [editCurrency, setEditCurrency] = useState("EUR");
  const [editTags, setEditTags] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const utils = trpc.useUtils();
  const selectedDocumentId = validDocumentId(selectedId);
  const editingDocumentId = validDocumentId(editId);
  const documents = trpc.documents.list.useQuery({
    status: status === "all" ? undefined : status,
    query: query || undefined,
  });
  const detail = trpc.documents.get.useQuery(
    { id: selectedDocumentId ?? 1 },
    { enabled: selectedDocumentId !== null }
  );
  const editDetail = trpc.documents.get.useQuery(
    { id: editingDocumentId ?? 1 },
    { enabled: editingDocumentId !== null }
  );
  const ocrConfig = trpc.ocr.config.useQuery();
  const ocrJobs = trpc.ocr.jobs.useQuery();
  const tenantContext = trpc.tenant.context.useQuery();
  const outlookStatus = trpc.outlook.status.useQuery();
  const emailLinks = trpc.outlook.previewSupplierLinks.useQuery(undefined, { enabled: Boolean(outlookStatus.data?.connection) && emailLinkReviewRequested });
  const jobsByDocument = useMemo(() => {
    const map = new Map<number, any>();
    for (const job of ocrJobs.data ?? [])
      if (!map.has(job.documentId)) map.set(job.documentId, job);
    return map;
  }, [ocrJobs.data]);
  const existingFolders = useMemo(() => Array.from(new Set((documents.data ?? []).map(doc => doc.finalFolder || doc.suggestedFolder).filter((folder): folder is string => Boolean(folder)))).sort((a, b) => a.localeCompare(b)), [documents.data]);
  const reviewJob = ocrJobs.data?.find(job => job.id === reviewJobId);
  const suggestion = record(reviewJob?.suggestion);
  const selectedEmailLinkItems = (emailLinks.data ?? []).filter(link => selectedEmailLinks.includes(`${link.messageId}:${link.url}`)).map(link => ({ messageId: link.messageId, url: link.url }));
  const invalidateOcr = () => {
    utils.ocr.jobs.invalidate();
    utils.documents.list.invalidate();
  };
  const processNow = trpc.ocr.processNow.useMutation({
    onSuccess: result => {
      toast.success("Ciclo OCR terminado.", {
        description: `${result.queuedDocumentCount} fatura(s) colocada(s) na fila; ${result.results.filter(item => item.status === "completed").length} sugestão(ões) preparada(s).`,
      });
      invalidateOcr();
    },
    onError: error => toast.error(error.message),
  });
  const queue = trpc.ocr.queue.useMutation({
    onSuccess: result => {
      toast.success(
        `${result.jobs.length} documento(s) colocado(s) na fila OCR.`
      );
      invalidateOcr();
    },
    onError: error => toast.error(error.message),
  });
  const queueAndProcess = (ids: number[]) =>
    queue.mutate(
      { documentIds: ids },
      {
        onSuccess: () => {
          setSelectedOcrIds([]);
          processNow.mutate({
            batchSize: Math.min(Math.max(ids.length, 1), 5),
          });
        },
      }
    );
  const upload = trpc.documents.upload.useMutation({
    onSuccess: data => {
      toast.success("Documento guardado. A analisar fornecedor, total, IVA e classificação…");
      setSelectedFile(null);
      setEntityName("");
      setNif("");
      setDocumentNumber("");
      setDocumentDate("");
      setTotal("");
      setDocumentType("outro");
      setAtQr(null);
      setQrScanState("idle");
      setCaptureStage("uploading");
      invalidateOcr();
      processUploadedDocument.mutate({ documentId: data.document.id });
    },
    onError: error => toast.error(error.message),
  });
  const processUploadedDocument = trpc.ocr.processDocument.useMutation({
    onSuccess: result => {
      setCaptureStage("ocr_queued");
      invalidateOcr();
      if (result.status === "completed" && result.job) {
        setReviewJobId(result.job.id);
        toast.success("Análise pronta. Confirme agora fornecedor, total, IVA e classificação.");
      } else {
        toast.error("A análise não ficou concluída. Reveja o estado OCR na Inbox.");
      }
    },
    onError: error => {
      setCaptureStage("ocr_queued");
      toast.error(`Documento guardado, mas a análise automática falhou: ${error.message}`);
      invalidateOcr();
    },
  });
  const applySuggestion = trpc.ocr.applySuggestion.useMutation({
    onSuccess: () => {
      toast.success("Sugestão OCR aplicada. O documento ficou em revisão.");
      setReviewJobId(null);
      invalidateOcr();
    },
    onError: error => toast.error(error.message),
  });
  const updateMetadata = trpc.documents.updateMetadata.useMutation({
    onSuccess: () => {
      toast.success("Metadados atualizados.");
      setEditId(null);
      utils.documents.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const moveFolder = trpc.documents.moveFolder.useMutation({
    onSuccess: () => {
      toast.success("Pasta atualizada.");
      setMoveDocument(null);
      setManualFolder("");
      utils.documents.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const automatic = trpc.ocr.enableAutomatic.useMutation({
    onSuccess: () => {
      toast.success("Processamento automático ativado.");
      utils.ocr.config.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const disableAutomatic = trpc.ocr.disableAutomatic.useMutation({
    onSuccess: () => {
      toast.success("Processamento automático desativado.");
      utils.ocr.config.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const importEmailLinks = trpc.outlook.importSupplierLinks.useMutation({
    onSuccess: data => {
      const imported = data.results.filter(result => result.status === "imported").length;
      toast.success(`${imported} documento(s) de link enviados para a Inbox.`);
      setSelectedEmailLinks([]);
      emailLinks.refetch();
      invalidateOcr();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (detail.data?.fileUrl) {
      window.open(detail.data.fileUrl, "_blank", "noopener,noreferrer");
      setSelectedId(null);
    }
  }, [detail.data?.fileUrl]);
  useEffect(() => {
    if (!editDetail.data) return;
    setEditType(editDetail.data.documentType);
    setEditStatus(editDetail.data.status);
    setEditEntity(editDetail.data.entityName ?? "");
    setEditNif(editDetail.data.nif ?? "");
    setEditNumber(editDetail.data.documentNumber ?? "");
    setEditDocumentDate(editDetail.data.documentDate ?? "");
    setEditDueDate(editDetail.data.dueDate ?? "");
    setEditTotal(
      editDetail.data.totalCents === null
        ? ""
        : ((editDetail.data.totalCents ?? 0) / 100).toFixed(2)
    );
    setEditVat(
      editDetail.data.vatCents === null
        ? ""
        : ((editDetail.data.vatCents ?? 0) / 100).toFixed(2)
    );
    setEditCurrency(editDetail.data.currency ?? "EUR");
    setEditTags(
      Array.isArray(editDetail.data.tags)
        ? editDetail.data.tags
            .filter((tag): tag is string => typeof tag === "string")
            .join(", ")
        : ""
    );
    setEditFolder(
      editDetail.data.finalFolder ?? editDetail.data.suggestedFolder ?? ""
    );
  }, [editDetail.data]);
  useEffect(() => {
    if (!suggestion) return;
    const proposedFolder = text(suggestion.archiveFolder);
    setReviewFolder(proposedFolder === "—" ? "" : proposedFolder);
  }, [reviewJobId, reviewJob?.suggestion]);
  const handleUpload = async () => {
    if (!selectedFile) return toast.error("Selecione um ficheiro primeiro.");
    if (selectedFile.size > 10 * 1024 * 1024)
      return toast.error("O ficheiro excede o limite de 10 MB.");
    const totalCents = total ? toCents(total) : undefined;
    if (
      totalCents !== undefined &&
      (totalCents === null || !Number.isFinite(totalCents) || totalCents < 0)
    )
      return toast.error("Indique um valor válido.");
    setCaptureStage("uploading");
    const captureMetadata = buildUploadMetadata({ documentType, nif, documentNumber, documentDate });
    upload.mutate({
      filename: selectedFile.name,
      contentType: selectedFile.type,
      base64: await toBase64(selectedFile),
      documentType: captureMetadata.documentType,
      entityName: entityName || undefined,
      nif: captureMetadata.nif,
      documentNumber: captureMetadata.documentNumber,
      documentDate: captureMetadata.documentDate,
      totalCents: totalCents ?? undefined,
    });
  };
  const handleFileChosen = async (file: File | null) => {
    setSelectedFile(file);
    setAtQr(null);
    if (!file || !file.type.startsWith("image/")) {
      setQrScanState("idle");
      setCaptureStage(captureStageForSelectedFile(file));
      return;
    }
    setQrScanState("reading");
    setCaptureStage("reading_qr");
    try {
      const qr = await readQrFromImage(file);
      if (!qr) {
        setQrScanState("not_found");
        setCaptureStage(captureStageForQrResult(null));
        return;
      }
      setAtQr(qr);
      setQrScanState("found");
      setCaptureStage(captureStageForQrResult(qr));
      const populated = applyAtQrToCaptureFields({ documentType, nif, documentNumber, documentDate }, qr);
      setNif(populated.nif);
      setDocumentNumber(populated.documentNumber);
      setDocumentDate(populated.documentDate);
      setDocumentType(populated.documentType);
      toast.success("QR Code AT lido. Confirme os dados antes de guardar.");
    } catch {
      setQrScanState("not_found");
      setCaptureStage("qr_not_found");
    }
  };
  const maxOcrBatch = 20;
  const toggleSelection = (id: number) =>
    setSelectedOcrIds(previous => {
      if (previous.includes(id)) return previous.filter(item => item !== id);
      if (previous.length >= maxOcrBatch) {
        toast.error("O processamento em lote está limitado a 20 documentos.");
        return previous;
      }
      return [...previous, id];
    });
  const toggleAll = () => {
    const ids = (documents.data?.map(doc => doc.id) ?? []).slice(
      0,
      maxOcrBatch
    );
    const allVisibleSelected =
      ids.length > 0 && ids.every(id => selectedOcrIds.includes(id));
    setSelectedOcrIds(allVisibleSelected ? [] : ids);
    if ((documents.data?.length ?? 0) > maxOcrBatch)
      toast.info(
        "Foram selecionados os primeiros 20 documentos, o máximo por ciclo OCR."
      );
  };
  const beginManualMove = (document: { id: number; originalFilename: string; finalFolder: string | null; suggestedFolder: string | null }) => {
    const folder = document.finalFolder || document.suggestedFolder || "/";
    setMoveDocument({ id: document.id, name: document.originalFilename, folder });
    setManualFolder(folder);
  };
  const openDocument = (value: unknown) => {
    const id = validDocumentId(value);
    if (id === null) return toast.error("Não foi possível abrir o documento: identificador inválido.");
    setSelectedId(id);
  };
  const editDocument = (value: unknown) => {
    const id = validDocumentId(value);
    if (id === null) return toast.error("Não foi possível editar o documento: identificador inválido.");
    setEditId(id);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-1 py-3 md:px-5 md:py-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-700">Gestão documental</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Inbox
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Carregue documentos, obtenha sugestões de OCR e aplique sempre os
            metadados após revisão.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="w-fit bg-teal-100 text-teal-800 hover:bg-teal-100">
            PDF, JPG, PNG e DOCX
          </Badge>
          <Badge variant="secondary" className="w-fit bg-slate-100 text-slate-700">
            Organização: {tenantContext.data?.tenant.name ?? "a carregar…"}
          </Badge>
        </div>
      </header>
      <Card className="border-teal-100 bg-gradient-to-r from-teal-50 to-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-3">
            <div className="rounded-xl bg-teal-700 p-2.5 text-white">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-slate-900">
                OCR e classificação assistida
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {ocrConfig.data?.automaticEnabled
                  ? "O processamento automático está ativo para novos documentos pendentes."
                  : "Os documentos entram na fila; processe-os agora ou ative a execução automática após publicar esta versão."}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              disabled={processNow.isPending}
              onClick={() => processNow.mutate({ batchSize: 2 })}
            >
              {processNow.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Processar pendentes
            </Button>
            {ocrConfig.data?.automaticEnabled ? (
              <Button
                variant="outline"
                disabled={disableAutomatic.isPending}
                onClick={() => disableAutomatic.mutate()}
              >
                Desativar automático
              </Button>
            ) : (
              <Button
                className="bg-teal-700 hover:bg-teal-800"
                disabled={automatic.isPending}
                onClick={() => automatic.mutate()}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Ativar automático
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="border-amber-200 bg-amber-50/40 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-3">
            <div className="rounded-xl bg-amber-600 p-2.5 text-white"><Mail className="h-5 w-5" /></div>
            <div><p className="font-medium text-slate-900">Faturas recebidas por email</p><p className="mt-1 max-w-3xl text-sm text-slate-600">Reveja links Moloni e TOConline da caixa Outlook. O DocuFlux mostra remetente e domínio, mas só obtém um ficheiro depois da sua seleção explícita.</p></div>
          </div>
          <Button variant="outline" disabled={!outlookStatus.data?.connection || outlookStatus.data.connection.status !== "autorizada" || emailLinks.isFetching} onClick={() => { setEmailLinkReviewRequested(true); emailLinks.refetch(); }}><Link2 className="mr-2 h-4 w-4" />Rever links de email</Button>
        </CardContent>
        {!outlookStatus.data?.connection ? <p className="px-5 pb-5 text-xs text-amber-800">Ligue primeiro uma caixa Microsoft 365 na área Outlook para consultar mensagens recebidas.</p> : null}
      </Card>
      {emailLinkReviewRequested ? <Card className="border-amber-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-5 w-5 text-amber-700" />Links de fornecedor a confirmar</CardTitle></CardHeader><CardContent>{emailLinks.isLoading || emailLinks.isFetching ? <p className="py-5 text-sm text-slate-500">A procurar links de fatura nas mensagens recentes…</p> : emailLinks.isError ? <p className="text-sm text-red-700">{emailLinks.error.message}</p> : (emailLinks.data ?? []).length ? <div className="space-y-3">{emailLinks.data?.map(link => { const key = `${link.messageId}:${link.url}`; return <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-100 p-3 hover:bg-amber-50"><input type="checkbox" checked={selectedEmailLinks.includes(key)} onChange={() => setSelectedEmailLinks(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])} aria-label={`Selecionar link ${link.provider}`} className="mt-1 h-4 w-4 accent-amber-600" /><Link2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800">{link.provider} · {link.hostname}</p><p className="mt-1 truncate text-xs text-slate-600">{maskSupplierLink(link.url)}</p><p className="mt-1 truncate text-xs text-slate-500">{link.subject} · {link.fromAddress ?? "Remetente indisponível"}</p></div></label>; })}<div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-100 pt-4"><p className="text-xs text-slate-600">{selectedEmailLinks.length} link(s) selecionado(s). Links expirados, portais com login ou respostas não documentais não são importados.</p><Button disabled={!selectedEmailLinks.length || importEmailLinks.isPending} onClick={() => importEmailLinks.mutate({ links: selectedEmailLinkItems })}>Confirmar obtenção</Button></div></div> : <p className="py-5 text-sm text-slate-500">Não foram encontrados links Moloni ou TOConline nas mensagens recentes.</p>}</CardContent></Card> : null}
      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <Card className="h-fit border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UploadCloud className="h-5 w-5 text-teal-700" />
              Adicionar documento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-dashed border-teal-200 bg-teal-50/50 p-4">
              <Label
                htmlFor="file"
                className="cursor-pointer text-sm font-medium text-slate-800"
              >
                {selectedFile ? selectedFile.name : "Fotografar ou escolher ficheiro"}
              </Label>
              <Input
                id="file"
                className="mt-2 cursor-pointer bg-white"
                type="file"
                accept={accepted}
                capture="environment"
                onChange={(event: ChangeEvent<HTMLInputElement>) => handleFileChosen(event.target.files?.[0] ?? null)}
              />
              <p className="mt-2 text-xs text-slate-500">
                No telemóvel, abre a câmara traseira. Um scanner físico também pode guardar o PDF/JPG e escolhê-lo aqui.
              </p>
              <p className="mt-2 text-xs font-medium text-teal-800">{captureStageMessage(captureStage)}</p>
            </div>
            {qrScanState !== "idle" && <div className={`rounded-lg border p-3 text-xs ${qrScanState === "found" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : qrScanState === "reading" ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              {qrScanState === "reading" && "A procurar QR Code AT na fotografia…"}
              {qrScanState === "not_found" && "Não foi encontrado QR Code AT nesta imagem. Pode continuar: o OCR fará a leitura do documento."}
              {qrScanState === "found" && <div className="space-y-1"><p className="font-semibold">QR Code AT detetado</p><p>NIF emitente: {atQr?.issuerNif ?? "—"} · Documento: {atQr?.documentNumber ?? "—"}</p><p>Data: {atQr?.documentDate ?? "—"} · ATCUD: {atQr?.atcud ?? "—"}</p><p className="pt-1 font-medium">O QR AT não contém sempre fornecedor, total ou IVA. Toque em Guardar: o DocuFlux analisa já a imagem e abre a revisão OCR com esses campos propostos.</p></div>}
            </div>}
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={documentType}
                onValueChange={value => setDocumentType(value as DocumentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(typeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fornecedor ou cliente</Label>
              <Input
                value={entityName}
                onChange={event => setEntityName(event.target.value)}
                placeholder="Ex.: ACME, Lda."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>N.º documento</Label>
                <Input
                  value={documentNumber}
                  onChange={event => setDocumentNumber(event.target.value)}
                  placeholder="FT 2026/1"
                />
              </div>
              <div className="space-y-2">
                <Label>Total (€)</Label>
                <Input
                  inputMode="decimal"
                  value={total}
                  onChange={event => setTotal(event.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>
            {atQr && <div className="space-y-2"><Label>NIF do emitente (QR AT)</Label><Input value={nif} onChange={event => setNif(event.target.value)} placeholder="PT123456789" /><Label>Data do documento (QR AT)</Label><Input type="date" value={documentDate} onChange={event => setDocumentDate(event.target.value)} /></div>}
            <Button
              className="w-full bg-teal-700 hover:bg-teal-800"
              disabled={!selectedFile || upload.isPending}
              onClick={handleUpload}
            >
              {upload.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="mr-2 h-4 w-4" />
              )}
              Guardar na Inbox
            </Button>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Pesquisar por ficheiro, entidade ou número"
                />
              </div>
              <Select
                value={status}
                onValueChange={value => setStatus(value as typeof status)}
              >
                <SelectTrigger className="w-full md:w-44">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os estados</SelectItem>
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedOcrIds.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg bg-teal-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-teal-900">
                  {selectedOcrIds.length} documento(s) selecionado(s) para OCR
                </p>
                <Button
                  size="sm"
                  className="bg-teal-700 hover:bg-teal-800"
                  disabled={queue.isPending || processNow.isPending}
                  onClick={() => queueAndProcess(selectedOcrIds)}
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Processar seleção
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {documents.isLoading ? (
              <div className="py-16 text-center text-sm text-slate-500">
                A carregar documentos…
              </div>
            ) : documents.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[940px] text-left text-sm">
                  <thead className="border-b text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="pb-3">
                        <input
                          aria-label="Selecionar todos os documentos"
                          type="checkbox"
                          checked={
                            Boolean(documents.data.length) &&
                            selectedOcrIds.length === documents.data.length
                          }
                          onChange={toggleAll}
                        />
                      </th>
                      <th className="pb-3 font-medium">Documento</th>
                      <th className="pb-3 font-medium">Tipo</th>
                      <th className="pb-3 font-medium">Estado</th>
                      <th className="pb-3 font-medium">OCR</th>
                      <th className="pb-3 font-medium">Pasta</th>
                      <th className="pb-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {documents.data.map((doc: any) => {
                      const job = jobsByDocument.get(doc.id);
                      return (
                        <tr
                          key={doc.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-4">
                            <input
                              aria-label={`Selecionar ${doc.originalFilename}`}
                              type="checkbox"
                              checked={selectedOcrIds.includes(doc.id)}
                              onChange={() => toggleSelection(doc.id)}
                            />
                          </td>
                          <td className="py-4">
                            <p className="font-medium text-slate-800">
                              {doc.originalFilename}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {doc.entityName || "Sem entidade"}
                              {doc.documentNumber
                                ? ` · ${doc.documentNumber}`
                                : ""}
                            </p>
                            <CrmStatusBadge status={doc.crmStatus} />
                          </td>
                          <td className="py-4 text-slate-600">
                            {typeLabels[doc.documentType]}
                          </td>
                          <td className="py-4">
                            <Badge
                              variant="secondary"
                              className="bg-slate-100 text-slate-600"
                            >
                              {statusLabels[doc.status]}
                            </Badge>
                          </td>
                          <td className="py-4">
                            {job ? (
                              <div className="space-y-1">
                                <Badge
                                  variant="secondary"
                                  className={
                                    job.status === "concluido"
                                      ? "bg-emerald-50 text-emerald-700"
                                      : job.status === "falhou"
                                        ? "bg-red-50 text-red-700"
                                        : "bg-amber-50 text-amber-700"
                                  }
                                >
                                  {ocrStatus[job.status]}
                                </Badge>
                                {job.status === "concluido" && (
                                  <button
                                    className="flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
                                    onClick={() => setReviewJobId(job.id)}
                                  >
                                    <Sparkles className="h-3 w-3" /> Ver resumo OCR
                                  </button>
                                )}
                                {job.status === "falhou" && (
                                  <p
                                    className="max-w-36 truncate text-xs text-red-600"
                                    title={job.lastError ?? ""}
                                  >
                                    {job.lastError}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">
                                Sem pedido
                              </span>
                            )}
                          </td>
                          <td
                            className="max-w-40 truncate py-4 text-xs text-slate-500"
                            title={doc.finalFolder || doc.suggestedFolder || ""}
                          >
                            {doc.finalFolder || doc.suggestedFolder || "—"}
                          </td>
                          <td className="whitespace-nowrap py-4 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Processar OCR"
                              aria-label={`Processar OCR: ${doc.originalFilename}`}
                              disabled={queue.isPending || processNow.isPending}
                              onClick={() => queueAndProcess([doc.id])}
                            >
                              <Wand2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Escolher pasta manualmente"
                              aria-label={`Escolher pasta: ${doc.originalFilename}`}
                              onClick={() => beginManualMove(doc)}
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Editar ${doc.originalFilename}`}
                              onClick={() => editDocument(doc.id)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Ver ${doc.originalFilename}`}
                              onClick={() => openDocument(doc.id)}
                              disabled={detail.isFetching}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-20 text-center">
                <EmptyIcon />
                <p className="mt-4 font-medium text-slate-700">
                  A sua Inbox está vazia
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Adicione o primeiro documento para começar.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog
        open={Boolean(reviewJobId)}
        onOpenChange={open => !open && setReviewJobId(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-teal-700" />
              Rever sugestão OCR
            </DialogTitle>
            <DialogDescription>
              Confirme os valores extraídos antes de atualizar os metadados do
              documento.
            </DialogDescription>
          </DialogHeader>
          {suggestion ? (
            <div className="grid gap-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <OcrField
                  label="Tipo"
                  value={
                    typeLabels[text(suggestion.documentType) as DocumentType] ??
                    text(suggestion.documentType)
                  }
                />
                <OcrField
                  label="Confiança"
                  value={
                    typeof reviewJob?.confidence === "number"
                      ? `${reviewJob.confidence}%`
                      : "—"
                  }
                />
                <OcrField
                  label="Entidade"
                  value={text(suggestion.entityName)}
                />
                <OcrField label="NIF" value={text(suggestion.nif)} />
                <OcrField
                  label="Número"
                  value={text(suggestion.documentNumber)}
                />
                <OcrField label="Total" value={euros(suggestion.totalCents)} />
                <OcrField label="Data" value={text(suggestion.documentDate)} />
                <OcrField label="IVA" value={euros(suggestion.vatCents)} />
                <OcrField label="Natureza" value={accountingNatureLabels[text(suggestion.accountingNature)] ?? text(suggestion.accountingNature)} />
                <OcrField label="Área de arquivo" value={archiveAreaLabels[text(suggestion.archiveArea)] ?? text(suggestion.archiveArea)} />
              </div>
              <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Leitura contabilística assistida</p>
                <p className="mt-1 text-sm leading-5 text-slate-700">{text(suggestion.accountingSummary)}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{text(suggestion.archiveReason)}</p>
              </div>
              <div className="space-y-2">
                <Label>Pasta proposta</Label>
                <Input value={reviewFolder} onChange={event => setReviewFolder(event.target.value)} placeholder="/Contabilidade/Compras/2026/08/Fornecedor" />
                <p className="text-xs text-slate-500">Pode ajustar a pasta antes de aplicar. A decisão final continua a ser sua.</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Texto extraído
                </p>
                <p className="mt-1 max-h-36 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  {text(suggestion.ocrText)}
                </p>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              Não foi possível ler a sugestão.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewJobId(null)}>
              Fechar
            </Button>
            <Button
              className="bg-teal-700 hover:bg-teal-800"
              disabled={!reviewJob || !suggestion || applySuggestion.isPending}
              onClick={() =>
                reviewJob && applySuggestion.mutate({ jobId: reviewJob.id, finalFolder: reviewFolder || undefined })
              }
            >
              {applySuggestion.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Aplicar sugestão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(moveDocument)} onOpenChange={open => !open && setMoveDocument(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escolher pasta manualmente</DialogTitle>
            <DialogDescription>{moveDocument?.name}. O ficheiro não é copiado; apenas muda a localização lógica.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {existingFolders.length > 0 && <div className="space-y-2">
              <Label>Pastas já usadas nesta organização</Label>
              <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2">
                {existingFolders.slice(0, 12).map(folder => <button key={folder} type="button" onClick={() => setManualFolder(folder)} className="max-w-full truncate rounded-md bg-white px-2 py-1 text-xs text-slate-700 shadow-sm ring-1 ring-slate-200 hover:text-teal-700" title={folder}>{folder}</button>)}
              </div>
            </div>}
            <div className="space-y-2">
              <Label htmlFor="manual-folder">Caminho da pasta</Label>
              <Input id="manual-folder" value={manualFolder} onChange={event => setManualFolder(event.target.value)} placeholder="/Operacoes/Logistica/2025/07/Fornecedor" />
              <p className="text-xs text-slate-500">Escolha uma pasta existente ou escreva uma nova. O caminho deve começar por `/`.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDocument(null)}>Cancelar</Button>
            <Button className="bg-teal-700 hover:bg-teal-800" disabled={!moveDocument || moveFolder.isPending} onClick={() => {
              if (!manualFolder.startsWith("/")) return toast.error("A pasta deve começar por /.");
              if (moveDocument) moveFolder.mutate({ id: moveDocument.id, finalFolder: manualFolder });
            }}>
              {moveFolder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar pasta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MetadataDialog
        open={Boolean(editId)}
        onClose={() => setEditId(null)}
        document={editDetail.data}
        editType={editType}
        setEditType={setEditType}
        editStatus={editStatus}
        setEditStatus={setEditStatus}
        editEntity={editEntity}
        setEditEntity={setEditEntity}
        editNif={editNif}
        setEditNif={setEditNif}
        editNumber={editNumber}
        setEditNumber={setEditNumber}
        editDocumentDate={editDocumentDate}
        setEditDocumentDate={setEditDocumentDate}
        editDueDate={editDueDate}
        setEditDueDate={setEditDueDate}
        editTotal={editTotal}
        setEditTotal={setEditTotal}
        editVat={editVat}
        setEditVat={setEditVat}
        editCurrency={editCurrency}
        setEditCurrency={setEditCurrency}
        editTags={editTags}
        setEditTags={setEditTags}
        editFolder={editFolder}
        setEditFolder={setEditFolder}
        saving={updateMetadata.isPending}
        onSave={() => {
          if (!editDetail.data) return;
          const totalCents = toCents(editTotal);
          const vatCents = toCents(editVat);
          if (
            (totalCents !== null &&
              (!Number.isFinite(totalCents) || totalCents < 0)) ||
            (vatCents !== null && (!Number.isFinite(vatCents) || vatCents < 0))
          )
            return toast.error("Os valores financeiros têm de ser válidos.");
          if (!/^[A-Z]{3}$/.test(editCurrency))
            return toast.error(
              "A moeda deve ter três letras, por exemplo EUR."
            );
          updateMetadata.mutate({
            id: editDetail.data.id,
            documentType: editType,
            status: editStatus,
            entityName: editEntity || null,
            nif: editNif || null,
            documentNumber: editNumber || null,
            documentDate: editDocumentDate || null,
            dueDate: editDueDate || null,
            totalCents,
            vatCents,
            tags: editTags
              .split(",")
              .map(tag => tag.trim())
              .filter(Boolean),
            finalFolder: editFolder || null,
          });
        }}
      />
    </div>
  );
}

function MetadataDialog(props: any) {
  const f = (
    label: string,
    value: string,
    set: (value: string) => void,
    type = "text"
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={event => set(event.target.value)}
      />
    </div>
  );
  return (
    <Dialog open={props.open} onOpenChange={open => !open && props.onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar metadados</DialogTitle>
          <DialogDescription>
            {props.document?.originalFilename ?? "A carregar documento…"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={props.editType} onValueChange={props.setEditType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(typeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select
                value={props.editStatus}
                onValueChange={props.setEditStatus}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {f("Fornecedor ou cliente", props.editEntity, props.setEditEntity)}
            {f("NIF", props.editNif, props.setEditNif)}
            {f("Número de documento", props.editNumber, props.setEditNumber)}
            {f("Moeda", props.editCurrency, props.setEditCurrency)}
            {f(
              "Data do documento",
              props.editDocumentDate,
              props.setEditDocumentDate,
              "date"
            )}
            {f("Vencimento", props.editDueDate, props.setEditDueDate, "date")}
            {f("Total", props.editTotal, props.setEditTotal)}
            {f("IVA", props.editVat, props.setEditVat)}
          </div>
          {f("Etiquetas", props.editTags, props.setEditTags)}
          {f("Pasta final", props.editFolder, props.setEditFolder)}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-teal-700 hover:bg-teal-800"
            disabled={!props.document || props.saving}
            onClick={props.onSave}
          >
            {props.saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function OcrField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 truncate font-medium text-slate-800" title={value}>
        {value}
      </p>
    </div>
  );
}
function EmptyIcon() {
  return (
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
      <FileUp className="h-6 w-6" />
    </div>
  );
}
function CrmStatusBadge({ status }: { status?: "synced" | "pending" | "unlinked" }) {
  const state = status ?? "unlinked";
  const labels = { synced: "CRM sincronizado", pending: "CRM pendente", unlinked: "Sem contacto CRM" };
  const classes = { synced: "bg-emerald-50 text-emerald-700", pending: "bg-amber-50 text-amber-800", unlinked: "bg-slate-100 text-slate-500" };
  return <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${classes[state]}`} aria-label={`Estado do contacto: ${labels[state]}`}>{labels[state]}</span>;
}
const accountingNatureLabels: Record<string, string> = { despesa: "Despesa", receita: "Receita", imposto: "Imposto", tesouraria: "Tesouraria", suporte_operacional: "Suporte operacional", sem_relevancia_contabilistica: "Sem relevância contabilística", requer_revisao: "Requer revisão" };
const archiveAreaLabels: Record<string, string> = { contabilidade_compras: "Contabilidade · Compras", contabilidade_vendas: "Contabilidade · Vendas", contabilidade_tesouraria: "Contabilidade · Tesouraria", contabilidade_fiscal: "Contabilidade · Fiscal", operacoes_logistica: "Operações · Logística", operacoes_comercial: "Operações · Comercial", operacoes_administracao: "Operações · Administração", a_rever: "A rever" };
