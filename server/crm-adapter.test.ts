import { describe, expect, it } from "vitest";
import { classifyCrmConnectionStatus, crmEndpoint, crmHeaders, crmPayload, validateCrmConnection, valueAtPath } from "./crm-adapter";

const config = { baseUrl: "https://crm.example/api/", contactPath: "/contacts", syncMethod: "PATCH" as const, authType: "bearer" as const, externalIdPath: "data.id", fieldMapping: { name: "company_name", nif: "vat", email: "email", type: "kind" } };
const contact = { id: 1, entityType: "fornecedor" as const, name: "ACME", nif: "PT123", email: "info@acme.pt", phone: null, address: null, externalCrmId: "c-42" };

describe("adaptador CRM universal", () => {
  it("traduz os campos DocuFlux para a convenção do CRM", () => expect(crmPayload(config, contact)).toEqual({ company_name: "ACME", vat: "PT123", email: "info@acme.pt", kind: "fornecedor" }));
  it("atualiza contactos externos por identificador e cria cabeçalhos seguros", () => { expect(crmEndpoint(config, contact)).toBe("https://crm.example/api/contacts/c-42"); expect(crmHeaders("bearer", "token").Authorization).toBe("Bearer token"); expect(valueAtPath({ data: { id: "99" } }, "data.id")).toBe("99"); });
  it("classifica falhas de autenticação e endpoint antes da sincronização", () => { expect(classifyCrmConnectionStatus(204)).toEqual({ valid: true, reason: "ok" }); expect(classifyCrmConnectionStatus(401).reason).toBe("authentication"); expect(classifyCrmConnectionStatus(404).reason).toBe("endpoint"); });
  it("valida autenticação, endpoint e rede através de um pedido controlado", async () => { const missing = await validateCrmConnection(config); expect(missing.reason).toBe("secret_missing"); const unauthorized = await validateCrmConnection(config, "token", async () => new Response("", { status: 401 })); expect(unauthorized.reason).toBe("authentication"); const missingPath = await validateCrmConnection(config, "token", async () => new Response("", { status: 404 })); expect(missingPath.reason).toBe("endpoint"); const offline = await validateCrmConnection(config, "token", async () => { throw new Error("offline"); }); expect(offline.reason).toBe("network"); });
});
