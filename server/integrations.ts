import { createHmac, timingSafeEqual } from "node:crypto";

export type IntegrationProvider = "woocommerce" | "ifthenpay" | "moloni";
export type IntegrationAdapter = {
  provider: IntegrationProvider;
  label: string;
  description: string;
  capabilities: string[];
};

export const integrationAdapters: IntegrationAdapter[] = [
  { provider: "woocommerce", label: "WooCommerce", description: "Sincronização de encomendas e referências de pagamento por organização.", capabilities: ["orders:sync", "orders:lookup"] },
  { provider: "ifthenpay", label: "Ifthenpay", description: "Receção e validação de callbacks de pagamento antes de os associar a encomendas.", capabilities: ["callback:verify", "payments:ingest"] },
  { provider: "moloni", label: "Moloni", description: "Importação futura de faturas e PDFs através de um conector isolado.", capabilities: ["invoices:sync", "documents:ingest"] },
];

export function runIntegrationStub(provider: IntegrationProvider) {
  const adapter = integrationAdapters.find(item => item.provider === provider);
  if (!adapter) throw new Error("Integração desconhecida.");
  if (provider === "woocommerce") return { provider, operation: "orders:sync", status: "pending_credentials" as const };
  if (provider === "ifthenpay") return { provider, operation: "payments:ingest", status: "pending_callback_secret" as const };
  return { provider, operation: "invoices:sync", status: "pending_credentials" as const };
}

export function verifyIfthenpaySignature(payload: string, receivedSignature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const provided = Buffer.from(receivedSignature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return provided.length === expectedBuffer.length && timingSafeEqual(provided, expectedBuffer);
}
