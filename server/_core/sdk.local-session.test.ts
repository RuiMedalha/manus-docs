import { describe, expect, it } from "vitest";
import { resolveSessionAppId } from "./sdk";

describe("identidade de sessão local", () => {
  it("usa o identificador autoalojado quando não existe app id Manus", () => {
    expect(resolveSessionAppId("")).toBe("docuflux-local");
  });

  it("preserva o identificador Manus quando configurado", () => {
    expect(resolveSessionAppId("manus-project-id")).toBe("manus-project-id");
  });
});
