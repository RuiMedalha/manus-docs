import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ClipboardCheck, FileOutput, Loader2, Send, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const statusLabel: Record<string, string> = {
  nao_preparado: "Não preparado",
  pronto_para_revisao: "Pronto para revisão",
  aprovado_para_envio: "Aprovado para envio",
  enviado: "Enviado",
  falhou: "Falhou",
};
const statusClass: Record<string, string> = {
  nao_preparado: "bg-slate-100 text-slate-700",
  pronto_para_revisao: "bg-amber-100 text-amber-800",
  aprovado_para_envio: "bg-sky-100 text-sky-800",
  enviado: "bg-emerald-100 text-emerald-800",
  falhou: "bg-red-100 text-red-800",
};
function money(value: number | null, currency = "EUR") { return value === null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(value / 100); }

export default function TocOnlinePage() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const utils = trpc.useUtils();
  const documents = trpc.documents.list.useQuery();
  const exports = trpc.tocOnline.list.useQuery({ month });
  const prepare = trpc.tocOnline.prepare.useMutation({ onSuccess: () => { toast.success("Fatura preparada para revisão TOConline."); utils.tocOnline.list.invalidate(); }, onError: error => toast.error(error.message) });
  const approve = trpc.tocOnline.approve.useMutation({ onSuccess: () => { toast.success("Envio TOConline aprovado. A API continua bloqueada até ser configurada e validada."); utils.tocOnline.list.invalidate(); }, onError: error => toast.error(error.message) });
  const exportByDocument = useMemo(() => new Map((exports.data ?? []).map(item => [item.document.id, item.export])), [exports.data]);
  const eligible = useMemo(() => (documents.data ?? []).filter(document => document.documentType === "fatura_recebida" && document.status !== "novo" && document.entityName && document.documentNumber && document.documentDate && document.totalCents !== null), [documents.data]);
  const monthly = exports.data ?? [];
  const approvedCount = monthly.filter(item => item.export.status === "aprovado_para_envio").length;
  const sentCount = monthly.filter(item => item.export.status === "enviado").length;

  return <div className="docuflux-page mx-auto max-w-7xl space-y-6 px-1 py-3 md:px-5 md:py-6">
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-medium text-teal-700">Contabilidade assistida</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Revisão TOConline</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">Prepare a fatura, reveja a proposta e exija aprovação de contabilidade antes de qualquer futura comunicação por API.</p></div><Badge className="w-fit bg-amber-100 text-amber-800 hover:bg-amber-100"><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Envio API desativado</Badge></header>
    <Card className="border-amber-200 bg-amber-50/50 shadow-sm"><CardContent className="flex gap-3 p-5"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-medium text-amber-950">Controlo humano obrigatório</p><p className="mt-1 text-sm text-amber-900">Esta área só cria um registo de revisão e uma referência de exportação. Não cria fornecedores, não cria documentos de compra e não envia dados ao TOConline até as credenciais, a validação de ligação e o envio controlado estarem configurados.</p></div></CardContent></Card>
    <div className="grid gap-4 md:grid-cols-3"><Metric label="Preparadas no mês" value={String(monthly.length)} description="Propostas com snapshot preservado" icon={ClipboardCheck} tone="amber" /><Metric label="Aprovadas para envio" value={String(approvedCount)} description="Aguardam integração API autorizada" icon={CheckCircle2} tone="sky" /><Metric label="Enviadas por API" value={String(sentCount)} description="Sem envio automático nesta versão" icon={Send} tone="green" /></div>
    <Card className="border-slate-200 shadow-sm"><CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="flex items-center gap-2"><FileOutput className="h-5 w-5 text-teal-700" />Faturas elegíveis</CardTitle><CardDescription>Uma fatura só pode ser preparada quando contém fornecedor, número, data e total confirmados.</CardDescription></div></CardHeader><CardContent>{documents.isLoading ? <p className="py-8 text-sm text-slate-500">A carregar faturas…</p> : eligible.length ? <div className="divide-y divide-slate-100">{eligible.map(document => { const exportRecord = exportByDocument.get(document.id); return <div key={document.id} className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><p className="font-medium text-slate-800">{document.entityName} <span className="font-normal text-slate-500">· {document.documentNumber}</span></p><p className="mt-1 text-xs text-slate-500">{document.documentDate} · {money(document.totalCents, document.currency)} · {document.finalFolder || "Sem pasta final"}</p></div><div className="flex flex-wrap items-center gap-2">{exportRecord ? <><Badge variant="secondary" className={statusClass[exportRecord.status]}>{statusLabel[exportRecord.status]}</Badge>{exportRecord.status === "pronto_para_revisao" && <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ documentId: document.id })}>{approve.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Aprovar</Button>}</> : <Button size="sm" variant="outline" disabled={prepare.isPending} onClick={() => prepare.mutate({ documentId: document.id })}>{prepare.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileOutput className="mr-2 h-4 w-4" />}Preparar</Button>}</div></div>; })}</div> : <p className="py-10 text-center text-sm text-slate-500">Ainda não existem faturas revistas e completas para preparar.</p>}</CardContent></Card>
    <Card className="border-slate-200 shadow-sm"><CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Mapa mensal para contabilidade</CardTitle><CardDescription>Mostra propostas, aprovações e envios efetivos do mês selecionado.</CardDescription></div><Input className="w-full sm:w-44" type="month" value={month} onChange={event => setMonth(event.target.value)} /></CardHeader><CardContent>{exports.isLoading ? <p className="py-8 text-sm text-slate-500">A carregar mapa mensal…</p> : monthly.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3 font-medium">Fornecedor</th><th className="pb-3 font-medium">Documento</th><th className="pb-3 font-medium">Valor</th><th className="pb-3 font-medium">Referência</th><th className="pb-3 font-medium">Estado</th><th className="pb-3 font-medium">Preparada</th></tr></thead><tbody>{monthly.map(({ export: item, document }) => <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="py-3 font-medium text-slate-800">{document.entityName || "—"}</td><td className="py-3 text-slate-600">{document.documentNumber || "—"}</td><td className="py-3 text-slate-600">{money(document.totalCents, document.currency)}</td><td className="py-3 font-mono text-xs text-slate-500">{item.exportReference}</td><td className="py-3"><Badge variant="secondary" className={statusClass[item.status]}>{statusLabel[item.status]}</Badge></td><td className="py-3 text-slate-500">{new Date(item.preparedAt).toLocaleDateString("pt-PT")}</td></tr>)}</tbody></table></div> : <p className="py-10 text-center text-sm text-slate-500">Ainda não existem propostas TOConline neste mês.</p>}</CardContent></Card>
  </div>;
}

function Metric({ label, value, description, icon: Icon, tone }: { label: string; value: string; description: string; icon: typeof ClipboardCheck; tone: "amber" | "sky" | "green" }) { const tones = { amber: "bg-amber-100 text-amber-700", sky: "bg-sky-100 text-sky-700", green: "bg-emerald-100 text-emerald-700" }; return <Card className="border-slate-200 shadow-sm"><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div><div className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon className="h-5 w-5" /></div></CardContent></Card>; }
