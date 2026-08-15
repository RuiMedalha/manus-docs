import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { FolderCog, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function SettingsPage() {
  const context = trpc.tenant.context.useQuery();
  const [folderPattern, setFolderPattern] = useState("");
  const utils = trpc.useUtils();
  useEffect(() => { if (context.data?.tenant.folderPattern) setFolderPattern(context.data.tenant.folderPattern); }, [context.data?.tenant.folderPattern]);
  const save = trpc.tenant.updateFolderPattern.useMutation({
    onSuccess: () => { toast.success("Padrão de pastas atualizado."); utils.tenant.context.invalidate(); },
    onError: error => toast.error("Não foi possível guardar.", { description: error.message }),
  });
  return <div className="mx-auto max-w-4xl space-y-6 px-1 py-3 md:px-5 md:py-6"><header><p className="text-sm font-medium text-teal-700">Configuração do tenant</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Definições</h1><p className="mt-2 text-sm text-slate-500">Ajuste as convenções automáticas aplicadas à organização ativa.</p></header><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FolderCog className="h-5 w-5 text-teal-700" />Padrão de pastas</CardTitle><CardDescription>Este padrão é usado quando não existe uma regra de maior prioridade aplicável ao documento.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="space-y-2"><Label htmlFor="folder-pattern">Caminho base</Label><Input id="folder-pattern" value={folderPattern} onChange={event => setFolderPattern(event.target.value)} placeholder="/{Ano}/{Mes}/{Tipo}/{Entidade}" /><p className="text-xs leading-5 text-slate-500">Pode usar <code>{"{Ano}"}</code>, <code>{"{Mes}"}</code>, <code>{"{Tipo}"}</code> e <code>{"{Entidade}"}</code>.</p></div><Button className="bg-teal-700 hover:bg-teal-800" disabled={save.isPending || folderPattern.trim().length < 4} onClick={() => save.mutate({ folderPattern: folderPattern.trim() })}><Save className="mr-2 h-4 w-4" />Guardar padrão</Button></CardContent></Card></div>;
}
