// Storage adapter: MinIO/S3 in self-hosted production, Forge storage while the
// managed development environment remains active.

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";
import { getObjectStorageConfig } from "./storage-config";

const objectStorage = getObjectStorageConfig({
  S3_ENDPOINT: ENV.s3Endpoint,
  S3_PUBLIC_ENDPOINT: ENV.s3PublicEndpoint,
  S3_REGION: ENV.s3Region,
  S3_BUCKET: ENV.s3Bucket,
  S3_ACCESS_KEY_ID: ENV.s3AccessKeyId,
  S3_SECRET_ACCESS_KEY: ENV.s3SecretAccessKey,
  S3_FORCE_PATH_STYLE: ENV.s3ForcePathStyle ? "true" : "false",
});

const s3Client = objectStorage
  ? new S3Client({
      endpoint: objectStorage.endpoint,
      region: objectStorage.region,
      forcePathStyle: objectStorage.forcePathStyle,
      credentials: {
        accessKeyId: objectStorage.accessKeyId,
        secretAccessKey: objectStorage.secretAccessKey,
      },
    })
  : null;

const publicS3Client = objectStorage && s3Client
  ? new S3Client({
      endpoint: objectStorage.publicEndpoint ?? objectStorage.endpoint,
      region: objectStorage.region,
      forcePathStyle: objectStorage.forcePathStyle,
      credentials: {
        accessKeyId: objectStorage.accessKeyId,
        secretAccessKey: objectStorage.secretAccessKey,
      },
    })
  : null;

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set S3_* for MinIO/S3 or BUILT_IN_FORGE_API_* for managed development.",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

async function getObjectStorageSignedUrl(key: string): Promise<string> {
  if (!objectStorage || !publicS3Client) throw new Error("Object storage is not configured.");
  return getSignedUrl(
    publicS3Client,
    new GetObjectCommand({ Bucket: objectStorage.bucket, Key: key }),
    { expiresIn: 15 * 60 },
  );
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));

  if (objectStorage && s3Client) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: objectStorage.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
    return { key, url: await getObjectStorageSignedUrl(key) };
  }

  const { forgeUrl, forgeKey } = getForgeConfig();
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  if (objectStorage && s3Client) return { key, url: await getObjectStorageSignedUrl(key) };
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  if (objectStorage && s3Client) return getObjectStorageSignedUrl(key);

  const { forgeUrl, forgeKey } = getForgeConfig();
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}
