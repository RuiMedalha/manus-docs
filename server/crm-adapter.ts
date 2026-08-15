export type UniversalCrmConfig = {
  baseUrl: string;
  contactPath: string;
  syncMethod: "POST" | "PUT" | "PATCH";
  authType: "bearer" | "api_key" | "basic" | "none";
  externalIdPath: string;
  fieldMapping: Record<string, string>;
};

export type CrmContact = { id: number; entityType: "fornecedor" | "cliente" | "ambos"; name: string; nif: string | null; email: string | null; phone: string | null; address: string | null; externalCrmId: string | null };

export function crmEndpoint(config: UniversalCrmConfig, contact: CrmContact) {
  const base = config.baseUrl.replace(/\/+$/, "");
  const path = `/${config.contactPath.replace(/^\/+/, "")}`;
  return config.syncMethod === "POST" || !contact.externalCrmId ? `${base}${path}` : `${base}${path}/${encodeURIComponent(contact.externalCrmId)}`;
}

export function crmPayload(config: UniversalCrmConfig, contact: CrmContact) {
  const source: Record<string, unknown> = { name: contact.name, nif: contact.nif, email: contact.email, phone: contact.phone, address: contact.address, type: contact.entityType, externalId: contact.externalCrmId };
  return Object.entries(config.fieldMapping).reduce<Record<string, unknown>>((payload, [localField, remoteField]) => {
    const value = source[localField];
    if (remoteField && value !== null && value !== undefined && value !== "") payload[remoteField] = value;
    return payload;
  }, {});
}

export function crmHeaders(authType: UniversalCrmConfig["authType"], secret?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (authType === "bearer" && secret) headers.Authorization = `Bearer ${secret}`;
  if (authType === "api_key" && secret) headers["X-API-Key"] = secret;
  if (authType === "basic" && secret) headers.Authorization = `Basic ${secret}`;
  return headers;
}

export function valueAtPath(payload: unknown, path: string): string | null {
  const value = path.split(".").filter(Boolean).reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, payload);
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

export function classifyCrmConnectionStatus(status: number) {
  if (status >= 200 && status < 300) return { valid: true, reason: "ok" as const };
  if (status === 401 || status === 403) return { valid: false, reason: "authentication" as const };
  if (status === 404) return { valid: false, reason: "endpoint" as const };
  return { valid: false, reason: "unavailable" as const };
}

export async function validateCrmConnection(config: Pick<UniversalCrmConfig, "baseUrl" | "contactPath" | "authType">, secret?: string, request: typeof fetch = fetch) {
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/${config.contactPath.replace(/^\/+/, "")}`;
  if (config.authType !== "none" && !secret) return { valid: false, reason: "secret_missing" as const, endpoint };
  try {
    const response = await request(endpoint, { method: "GET", headers: crmHeaders(config.authType, secret) });
    return { ...classifyCrmConnectionStatus(response.status), status: response.status, endpoint };
  } catch (error) {
    return { valid: false, reason: "network" as const, message: error instanceof Error ? error.message : "Erro de rede desconhecido", endpoint };
  }
}
