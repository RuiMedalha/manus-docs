import { describe, expect, it } from "vitest";
import { getObjectStorageConfig } from "./storage-config";

describe("getObjectStorageConfig", () => {
  it("uses a MinIO-compatible path-style configuration when complete credentials exist", () => {
    expect(
      getObjectStorageConfig({
        S3_ENDPOINT: "https://minio.example.test/",
        S3_PUBLIC_ENDPOINT: "https://documents.example.test/",
        S3_REGION: "eu-west-1",
        S3_BUCKET: "docuflux-production",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
      }),
    ).toEqual({
      endpoint: "https://minio.example.test",
      publicEndpoint: "https://documents.example.test",
      region: "eu-west-1",
      bucket: "docuflux-production",
      accessKeyId: "key",
      secretAccessKey: "secret",
      forcePathStyle: true,
    });
  });

  it("returns null when any required object storage credential is absent", () => {
    expect(getObjectStorageConfig({ S3_BUCKET: "docuflux" })).toBeNull();
  });

  it("allows virtual-host style endpoints when explicitly requested", () => {
    const config = getObjectStorageConfig({
      S3_BUCKET: "docuflux",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
      S3_FORCE_PATH_STYLE: "false",
    });
    expect(config?.forcePathStyle).toBe(false);
    expect(config?.region).toBe("us-east-1");
  });

  it("keeps the public endpoint optional for providers that use the same endpoint internally", () => {
    const config = getObjectStorageConfig({
      S3_BUCKET: "docuflux",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
    });
    expect(config?.publicEndpoint).toBeUndefined();
  });
});
