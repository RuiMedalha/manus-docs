import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { ArrowRight, BadgeCheck, Building2, CheckCircle2, FileUp, Landmark, PlugZap, ReceiptText, Users } from "lucide-react";
import { Link } from "wouter";

type Step = { title: string; description: string; path: string; cta: string; complete: boolean; icon: typeof Landmark };

export default function OnboardingPage() {
  const tenant = trpc.tenant.context.useQuery();
  const accounts = trpc.masterData.accounts.useQuery();
  const categories = trpc.masterData.categories.useQuery();
  const documents = trpc.documents.list.useQuery();
  const members = trpc.tenant.members.useQuery();
  const crm = trpc.masterData.crm.useQuery();
  const steps: Step[] = [
    { title: "Definir conta de débito", description: "Crie a conta bancária usada nas aprovações e no calendário de pagamentos.", path: "/financeiro", cta: "Criar conta", complete: Boolean(accounts.data?.some(account => account.accountType === "banco" && account.isActive)), icon: Landmark },
    { title: "Organizar categorias", description: "Crie pelo menos uma categoria de despesa para classificar faturas e políticas.", path: "/financeiro", cta: "Criar categoria", complete: Boolean(categories.data?.some(category => category.direction === "despesa" && category.isActive)), icon: ReceiptText },
    { title: "Carregar o primeiro documento", description: "Envie uma fatura ou recibo para a Inbox e reveja as sugestões OCR.", path: "/inbox", cta: "Abrir Inbox", complete: Boolean(documents.data?.length), icon: FileUp },
    { title: "Convidar a equipa", description: "Associe os papéis de contabilidade, operação e aprovação à organização.", path: "/organizacao", cta: "Gerir equipa", complete: (members.data?.length ?? 0) > 1, icon: Users },
    { title: "Preparar a integração CRM", description: "Configure o mapeamento de contactos antes da primeira sincronização manual.", path: "/crm", cta: "Abrir CRM", complete: Boolean(crm.data?.some(connection => connection.status === "configurada")), icon: PlugZap },
  ];
  const done = steps.filter(step => step.complete).length;
  const completion = Math.round((done / steps.length) * 100);
  return <div className="docuflux-page mx-auto max-w-6xl space-y-6 px-1 py-3 md:px-5 md:py-6"><section className="overflow-hidden rounded-[1.75rem] bg-[#08282c] p-7 text-white shadow-xl shadow-emerald-950/15 md:p-10"><div className="grid gap-8 md:grid-cols-[1fr_240px] md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Lançamento orientado</p><h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">A sua organização está a {completion}% do primeiro fluxo completo.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">Conclua esta sequência para passar de uma fatura carregada a um pagamento aprovado, classificado e pronto para conciliação.</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><p className="text-4xl font-semibold text-emerald-300">{done}<span className="text-lg text-white/50">/{steps.length}</span></p><p className="mt-1 text-sm text-white/60">etapas concluídas</p><Progress value={completion} className="mt-4 h-2 bg-white/10" /></div></div></section><header><p className="text-sm font-medium text-teal-700">{tenant.data?.tenant.name ?? "Organização"}</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Checklist de ativação</h2><p className="mt-2 text-sm text-slate-500">A conclusão é calculada automaticamente a partir da configuração real do tenant.</p></header><div className="grid gap-4 lg:grid-cols-2">{steps.map((step, index) => <StepCard key={step.title} index={index + 1} step={step} />)}</div><Card className="border-teal-100 bg-teal-50/60"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 h-5 w-5 text-teal-700" /><p className="text-sm leading-6 text-teal-900">Quando as etapas essenciais estiverem concluídas, teste o fluxo completo com um documento real anonimizado: OCR, entidade, proposta de pagamento, aprovação e conciliação.</p></div><Link href="/dashboard"><Button variant="outline" className="border-teal-200 bg-white text-teal-800 hover:bg-teal-100">Visão geral</Button></Link></CardContent></Card></div>;
}

function StepCard({ step, index }: { step: Step; index: number }) { const Icon = step.icon; return <Card className={`border-slate-200 shadow-sm transition ${step.complete ? "bg-emerald-50/35" : "bg-white"}`}><CardHeader className="flex-row items-start gap-4 space-y-0"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${step.complete ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600"}`}>{step.complete ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}</div><div><CardTitle className="text-base">{index}. {step.title}</CardTitle><CardDescription className="mt-1.5 leading-5">{step.description}</CardDescription></div></CardHeader><CardContent className="flex justify-end"><Link href={step.path}><Button size="sm" variant={step.complete ? "outline" : "default"} className={step.complete ? "border-emerald-200 bg-white text-emerald-800" : "bg-teal-700 hover:bg-teal-800"}>{step.complete ? "Rever" : step.cta}<ArrowRight className="ml-2 h-3.5 w-3.5" /></Button></Link></CardContent></Card>; }
