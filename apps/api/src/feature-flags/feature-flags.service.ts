import { ForbiddenException, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { featureFlags } from "../db/schema";

@Injectable()
export class FeatureFlagsService {
  async list() {
    return getDb().select().from(featureFlags);
  }

  /**
   * Env override: `FFOS_FEATURE_<KEY>=true|false` (e.g. FFOS_FEATURE_AI=true).
   * Falls back to `feature_flags.enabled` in DB.
   */
  async isEnabled(key: string): Promise<boolean> {
    const envKey = `FFOS_FEATURE_${key.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
    const env = process.env[envKey];
    if (env === "true" || env === "1") return true;
    if (env === "false" || env === "0") return false;

    const [row] = await getDb()
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, key))
      .limit(1);
    return Boolean(row?.enabled);
  }

  async requireEnabled(key: string): Promise<void> {
    if (!(await this.isEnabled(key))) {
      throw new ForbiddenException(`Feature ${key} is disabled`);
    }
  }
}
