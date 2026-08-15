import { describe, expect, it } from "vitest";
import { integrationAdapters, runIntegrationStub, verifyIfthenpaySignature } from "./integrations";
import { createHmac } from "node:crypto";

describe("estruturas de integração", () => {
  it("declara os três adaptadores exigidos pelo MVP", () => {
    expect(integrationAdapters.map(adapter => adapter.provider)).toEqual(["woocommerce", "ifthenpay", "moloni"]);
  });
  it("valida assinaturas de callback com comparação segura", () => {
    const payload = "order_id=42&amount=10.00";
    const signature = createHmac("sha256", "segredo").update(payload).digest("hex");
    expect(verifyIfthenpaySignature(payload, signature, "segredo")).toBe(true);
    expect(verifyIfthenpaySignature(payload, "invalida", "segredo")).toBe(false);
  });
  it("expõe uma operação stub específica por fornecedor", () => {
    expect(runIntegrationStub("woocommerce")).toMatchObject({ operation: "orders:sync", status: "pending_credentials" });
    expect(runIntegrationStub("ifthenpay")).toMatchObject({ operation: "payments:ingest", status: "pending_callback_secret" });
  });
});
