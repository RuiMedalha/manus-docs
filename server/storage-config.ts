export type ObjectStorageConfig = {
  endpoint?: string;
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export function getObjectStorageConfig(env: Record<string, string | undefined>): ObjectStorageConfig | null {
  const bucket = env.S3_BUCKET?.trim();
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();

  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  const endpoint = env.S3_ENDPOINT?.trim().replace(/\/+$/, "") || undefined;
  const publicEndpoint = env.S3_PUBLIC_ENDPOINT?.trim().replace(/\/+$/, "") || undefined;
  return {
    endpoint,
    publicEndpoint,
    region: env.S3_REGION?.trim() || "us-east-1",
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
  };
}
