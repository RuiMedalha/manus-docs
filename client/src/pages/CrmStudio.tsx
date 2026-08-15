import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Braces, CloudCog, Eye, History, Loader2, Play, Save, ShieldCheck, Wifi } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const defaultMapping = { name: "name", nif: "tax_id", email: "email", phone: "phone", address: "address", type: "type" };
type Validation = { valid: boolean; reason: string; status?: number; endpoint?: string; message?: string } | null;

export default function CrmStudioPage() {
  const utils = trpc.useUtils();
  const connections = trpc.masterData.crm.useQuery();
  const history = trpc.masterData.crmHistory.useQuery();
  const [provider, setProvider] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [contactPath, setContactPath] = useState("/contacts");
  const [authType, setAuthType] = useState<"bearer" | "api_key" | "basic" | "none">("bearer");
  const [secretEnvKey, setSecretEnvKey] = useState("CRM_API_TOKEN");
  const [syncMethod, setSyncMethod] = useState<"POST" | "PUT" | "PATCH">("POST");
  const [externalIdPath, setExternalIdPath] = useState("id");
  const [mappingText, setMappingText] = useState(JSON.stringify(defaultMapping, null, 2));
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [validation, setValidation] = useState<Validation>(null);
  const selectedId = Number(selectedConnectionId) || undefined;
  const selected = useMemo(() => connections.data?.find(item => item.id === selectedId), [connections.data, selectedId]);

  const configure = trpc.masterData.configureCrm.useMutation({
    onSuccess: connection => { toast.success("Ligação CRM guardada."); utils.masterData.crm.invalidate(); if (connection) setSelectedConnectionId(String(connection.id)); },
    onError: error => toast.error(error.message),
  });
  const preview = trpc.masterData.previewCrm.useQuery({ connectionId: selectedId ?? 0, limit: 5 }, { enabled: false });
  const validate = trpc.masterData.validateCrm.useMutation({
    onSuccess: result => { setValidation(result); result.valid ? toast.success("Ligação CRM validada.") : toast.error(result.message ?? `Validação falhou: ${result.reason}.`); },
    onError: error => toast.error(error.message),
  });
  const sync = trpc.masterData.syncCrm.useMutation({
    onSuccess: result => { toast.success(result.status === "simulada" ? "Simulação CRM concluída." : "Sincronização CRM concluída."); utils.masterData.crmHistory.invalidate(); utils.masterData.entities.invalidate(); },
    onError: error => toast.error(error.message),
  });

  const save = () => {
    try {
      const mapping = JSON.parse(mappingText) as typeof defaultMapping;
      configure.mutate({ provider: provider.trim(), displayName: displayName.trim(), baseUrl: baseUrl.trim(), contactPath, authType, secretEnvKey: authType === "none" ? undefined : secretEnvKey.trim(), syncMethod, externalIdPath, fieldMapping: mapping });
    } catch { toast.error("O mapeamento deve ser JSON válido."); }
  };

  return <div className="docuflux-page mx-auto max-w-7xl space-y-6 px-1 py-3 md:px-5 md:py-6">
    <header><p className="text-sm font-medium text-teal-700">Adaptador REST agnóstico</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Estúdio CRM</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">Configure qualquer CRM com API REST JSON. Guarde a ligação, valide URL e autenticação, pré-visualize contactos e simule antes de executar.</p></header>
    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
      <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><CloudCog className="h-5 w-5 text-teal-700" />Contrato de ligação</CardTitle><CardDescription>O segredo não fica gravado na aplicação: introduza apenas o nome da variável de ambiente que o servidor deve usar.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2"><Field label="Identificador do CRM"><Input value={provider} onChange={event => setProvider(event.target.value)} placeholder="ex.: hubspot, pipedrive, crm-proprio" /></Field><Field label="Nome da ligação"><Input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="CRM comercial" /></Field></div>
        <Field label="URL base da API"><Input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://crm.exemplo.pt/api/v1" /></Field>
        <div className="grid gap-3 md:grid-cols-3"><Field label="Caminho de contactos"><Input value={contactPath} onChange={event => setContactPath(event.target.value)} placeholder="/contacts" /></Field><Field label="Método"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={syncMethod} onChange={event => setSyncMethod(event.target.value as typeof syncMethod)}><option>POST</option><option>PUT</option><option>PATCH</option></select></Field><Field label="Campo do ID externo"><Input value={externalIdPath} onChange={event => setExternalIdPath(event.target.value)} placeholder="id ou data.id" /></Field></div>
        <div className="grid gap-3 md:grid-cols-2"><Field label="Autenticação"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={authType} onChange={event => setAuthType(event.target.value as typeof authType)}><option value="bearer">Bearer token</option><option value="api_key">API key</option><option value="basic">Basic (base64)</option><option value="none">Sem autenticação</option></select></Field><Field label="Nome do segredo de ambiente"><Input disabled={authType === "none"} value={secretEnvKey} onChange={event => setSecretEnvKey(event.target.value)} placeholder="CRM_API_TOKEN" /></Field></div>
        <Field label="Mapeamento DocuFlux → CRM"><Textarea className="min-h-40 font-mono text-xs" value={mappingText} onChange={event => setMappingText(event.target.value)} /></Field>
        <Button className="bg-teal-700 hover:bg-teal-800" disabled={configure.isPending || !provider.trim() || !displayName.trim() || !baseUrl.trim()} onClick={save}>{configure.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar ligação</Button>
      </CardContent></Card>
      <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-teal-700" />Execução controlada</CardTitle><CardDescription>A sincronização real permanece bloqueada até a ligação selecionada validar com sucesso.</CardDescription></CardHeader><CardContent className="space-y-4">
        <Field label="Ligação configurada"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedConnectionId} onChange={event => { setSelectedConnectionId(event.target.value); setValidation(null); }}><option value="">Selecionar ligação</option>{connections.data?.map(item => <option value={item.id} key={item.id}>{item.displayName} · {item.provider}</option>)}</select></Field>
        {selected && <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><p>Endpoint: <code>{selected.baseUrl}{selected.contactPath}</code></p><p className="mt-1">Autenticação: <strong>{selected.authType}</strong> · Segredo: <strong>{selected.secretEnvKey || "não aplicável"}</strong></p></div>}
        <Button className="w-full" variant="outline" disabled={!selectedId || validate.isPending} onClick={() => validate.mutate({ connectionId: selectedId! })}>{validate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}Validar ligação</Button>
        {validation && <div className={`rounded-xl p-3 text-sm ${validation.valid ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}><p className="font-semibold">{validation.valid ? "Ligação validada" : "Ligação não validada"}</p><p className="mt-1 text-xs">{validation.endpoint || validation.message || validation.reason}{validation.status ? ` · HTTP ${validation.status}` : ""}</p></div>}
        <div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" disabled={!selectedId || preview.isFetching} onClick={() => preview.refetch()}>{preview.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}Pré-visualizar</Button><Button variant="outline" disabled={!selectedId || sync.isPending} onClick={() => sync.mutate({ connectionId: selectedId!, execute: false })}>{sync.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Braces className="mr-2 h-4 w-4" />}Simular lote</Button></div>
        <Button className="w-full bg-teal-700 hover:bg-teal-800" disabled={!selectedId || !validation?.valid || sync.isPending} onClick={() => sync.mutate({ connectionId: selectedId!, execute: true })}><Play className="mr-2 h-4 w-4" />Executar sincronização real</Button>
        {preview.data && <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Pré-visualização ({preview.data.length})</p><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{JSON.stringify(preview.data, null, 2)}</pre></div>}
      </CardContent></Card>
    </div>
    <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-5 w-5 text-teal-700" />Histórico de sincronizações</CardTitle></CardHeader><CardContent>{history.data?.length ? <div className="divide-y divide-slate-100">{history.data.map(run => <div className="flex flex-wrap items-center justify-between gap-3 py-3" key={run.id}><div><p className="text-sm font-medium text-slate-800">Execução #{run.id}</p><p className="text-xs text-slate-500">{new Date(run.startedAt).toLocaleString("pt-PT")} · {run.succeededCount}/{run.totalCount} contactos</p></div><Badge variant="secondary" className={run.status === "concluida" ? "bg-emerald-50 text-emerald-700" : run.status === "simulada" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800"}>{run.status}</Badge></div>)}</div> : <p className="py-8 text-center text-sm text-slate-500">Ainda não existem execuções CRM.</p>}</CardContent></Card>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
