import { supportedDocumentTypes, validateDocumentUpload } from "./upload-policy";

const VENDORS = [
  { provider: "Moloni", hostname: "moloni.pt" },
  { provider: "TOConline", hostname: "toconline.pt" },
] as const;

export type SupplierInvoiceLink = {
  url: string;
  hostname: string;
  provider: "Moloni" | "TOConline";
};

function providerForHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return VENDORS.find(vendor => normalized === vendor.hostname || normalized.endsWith(`.${vendor.hostname}`));
}

export function extractSupplierInvoiceLinks(content: string, maxLinks = 5): SupplierInvoiceLink[] {
  const candidates = content.match(/https:\/\/[^\s"'<>]+/gi) ?? [];
  const seen = new Set<string>();
  const links: SupplierInvoiceLink[] = [];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate.replace(/[),.;]+$/, ""));
      const vendor = providerForHostname(url.hostname);
      if (!vendor || seen.has(url.toString())) continue;
      seen.add(url.toString());
      links.push({ url: url.toString(), hostname: url.hostname.toLowerCase(), provider: vendor.provider });
      if (links.length === maxLinks) break;
    } catch { /* ignora texto que se assemelha a URL */ }
  }
  return links;
}

function filenameFromResponse(response: Response, url: URL) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const filenameMatch = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  const fromHeader = filenameMatch?.[1] ? decodeURIComponent(filenameMatch[1].trim().replace(/^"|"$/g, "")) : null;
  return (fromHeader || url.pathname.split("/").at(-1) || "documento-email.pdf").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

async function readLimitedBytes(response: Response, maxBytes = 10 * 1024 * 1024) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("O ficheiro indicado pelo link excede o limite de 10 MB.");
  if (!response.body) return Buffer.from(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("O ficheiro indicado pelo link excede o limite de 10 MB.");
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
}

export async function downloadApprovedSupplierDocument(input: { url: string; fetcher?: typeof fetch; maxRedirects?: number }) {
  const fetcher = input.fetcher ?? fetch;
  const maxRedirects = input.maxRedirects ?? 2;
  let current = new URL(input.url);
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    if (current.protocol !== "https:" || !providerForHostname(current.hostname)) throw new Error("O link não pertence a um domínio Moloni ou TOConline aprovado.");
    const response = await fetcher(current, { method: "GET", redirect: "manual", headers: { Accept: "application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("O fornecedor devolveu um redirecionamento sem destino.");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`O fornecedor não disponibilizou o documento (${response.status}). O link pode ter expirado ou exigir acesso no portal.`);
    const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].toLowerCase();
    if (!supportedDocumentTypes.has(contentType)) throw new Error("O link não devolveu um PDF, JPG, PNG ou DOCX elegível. Não foi importado qualquer ficheiro.");
    const bytes = await readLimitedBytes(response);
    const validationError = validateDocumentUpload(contentType, bytes.length);
    if (validationError) throw new Error(validationError);
    return { bytes, contentType, filename: filenameFromResponse(response, current), hostname: current.hostname.toLowerCase() };
  }
  throw new Error("O link excedeu o número permitido de redirecionamentos aprovados.");
}
