export type OutlookEnvironmentConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  microsoftTenantId: string;
};

export function getOutlookEnvironmentConfig(): { config: OutlookEnvironmentConfig | null; missing: string[] } {
  const config = {
    clientId: process.env.MICROSOFT_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? "",
    redirectUri: process.env.MICROSOFT_REDIRECT_URI?.trim() ?? "",
    microsoftTenantId: process.env.MICROSOFT_TENANT_ID?.trim() || "common",
  };
  const missing = [
    !config.clientId && "MICROSOFT_CLIENT_ID",
    !config.clientSecret && "MICROSOFT_CLIENT_SECRET",
    !config.redirectUri && "MICROSOFT_REDIRECT_URI",
  ].filter(Boolean) as string[];
  return { config: missing.length ? null : config, missing };
}
