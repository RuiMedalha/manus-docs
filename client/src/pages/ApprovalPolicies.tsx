import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Loader2, Pencil, Plus, Power, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const roles = ["admin", "contabilidade", "operador", "aprovador"] as const;
type Role = (typeof roles)[number];
type Policy = { id: number; name: string; minAmountCents: number; categoryId: number | null; requiredRole: Role; enabled: boolean };

export default function ApprovalPoliciesPage() {
  const utils = trpc.useUtils();
  const policies = trpc.payments.listPolicies.useQuery();
  const categories = trpc.masterData.categories.useQuery();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");
  const [categoryId, setCategoryId] = useState("all");
  const [role, setRole] = useState<Role>("aprovador");
  const create = trpc.payments.createPolicy.useMutation({ onSuccess: () => { toast.success("Política de aprovação criada."); setName(""); setAmount("0"); setCategoryId("all"); utils.payments.listPolicies.invalidate(); }, onError: error => toast.error(error.message) });
  const submit = () => {
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return toast.error("Indique um montante válido.");
    create.mutate({ name: name.trim(), minAmountCents: Math.round(parsed * 100), categoryId: categoryId === "all" ? null : Number(categoryId), requiredRole: role });
  };
  return <div className="docuflux-page mx-auto max-w-5xl space-y-6 px-1 py-3 md:px-5 md:py-6"><header><p className="text-sm font-medium text-teal-700">Governação financeira</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Políticas de aprovação</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">Defina quem pode aprovar pagamentos conforme o valor e, opcionalmente, a categoria de despesa. A regra mais exigente aplicável é avaliada antes da aprovação.</p></header><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-teal-700" />Nova política</CardTitle><CardDescription>Os administradores configuram as regras; o pagamento continua a exigir uma conta bancária e categoria ativas.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><Field label="Nome"><Input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Despesas acima de 1.000 €" /></Field><Field label="Valor mínimo (€)"><Input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></Field><Field label="Categoria"><CategorySelect categories={categories.data ?? []} value={categoryId} onChange={setCategoryId} /></Field><Field label="Papel exigido"><RoleSelect value={role} onChange={setRole} /></Field><div className="md:col-span-2 lg:col-span-4"><Button disabled={create.isPending || name.trim().length < 2} onClick={submit}>{create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Criar política</Button></div></CardContent></Card><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle>Regras ativas</CardTitle><CardDescription>Edite, suspenda ou remova regras. Todas as alterações ficam registadas na auditoria.</CardDescription></CardHeader><CardContent>{policies.isLoading ? <p className="py-8 text-center text-sm text-slate-500">A carregar políticas…</p> : policies.data?.length ? <div className="space-y-3">{policies.data.map(policy => <PolicyRow key={policy.id} policy={policy} categories={categories.data ?? []} />)}</div> : <p className="py-10 text-center text-sm text-slate-500">Ainda não existem políticas. Sem regras configuradas, aplica-se o fluxo de aprovação normal.</p>}</CardContent></Card></div>;
}

function PolicyRow({ policy, categories }: { policy: Policy; categories: Array<{ id: number; code: string; name: string; direction: string; isActive: boolean }> }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(policy.name);
  const [amount, setAmount] = useState(String(policy.minAmountCents / 100));
  const [categoryId, setCategoryId] = useState(policy.categoryId ? String(policy.categoryId) : "all");
  const [role, setRole] = useState<Role>(policy.requiredRole);
  const invalidate = () => utils.payments.listPolicies.invalidate();
  const update = trpc.payments.updatePolicy.useMutation({ onSuccess: () => { toast.success("Política atualizada."); setEditing(false); invalidate(); }, onError: error => toast.error(error.message) });
  const remove = trpc.payments.deletePolicy.useMutation({ onSuccess: () => { toast.success("Política removida."); invalidate(); }, onError: error => toast.error(error.message) });
  const save = () => { const parsed = Number(amount.replace(",", ".")); if (!name.trim() || !Number.isFinite(parsed) || parsed < 0) return toast.error("Reveja o nome e o valor mínimo."); update.mutate({ id: policy.id, name: name.trim(), minAmountCents: Math.round(parsed * 100), categoryId: categoryId === "all" ? null : Number(categoryId), requiredRole: role }); };
  if (editing) return <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4"><div className="grid gap-3 md:grid-cols-4"><Field label="Nome"><Input value={name} onChange={event => setName(event.target.value)} /></Field><Field label="Valor mínimo (€)"><Input value={amount} inputMode="decimal" onChange={event => setAmount(event.target.value)} /></Field><Field label="Categoria"><CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} /></Field><Field label="Papel exigido"><RoleSelect value={role} onChange={setRole} /></Field></div><div className="mt-4 flex gap-2"><Button size="sm" disabled={update.isPending} onClick={save}>{update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar</Button><Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button></div></div>;
  return <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${policy.enabled ? "border-slate-100" : "border-slate-100 bg-slate-50/70 opacity-70"}`}><div><p className="font-medium text-slate-800">{policy.name}</p><p className="mt-0.5 text-xs text-slate-500">A partir de {(policy.minAmountCents / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}{policy.categoryId ? " · categoria específica" : " · todas as categorias"}</p></div><div className="flex flex-wrap items-center gap-2"><Badge className={policy.enabled ? "bg-teal-50 text-teal-800 hover:bg-teal-50" : "bg-slate-100 text-slate-600 hover:bg-slate-100"}>{policy.enabled ? `Exige: ${policy.requiredRole}` : "Suspensa"}</Badge><Button size="icon" variant="outline" title="Editar política" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="outline" title={policy.enabled ? "Suspender política" : "Ativar política"} disabled={update.isPending} onClick={() => update.mutate({ id: policy.id, enabled: !policy.enabled })}><Power className="h-4 w-4" /></Button><Button size="icon" variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700" title="Remover política" disabled={remove.isPending} onClick={() => { if (window.confirm(`Remover a política “${policy.name}”?`)) remove.mutate({ id: policy.id }); }}><Trash2 className="h-4 w-4" /></Button></div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function CategorySelect({ categories, value, onChange }: { categories: Array<{ id: number; code: string; name: string; direction: string; isActive: boolean }>; value: string; onChange: (value: string) => void }) { return <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={value} onChange={event => onChange(event.target.value)}><option value="all">Todas as categorias</option>{categories.filter(item => item.direction === "despesa" && item.isActive).map(item => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select>; }
function RoleSelect({ value, onChange }: { value: Role; onChange: (value: Role) => void }) { return <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={value} onChange={event => onChange(event.target.value as Role)}>{roles.map(item => <option key={item} value={item}>{item}</option>)}</select>; }
