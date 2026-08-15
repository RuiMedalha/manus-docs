import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Eye, FileUp, Filter, Loader2, Pencil, Search, UploadCloud } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const typeLabels = { fatura_recebida: "Fatura recebida", fatura_emitida: "Fatura emitida", recibo: "Recibo", comprovativo: "Comprovativo", encomenda: "Encomenda", outro: "Outro" } as const;
const statusLabels = { novo: "Novo", processado: "Processado", em_revisao: "Em revisão", arquivado: "Arquivado" } as const;

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Não foi possível ler o ficheiro."));
    reader.readAsDataURL(file);
  });
}

export default function InboxPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | keyof typeof statusLabels>("all");
  const [documentType, setDocumentType] = useState<keyof typeof typeLabels>("outro");
  const [entityName, setEntityName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [total, setTotal] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editType, setEditType] = useState<keyof typeof typeLabels>("outro");
  const [editStatus, setEditStatus] = useState<keyof typeof statusLabels>("novo");
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
  const documents = trpc.documents.list.useQuery({ status: status === "all" ? undefined : status, query: query || undefined });
  const detail = trpc.documents.get.useQuery({ id: selectedId ?? 0 }, { enabled: Boolean(selectedId) });
  const editDetail = trpc.documents.get.useQuery({ id: editId ?? 0 }, { enabled: Boolean(editId) });
  const upload = trpc.documents.upload.useMutation({
    onSuccess: result => {
      toast.success("Documento guardado na Inbox.", { description: "A pasta foi sugerida automaticamente." });
      setSelectedFile(null); setEntityName(""); setDocumentNumber(""); setTotal(""); setDocumentType("outro");
      utils.documents.list.invalidate();
    },
    onError: error => toast.error("Não foi possível carregar o documento.", { description: error.message }),
  });
  const updateMetadata = trpc.documents.updateMetadata.useMutation({
    onSuccess: () => { toast.success("Metadados atualizados."); setEditId(null); utils.documents.list.invalidate(); },
    onError: error => toast.error("Não foi possível atualizar o documento.", { description: error.message }),
  });

  useEffect(() => {
    if (detail.data?.fileUrl) { window.open(detail.data.fileUrl, "_blank", "noopener,noreferrer"); setSelectedId(null); }
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
    setEditTotal(editDetail.data.totalCents === null ? "" : ((editDetail.data.totalCents ?? 0) / 100).toFixed(2));
    setEditVat(editDetail.data.vatCents === null ? "" : ((editDetail.data.vatCents ?? 0) / 100).toFixed(2));
    setEditCurrency(editDetail.data.currency ?? "EUR");
    setEditTags(Array.isArray(editDetail.data.tags) ? editDetail.data.tags.filter((tag): tag is string => typeof tag === "string").join(", ") : "");
    setEditFolder(editDetail.data.finalFolder ?? editDetail.data.suggestedFolder ?? "");
  }, [editDetail.data]);

  const accepted = useMemo(() => "application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document", []);
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => setSelectedFile(event.target.files?.[0] ?? null);
  const handleUpload = async () => {
    if (!selectedFile) return toast.error("Selecione um ficheiro primeiro.");
    if (selectedFile.size > 10 * 1024 * 1024) return toast.error("O ficheiro excede o limite de 10 MB.");
    const totalCents = total ? Math.round(Number(total.replace(",", ".")) * 100) : undefined;
    if (totalCents !== undefined && (!Number.isFinite(totalCents) || totalCents < 0)) return toast.error("Indique um valor válido.");
    upload.mutate({ filename: selectedFile.name, contentType: selectedFile.type, base64: await toBase64(selectedFile), documentType, entityName: entityName || undefined, documentNumber: documentNumber || undefined, totalCents });
  };

  return <div className="mx-auto max-w-7xl space-y-6 px-1 py-3 md:px-5 md:py-6">
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-medium text-teal-700">Gestão documental</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Inbox</h1><p className="mt-2 text-sm text-slate-500">Carregue, classifique e organize documentos no espaço da sua organização.</p></div><Badge className="w-fit bg-teal-100 text-teal-800 hover:bg-teal-100">PDF, JPG, PNG e DOCX</Badge></header>
    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
      <Card className="h-fit border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UploadCloud className="h-5 w-5 text-teal-700" />Adicionar documento</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="rounded-xl border border-dashed border-teal-200 bg-teal-50/50 p-4"><Label htmlFor="file" className="cursor-pointer text-sm font-medium text-slate-800">{selectedFile ? selectedFile.name : "Escolher ficheiro"}</Label><Input id="file" className="mt-2 cursor-pointer bg-white" type="file" accept={accepted} capture="environment" onChange={handleFile} /><p className="mt-2 text-xs text-slate-500">No telemóvel, pode capturar um documento diretamente com a câmara.</p></div>
        <div className="space-y-2"><Label>Tipo</Label><Select value={documentType} onValueChange={value => setDocumentType(value as keyof typeof typeLabels)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="entity">Fornecedor ou cliente</Label><Input id="entity" value={entityName} onChange={event => setEntityName(event.target.value)} placeholder="Ex.: ACME, Lda." /></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="number">N.º documento</Label><Input id="number" value={documentNumber} onChange={event => setDocumentNumber(event.target.value)} placeholder="FT 2026/1" /></div><div className="space-y-2"><Label htmlFor="total">Total (€)</Label><Input id="total" inputMode="decimal" value={total} onChange={event => setTotal(event.target.value)} placeholder="0,00" /></div></div>
        <Button className="w-full bg-teal-700 hover:bg-teal-800" disabled={!selectedFile || upload.isPending} onClick={handleUpload}>{upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}Guardar na Inbox</Button>
      </CardContent></Card>
      <Card className="border-slate-200 shadow-sm"><CardHeader className="gap-4"><div className="flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" value={query} onChange={event => setQuery(event.target.value)} placeholder="Pesquisar por ficheiro, entidade ou número" /></div><Select value={status} onValueChange={value => setStatus(value as typeof status)}><SelectTrigger className="w-full md:w-44"><Filter className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os estados</SelectItem>{Object.entries(statusLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div></CardHeader><CardContent>
        {documents.isLoading ? <div className="py-16 text-center text-sm text-slate-500">A carregar documentos…</div> : documents.data?.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3 font-medium">Documento</th><th className="pb-3 font-medium">Tipo</th><th className="pb-3 font-medium">Estado</th><th className="pb-3 font-medium">Pasta</th><th className="pb-3" /></tr></thead><tbody>{documents.data.map(doc => <tr key={doc.id} className="border-b border-slate-100 last:border-0"><td className="py-4"><p className="font-medium text-slate-800">{doc.originalFilename}</p><p className="mt-1 text-xs text-slate-500">{doc.entityName || "Sem entidade"}{doc.documentNumber ? ` · ${doc.documentNumber}` : ""}</p></td><td className="py-4 text-slate-600">{typeLabels[doc.documentType]}</td><td className="py-4"><Badge variant="secondary" className="bg-slate-100 text-slate-600">{statusLabels[doc.status]}</Badge></td><td className="max-w-44 truncate py-4 text-xs text-slate-500" title={doc.finalFolder || doc.suggestedFolder || ""}>{doc.finalFolder || doc.suggestedFolder || "—"}</td><td className="py-4 text-right"><Button variant="ghost" size="icon" aria-label={`Editar ${doc.originalFilename}`} onClick={() => setEditId(doc.id)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Ver ${doc.originalFilename}`} onClick={() => setSelectedId(doc.id)} disabled={detail.isFetching}><Eye className="h-4 w-4" /></Button></td></tr>)}</tbody></table></div> : <div className="py-20 text-center"><InboxIcon /><p className="mt-4 font-medium text-slate-700">A sua Inbox está vazia</p><p className="mt-1 text-sm text-slate-500">Adicione o primeiro documento para começar.</p></div>}
      </CardContent></Card>
    </div>
    <Dialog open={Boolean(editId)} onOpenChange={open => !open && setEditId(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Editar metadados</DialogTitle><DialogDescription>{editDetail.data?.originalFilename ?? "A carregar documento…"}</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Tipo</Label><Select value={editType} onValueChange={value => setEditType(value as keyof typeof typeLabels)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Estado</Label><Select value={editStatus} onValueChange={value => setEditStatus(value as keyof typeof statusLabels)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Fornecedor ou cliente</Label><Input value={editEntity} onChange={event => setEditEntity(event.target.value)} /></div><div className="space-y-2"><Label>NIF</Label><Input value={editNif} onChange={event => setEditNif(event.target.value)} /></div></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Número de documento</Label><Input value={editNumber} onChange={event => setEditNumber(event.target.value)} /></div><div className="space-y-2"><Label>Moeda</Label><Input maxLength={3} value={editCurrency} onChange={event => setEditCurrency(event.target.value.toUpperCase())} /></div></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Data do documento</Label><Input type="date" value={editDocumentDate} onChange={event => setEditDocumentDate(event.target.value)} /></div><div className="space-y-2"><Label>Vencimento</Label><Input type="date" value={editDueDate} onChange={event => setEditDueDate(event.target.value)} /></div></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Total</Label><Input inputMode="decimal" value={editTotal} onChange={event => setEditTotal(event.target.value)} /></div><div className="space-y-2"><Label>IVA</Label><Input inputMode="decimal" value={editVat} onChange={event => setEditVat(event.target.value)} /></div></div><div className="space-y-2"><Label>Etiquetas</Label><Input value={editTags} onChange={event => setEditTags(event.target.value)} placeholder="Ex.: eletricidade, agosto" /></div><div className="space-y-2"><Label>Pasta final</Label><Input value={editFolder} onChange={event => setEditFolder(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setEditId(null)}>Cancelar</Button><Button className="bg-teal-700 hover:bg-teal-800" disabled={!editDetail.data || updateMetadata.isPending} onClick={() => { const totalCents = editTotal ? Math.round(Number(editTotal.replace(",", ".")) * 100) : null; const vatCents = editVat ? Math.round(Number(editVat.replace(",", ".")) * 100) : null; if ((totalCents !== null && (!Number.isFinite(totalCents) || totalCents < 0)) || (vatCents !== null && (!Number.isFinite(vatCents) || vatCents < 0))) return toast.error("Os valores financeiros têm de ser válidos."); if (!/^[A-Z]{3}$/.test(editCurrency)) return toast.error("A moeda deve ter três letras, por exemplo EUR."); if (editDetail.data) updateMetadata.mutate({ id: editDetail.data.id, documentType: editType, status: editStatus, entityName: editEntity || null, nif: editNif || null, documentNumber: editNumber || null, documentDate: editDocumentDate || null, dueDate: editDueDate || null, totalCents, vatCents, tags: editTags.split(",").map(tag => tag.trim()).filter(Boolean), finalFolder: editFolder || null }); }}>{updateMetadata.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar alterações</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function InboxIcon() { return <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><FileUp className="h-6 w-6" /></div>; }
