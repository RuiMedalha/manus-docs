export type ApprovalRole = "admin" | "contabilidade" | "operador" | "aprovador";
export type ApprovalPolicy = { id: number; minAmountCents: number; categoryId: number | null; requiredRole: ApprovalRole; enabled: boolean };

export function resolveApprovalPolicy(policies: ApprovalPolicy[], payment: { amountCents: number; categoryId: number | null }) {
  return policies
    .filter(policy => policy.enabled && policy.minAmountCents <= payment.amountCents && (policy.categoryId === null || policy.categoryId === payment.categoryId))
    .sort((a, b) => b.minAmountCents - a.minAmountCents)[0] ?? null;
}

export function roleMayApprove(actual: ApprovalRole, required: ApprovalRole) {
  if (actual === "admin") return true;
  return actual === required;
}
