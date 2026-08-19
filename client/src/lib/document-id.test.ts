import { describe, expect, it } from "vitest";
import { validDocumentId } from "./document-id";

describe("validDocumentId", () => {
  it("aceita apenas identificadores inteiros positivos", () => {
    expect(validDocumentId(42)).toBe(42);
    expect(validDocumentId("17")).toBe(17);
    expect(validDocumentId(Number.NaN)).toBeNull();
    expect(validDocumentId(0)).toBeNull();
    expect(validDocumentId("texto")).toBeNull();
  });
});
