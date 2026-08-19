export const INVALID_EMAIL_MESSAGE = "Indique um email válido, por exemplo nome@empresa.pt.";

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function friendlyAuthErrorMessage(error: { message?: string }, fallback = "Não foi possível concluir o pedido. Tente novamente.") {
  const message = error.message?.trim() ?? "";
  if (message.includes("invalid_format") && (message.includes('"email"') || message.includes("email"))) return INVALID_EMAIL_MESSAGE;
  return message && !message.startsWith("[") ? message : fallback;
}
