import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function deriveKey(secret: string) {
  if (!secret) throw new Error("A chave de sessão não está configurada para cifrar a ligação Microsoft.");
  return createHash("sha256").update(secret).digest();
}

export function encryptOutlookToken(token: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptOutlookToken(ciphertext: string, secret: string) {
  const [ivEncoded, tagEncoded, payloadEncoded] = ciphertext.split(".");
  if (!ivEncoded || !tagEncoded || !payloadEncoded) throw new Error("A ligação Microsoft cifrada é inválida.");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(payloadEncoded, "base64url")), decipher.final()]).toString("utf8");
}
