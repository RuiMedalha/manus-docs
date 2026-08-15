import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, FileWarning, FolderOpen, Landmark, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

const statusLabel = { novo: "Novos", processado: "Processados", em_revisao: "Em revisão", arquivado: "Arquivados" } as const;

export default function Dashboard() {
  const context = trpc.tenant.context.useQuery();
  const documents = trpc.documents.list.useQuery();
  const counts = documents.data?.reduce<Record<string, number>>((acc, doc) => {
    acc[doc.status] = (acc[doc.status] ?? 0) + 1;
    return acc;
  }, {}) ?? {};

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-1 py-3 md:px-5 md:py-6">
      <header className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-8 text-white md:px-9">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-teal-400/20 blur-2xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm font-medium tracking-[0.18em] text-teal-300 uppercase">Operações financeiras</p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Bom trabalho. O seu fluxo está sob controlo.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Centralize documentos, extratos e decisões de conciliação num único espaço seguro.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-xs text-slate-300">Organização ativa</p>
            <p className="mt-1 font-medium">{context.data?.tenant.name ?? "A carregar…"}</p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(statusLabel).map(([status, label]) => (
          <Card key={status} className="border-slate-200 shadow-sm">
            <CardContent className="flex items-center justify-between p-5">
              <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-semibold text-slate-900">{documents.isLoading ? "—" : counts[status] ?? 0}</p></div>
              <div className="rounded-xl bg-teal-50 p-3 text-teal-700"><FolderOpen className="h-5 w-5" /></div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="text-base">Documentos recentes</CardTitle><Link href="/inbox" className="flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800">Abrir Inbox <ArrowUpRight className="h-4 w-4" /></Link></CardHeader>
          <CardContent className="space-y-2">
            {documents.isLoading ? <><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></> : documents.data?.length ? documents.data.slice(0, 5).map(doc => <div key={doc.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{doc.originalFilename}</p><p className="mt-1 text-xs text-slate-500">{doc.entityName || "Sem entidade"} · {new Date(doc.createdAt).toLocaleDateString("pt-PT")}</p></div><Badge variant="secondary" className="ml-3 bg-slate-100 text-slate-600">{statusLabel[doc.status]}</Badge></div>) : <div className="py-10 text-center text-sm text-slate-500">Ainda não existem documentos na Inbox.</div>}
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Próximos passos</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <div className="flex gap-3"><span className="rounded-lg bg-amber-50 p-2 text-amber-700"><FileWarning className="h-4 w-4" /></span><p><strong className="block text-slate-800">Carregue os documentos recebidos</strong>A Inbox verifica repetições pelo hash do ficheiro.</p></div>
            <div className="flex gap-3"><span className="rounded-lg bg-sky-50 p-2 text-sky-700"><Landmark className="h-4 w-4" /></span><p><strong className="block text-slate-800">Importe o extrato bancário</strong>Mapeie as colunas uma única vez e reutilize o modelo.</p></div>
            <div className="flex gap-3"><span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><ShieldCheck className="h-4 w-4" /></span><p><strong className="block text-slate-800">Mantenha a rastreabilidade</strong>As decisões críticas ficam registadas por organização.</p></div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
