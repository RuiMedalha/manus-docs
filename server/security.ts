export type TenantRole = "admin" | "contabilidade" | "operador" | "aprovador";
export type TenantPermission = "members:manage" | "documents:write" | "imports:write" | "reconciliation:review" | "settings:manage";

const permissions: Record<TenantRole, TenantPermission[]> = {
  admin: ["members:manage", "documents:write", "imports:write", "reconciliation:review", "settings:manage"],
  contabilidade: ["documents:write", "imports:write", "reconciliation:review"],
  operador: ["documents:write", "imports:write"],
  aprovador: ["reconciliation:review"],
};

export function canPerform(role: TenantRole, permission: TenantPermission) {
  return permissions[role].includes(permission);
}

export function normaliseSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "organizacao";
}
