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
import {
  Bot,
  CheckCircle2,
  Eye,
  FileUp,
  Filter,
  Loader2,
  Pencil,
  Play,
  Search,
  Sparkles,
  UploadCloud,
  Wand2,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
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

export default function InboxPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | DocumentStatus>("all");
  const [documentType, setDocumentType] = useState<DocumentType>("outro");
  const [entityName, setEntityName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [total, setTotal] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [reviewJobId, setReviewJobId] = useState<number | null>(null);
  const [selectedOcrIds, setSelectedOcrIds] = useState<number[]>([]);
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
  const documents = trpc.documents.list.useQuery({
    status: status === "all" ? undefined : status,
    query: query || undefined,
  });
  const detail = trpc.documents.get.useQuery(
    { id: selectedId ?? 0 },
    { enabled: Boolean(selectedId) }
  );
  const editDetail = trpc.documents.get.useQuery(
    { id: editId ?? 0 },
    { enabled: Boolean(editId) }
  );
  const ocrConfig = trpc.ocr.config.useQuery();
  const ocrJobs = trpc.ocr.jobs.useQuery();
  const jobsByDocument = useMemo(() => {
    const map = new Map<number, any>();
    for (const job of ocrJobs.data ?? [])
      if (!map.has(job.documentId)) map.set(job.documentId, job);
    return map;
  }, [ocrJobs.data]);
  const reviewJob = ocrJobs.data?.find(job => job.id === reviewJobId);
  const suggestion = record(reviewJob?.suggestion);
  const invalidateOcr = () => {
    utils.ocr.jobs.invalidate();
    utils.documents.list.invalidate();
  };
  const processNow = trpc.ocr.processNow.useMutation({
    onSuccess: result => {
      toast.success("Ciclo OCR terminado.", {
        description: `${result.results.filter(item => item.status === "completed").length} sugestão(ões) preparada(s).`,
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
    onSuccess: () => {
      toast.success("Documento guardado e colocado na fila OCR.");
      setSelectedFile(null);
      setEntityName("");
      setDocumentNumber("");
      setTotal("");
      setDocumentType("outro");
      invalidateOcr();
    },
    onError: error => toast.error(error.message),
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
    upload.mutate({
      filename: selectedFile.name,
      contentType: selectedFile.type,
      base64: await toBase64(selectedFile),
      documentType,
      entityName: entityName || undefined,
      documentNumber: documentNumber || undefined,
      totalCents: totalCents ?? undefined,
    });
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
        <Badge className="w-fit bg-teal-100 text-teal-800 hover:bg-teal-100">
          PDF, JPG, PNG e DOCX
        </Badge>
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
                {selectedFile ? selectedFile.name : "Escolher ficheiro"}
              </Label>
              <Input
                id="file"
                className="mt-2 cursor-pointer bg-white"
                type="file"
                accept={accepted}
                capture="environment"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setSelectedFile(event.target.files?.[0] ?? null)
                }
              />
              <p className="mt-2 text-xs text-slate-500">
                No telemóvel, pode capturar um documento diretamente com a
                câmara.
              </p>
            </div>
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
                                    className="block text-xs font-medium text-teal-700 hover:underline"
                                    onClick={() => setReviewJobId(job.id)}
                                  >
                                    Rever sugestão
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
                              aria-label={`Editar ${doc.originalFilename}`}
                              onClick={() => setEditId(doc.id)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Ver ${doc.originalFilename}`}
                              onClick={() => setSelectedId(doc.id)}
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
                reviewJob && applySuggestion.mutate({ jobId: reviewJob.id })
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
