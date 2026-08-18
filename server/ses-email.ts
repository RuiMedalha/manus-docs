import nodemailer from "nodemailer";

type SesSmtpConfig = { host: string; username: string; password: string; from: string; port: number };

export function getSesSmtpConfig(env: NodeJS.ProcessEnv = process.env): SesSmtpConfig | null {
  const host = env.SES_SMTP_HOST?.trim();
  const username = env.SES_SMTP_USER?.trim();
  const password = env.SES_SMTP_PASSWORD?.trim();
  const from = env.SES_FROM_EMAIL?.trim();
  if (!host || !username || !password || !from) return null;
  const port = Number(env.SES_SMTP_PORT ?? "587");
  return { host, username, password, from, port: Number.isInteger(port) && port > 0 ? port : 587 };
}

export function buildPasswordResetEmail(resetUrl: string) {
  return {
    subject: "DocuFlux — repor palavra-passe",
    text: `Recebemos um pedido para repor a sua palavra-passe. Use este link dentro dos próximos 30 minutos: ${resetUrl}\n\nSe não pediu esta alteração, pode ignorar esta mensagem.`,
    html: `<p>Recebemos um pedido para repor a sua palavra-passe no DocuFlux.</p><p><a href="${resetUrl}">Repor palavra-passe</a></p><p>Este link expira em 30 minutos. Se não pediu esta alteração, pode ignorar esta mensagem.</p>`,
  };
}

export async function sendPasswordResetWithSes(input: { to: string; resetUrl: string }) {
  const config = getSesSmtpConfig();
  if (!config) return { delivered: false as const, reason: "not_configured" as const };
  const transport = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.port === 465, auth: { user: config.username, pass: config.password } });
  const message = buildPasswordResetEmail(input.resetUrl);
  await transport.sendMail({ from: config.from, to: input.to, ...message });
  return { delivered: true as const };
}
