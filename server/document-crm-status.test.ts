import { describe, expect, it } from "vitest";
import { resolveDocumentCrmStatus } from "./document-crm-status";

describe("estado CRM do documento", () => {
  it("distingue documento sem contacto, pendente e sincronizado", () => {
    expect(resolveDocumentCrmStatus(null, null)).toBe("unlinked");
    expect(resolveDocumentCrmStatus(4, null)).toBe("pending");
    expect(resolveDocumentCrmStatus(4, "crm-8801")).toBe("synced");
  });
});
