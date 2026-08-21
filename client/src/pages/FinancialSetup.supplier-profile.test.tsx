// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FinancialSetupPage from "./FinancialSetup";

const mocked = vi.hoisted(() => ({ saveProfile: vi.fn(), invalidate: vi.fn() }));

vi.mock("@/lib/trpc", () => {
  const mutation = (mutate = vi.fn()) => ({ mutate, isPending: false });
  return {
    trpc: {
      useUtils: () => ({ masterData: { entities: { invalidate: mocked.invalidate }, accounts: { invalidate: mocked.invalidate }, categories: { invalidate: mocked.invalidate }, supplierProfiles: { invalidate: mocked.invalidate }, crm: { invalidate: mocked.invalidate } } }),
      masterData: {
        entities: { useQuery: () => ({ data: [{ id: 9, entityType: "fornecedor", status: "ativo", name: "Samick", nif: "PT500000000" }] }) },
        accounts: { useQuery: () => ({ data: [{ id: 3, accountType: "banco", isActive: true, code: "12", name: "Banco principal" }] }) },
        categories: { useQuery: () => ({ data: [{ id: 4, direction: "despesa", isActive: true, code: "62", name: "Fornecimentos" }] }) },
        supplierProfiles: { useQuery: () => ({ data: [] }) },
        crm: { useQuery: () => ({ data: [] }) },
        createEntity: { useMutation: () => mutation() }, updateEntity: { useMutation: () => mutation() }, createAccount: { useMutation: () => mutation() }, createCategory: { useMutation: () => mutation() }, configureCrm: { useMutation: () => mutation() },
        saveSupplierProfile: { useMutation: () => mutation(mocked.saveProfile) },
      },
    },
  };
});

describe("perfil financeiro de fornecedor", () => {
  beforeEach(() => mocked.saveProfile.mockReset());
  afterEach(cleanup);

  it("guarda a conta bancária e categoria padrão escolhidas", () => {
    const { container } = render(<FinancialSetupPage />);
    const selects = container.querySelectorAll("select");
    fireEvent.change(selects[2], { target: { value: "9" } });
    fireEvent.change(selects[4], { target: { value: "3" } });
    fireEvent.change(selects[5], { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));
    expect(mocked.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ entityId: 9, defaultDebitAccountId: 3, defaultCategoryId: 4 }));
  });
});
