import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { friendlyAuthErrorMessage, INVALID_EMAIL_MESSAGE, isValidEmail } from "@/lib/auth-validation";
import { ArrowLeft, KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type Mode = "login" | "register" | "recover";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.localAuth.login.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); setLocation("/"); }, onError: error => toast.error(friendlyAuthErrorMessage(error, "Não foi possível iniciar sessão. Confirme os seus dados e tente novamente.")) });
  const register = trpc.localAuth.register.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); setLocation("/"); }, onError: error => toast.error(friendlyAuthErrorMessage(error, "Não foi possível criar a conta. Reveja os dados e tente novamente.")) });
  const recover = trpc.localAuth.requestPasswordReset.useMutation({ onSuccess: () => toast.success("Pedido registado. O envio de instruções será ativado quando o fornecedor de email for configurado."), onError: error => toast.error(friendlyAuthErrorMessage(error, "Não foi possível pedir a recuperação de acesso.")) });
  const submitting = login.isPending || register.isPending || recover.isPending;

  const submit = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) return toast.error(INVALID_EMAIL_MESSAGE);
    if (mode === "recover") return recover.mutate({ email: normalizedEmail });
    if (mode === "register") return register.mutate({ name: name.trim(), email: normalizedEmail, password });
    login.mutate({ email: normalizedEmail, password });
  };

  const copy = mode === "login" ? { title: "Bem-vindo de volta", description: "Aceda ao centro de controlo documental e financeiro.", action: "Iniciar sessão" } : mode === "register" ? { title: "Criar organização", description: "Comece uma área de trabalho segura para a sua equipa.", action: "Criar conta" } : { title: "Recuperar acesso", description: "O pedido é tratado de forma segura; o envio de instruções é ativado na configuração de produção.", action: "Pedir recuperação" };
  return <main className="min-h-screen bg-[#eff9f7] p-5 md:p-10"><div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-emerald-100 bg-white shadow-2xl shadow-emerald-950/10 lg:grid-cols-[1.1fr_0.9fr]"><section className="hidden bg-[#08282c] p-12 text-white lg:flex lg:flex-col lg:justify-between"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-300 text-[#08282c]"><ShieldCheck className="h-6 w-6" /></div><div><p className="text-lg font-bold">DocuFlux</p><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300">Control room</p></div></div><div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Operação segura</p><h1 className="mt-5 max-w-md text-5xl font-semibold leading-[1.03] tracking-tight">Documentos, tesouraria e decisões num só fluxo.</h1><p className="mt-6 max-w-md text-base leading-7 text-white/65">Cada organização mantém os seus dados, documentos e integrações isolados, com rastreabilidade em cada ação.</p></div><p className="text-sm text-white/45">Acesso protegido por sessão segura e controlo por organização.</p></section><section className="flex items-center justify-center p-6 sm:p-12"><Card className="w-full max-w-md border-0 shadow-none"><CardHeader className="px-0"><div className="mb-6 flex items-center gap-2 lg:hidden"><div className="grid h-9 w-9 place-items-center rounded-xl bg-teal-700 text-white"><ShieldCheck className="h-5 w-5" /></div><p className="font-bold text-slate-900">DocuFlux</p></div>{mode !== "login" && <button className="mb-5 flex w-fit items-center gap-2 text-sm text-slate-500 hover:text-teal-700" onClick={() => setMode("login")}><ArrowLeft className="h-4 w-4" />Voltar ao acesso</button>}<CardTitle className="text-3xl tracking-tight text-slate-950">{copy.title}</CardTitle><CardDescription className="pt-2 text-sm leading-6">{copy.description}</CardDescription></CardHeader><CardContent className="space-y-5 px-0">{mode === "register" && <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={event => setName(event.target.value)} placeholder="Nome da pessoa responsável" autoComplete="name" /></div>}<div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="nome@empresa.pt" autoComplete="email" /></div>{mode !== "recover" && <div className="space-y-2"><div className="flex items-center justify-between"><Label>Palavra-passe</Label>{mode === "login" && <button className="text-xs font-medium text-teal-700 hover:underline" onClick={() => setMode("recover")}>Esqueceu-se?</button>}</div><Input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Mínimo 12 caracteres, letras e números" autoComplete={mode === "login" ? "current-password" : "new-password"} /></div>}<Button className="w-full bg-teal-700 hover:bg-teal-800" disabled={submitting || !email || (mode !== "recover" && !password) || (mode === "register" && !name)} onClick={submit}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === "recover" ? <KeyRound className="mr-2 h-4 w-4" /> : <LockKeyhole className="mr-2 h-4 w-4" />}{copy.action}</Button>{mode === "login" && <p className="pt-2 text-center text-sm text-slate-500">Ainda não tem conta? <button className="font-semibold text-teal-700 hover:underline" onClick={() => setMode("register")}>Criar organização</button></p>}</CardContent></Card></section></div></main>;
}
