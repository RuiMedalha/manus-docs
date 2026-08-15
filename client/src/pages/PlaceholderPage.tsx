import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export default function PlaceholderPage({ area }: { area: string }) {
  return <div className="mx-auto max-w-7xl px-1 py-3 md:px-5 md:py-6"><p className="text-sm font-medium text-teal-700">DocuFlux</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{area}</h1><Card className="mt-7 border-slate-200 shadow-sm"><CardContent className="flex min-h-80 flex-col items-center justify-center text-center"><div className="rounded-2xl bg-teal-50 p-4 text-teal-700"><Construction className="h-8 w-8" /></div><Badge className="mt-5 bg-slate-100 text-slate-600 hover:bg-slate-100">Em preparação</Badge><p className="mt-3 max-w-md text-sm leading-6 text-slate-500">Esta área está disponível na navegação e será ligada ao respetivo fluxo do MVP nas próximas etapas.</p></CardContent></Card></div>;
}
