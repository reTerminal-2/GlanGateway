import { createHash } from "crypto";

export interface FeatureFlagContext {
  userId?: string;
  userRole?: string;
  userEmail?: string;
  environment?: string;
}

// Feature flags are now determined purely by environment variables.
// The legacy MongoDB FeatureFlag model has been removed.

export class FeatureFlagService {
  public static async isEnabled(flagKey: string, context: FeatureFlagContext = {}): Promise<boolean> {
    // Check env vars (only source of truth now)
    const envVar = process.env[`FEATURE_${flagKey.toUpperCase().replace(/-/g, "_")}`];
    if (envVar !== undefined) {
      return envVar === "true" || envVar === "1";
    }

    // Default: all features enabled for backwards compatibility
    return true;
  }

  public static async getAllFlags(context: FeatureFlagContext = {}): Promise<Record<string, boolean>> {
    // Return all FEATURE_* env vars as flags
    const result: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith("FEATURE_")) {
        const flagKey = key.replace("FEATURE_", "").toLowerCase().replace(/_/g, "-");
        result[flagKey] = value === "true" || value === "1";
      }
    }
    return result;
  }

  public static clearCache(): void {
    // No-op: no cache needed with env-var-only approach
  }

  public static async createFlag(data: any): Promise<any> {
    return { key: data.key, enabled: data.enabled || false };
  }

  public static async updateFlag(key: string, data: any): Promise<any> {
    return { key, enabled: data.enabled || false };
  }

  public static async deleteFlag(key: string): Promise<void> {
    return;
  }
}

export default FeatureFlagService;
