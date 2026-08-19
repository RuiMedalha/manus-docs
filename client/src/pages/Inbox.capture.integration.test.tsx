// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InboxPage from "./Inbox";

const mocked = vi.hoisted(() => ({
  readQrFromImage: vi.fn(),
  uploadMutate: vi.fn(),
  importSupplierLinks: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/at-qr", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/at-qr")>();
  return { ...actual, readQrFromImage: mocked.readQrFromImage };
});

vi.mock("@/lib/trpc", () => {
  const mutation = (mutate = vi.fn()) => ({ mutate, isPending: false });
  return {
    trpc: {
      useUtils: () => ({ ocr: { jobs: { invalidate: mocked.invalidate }, config: { invalidate: mocked.invalidate } }, documents: { list: { invalidate: mocked.invalidate } } }),
      documents: {
        list: { useQuery: () => ({ data: [], isLoading: false }) },
        get: { useQuery: () => ({ data: undefined, isFetching: false }) },
        upload: { useMutation: (options: { onSuccess?: () => void }) => ({ mutate: (input: unknown) => { mocked.uploadMutate(input); options.onSuccess?.(); }, isPending: false }) },
        updateMetadata: { useMutation: () => mutation() },
        moveFolder: { useMutation: () => mutation() },
      },
      ocr: {
        config: { useQuery: () => ({ data: { automaticEnabled: false } }) },
        jobs: { useQuery: () => ({ data: [] }) },
        processNow: { useMutation: () => mutation() },
        queue: { useMutation: () => mutation() },
        applySuggestion: { useMutation: () => mutation() },
        enableAutomatic: { useMutation: () => mutation() },
        disableAutomatic: { useMutation: () => mutation() },
      },
      outlook: {
        status: { useQuery: () => ({ data: { connection: { status: "autorizada" } } }) },
        previewSupplierLinks: { useQuery: () => ({ data: [{ messageId: "mail-1", url: "https://www.moloni.pt/documentos/123?token=secreto", hostname: "www.moloni.pt", provider: "Moloni", subject: "A sua fatura", fromAddress: "faturas@moloni.pt" }], isLoading: false, isFetching: false, isError: false, refetch: mocked.invalidate }) },
        importSupplierLinks: { useMutation: (options: { onSuccess?: (data: { results: Array<{ status: string }> }) => void }) => ({ mutate: (input: unknown) => { mocked.importSupplierLinks(input); options.onSuccess?.({ results: [{ status: "imported" }] }); }, isPending: false }) },
      },
      tenant: { context: { useQuery: () => ({ data: { tenant: { name: "Teste" } } }) } },
    },
  };
});

describe("captura QR AT na Inbox", () => {
  beforeEach(() => {
    mocked.readQrFromImage.mockReset();
    mocked.uploadMutate.mockReset();
    mocked.importSupplierLinks.mockReset();
  });
  afterEach(cleanup);

  it("mostra QR detetado, pré-preenche os campos e envia-os ao upload", async () => {
    let resolveQr: (value: unknown) => void = () => undefined;
    mocked.readQrFromImage.mockImplementation(() => new Promise(resolve => { resolveQr = resolve; }));
    const { container } = render(<InboxPage />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const photo = new File(["photo"], "fatura.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [photo] } });
    expect(screen.getAllByText("A procurar QR Code AT na fotografia…").length).toBeGreaterThan(0);
    resolveQr({ raw: "A:PT500000000*D:FT*F:20250724*G:FT 2025/123", issuerNif: "PT500000000", documentTypeCode: "FT", documentNumber: "FT 2025/123", documentDate: "2025-07-24", atcud: "CSDF7T5E-123" });

    await screen.findByText("QR Code AT detetado");
    expect(screen.getByDisplayValue("FT 2025/123")).toBeTruthy();
    expect(screen.getByDisplayValue("PT500000000")).toBeTruthy();
    expect(screen.getByDisplayValue("2025-07-24")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Guardar na Inbox" }));
    await waitFor(() => expect(mocked.uploadMutate).toHaveBeenCalledWith(expect.objectContaining({ nif: "PT500000000", documentNumber: "FT 2025/123", documentDate: "2025-07-24", documentType: "fatura_recebida" })));
    expect(screen.getByText("Documento guardado. A análise OCR ficou na fila para revisão.")).toBeTruthy();
  });

  it("mostra a continuação por OCR quando uma fotografia não contém QR", async () => {
    mocked.readQrFromImage.mockResolvedValue(null);
    const { container } = render(<InboxPage />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["photo"], "sem-qr.jpg", { type: "image/jpeg" })] } });
    await screen.findByText("Não foi encontrado QR Code AT nesta imagem. Pode continuar: o OCR fará a leitura do documento.");
  });

  it("só obtém um link de fornecedor quando o utilizador o seleciona e confirma", async () => {
    render(<InboxPage />);
    expect(mocked.importSupplierLinks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Rever links de email" }));
    await screen.findByText("Moloni · www.moloni.pt");
    expect(screen.getByText("www.moloni.pt/documentos/123")).toBeTruthy();
    expect(screen.queryByText(/token=secreto/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Selecionar link Moloni"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar obtenção" }));
    expect(mocked.importSupplierLinks).toHaveBeenCalledWith({ links: [{ messageId: "mail-1", url: "https://www.moloni.pt/documentos/123?token=secreto" }] });
  });
});
