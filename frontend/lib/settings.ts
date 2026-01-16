import { query, queryOne, execute } from "@/lib/db";
import { encrypt, decrypt, mask, isEncryptionConfigured } from "@/lib/encryption";
import logger from "@/lib/logger";

/**
 * Application settings management module.
 *
 * Provides CRUD operations for app_settings table with automatic
 * encryption/decryption of sensitive values.
 */

const log = logger.child({ component: "settings" });

// ============================================
// PostgreSQL Error Detection Helpers
// ============================================

/**
 * Check if an error is a PostgreSQL "undefined function" error.
 * PostgreSQL error code 42883 = undefined_function
 */
function isPostgresUndefinedFunctionError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const pgError = error as { code?: string; message?: string };
    // PostgreSQL error code for undefined_function
    if (pgError.code === "42883") return true;
    // Also check message for the pattern (in case code isn't available)
    if (
      pgError.message?.includes("function") &&
      pgError.message?.includes("does not exist")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an error is a PostgreSQL "undefined table/view" error.
 * PostgreSQL error code 42P01 = undefined_table
 */
function isPostgresUndefinedTableError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const pgError = error as { code?: string; message?: string };
    if (pgError.code === "42P01") return true;
    if (
      pgError.message?.includes("relation") &&
      pgError.message?.includes("does not exist")
    ) {
      return true;
    }
  }
  return false;
}

// ============================================
// JSONB Value Parsing Helper
// ============================================

/**
 * Safely parse a JSONB value from PostgreSQL.
 *
 * The pg driver automatically parses JSONB columns into JavaScript values.
 * However, in some edge cases (or when types are incorrectly specified),
 * the value might still be a JSON string. This helper handles both cases.
 *
 * @param value - The value from a JSONB column (may be parsed or string)
 * @returns The parsed JavaScript value
 */
function parseJsonbValue<T = unknown>(value: unknown): T {
  // If it's already not a string, it was auto-parsed by pg
  if (typeof value !== "string") {
    return value as T;
  }

  // If it's a string, try to parse it (it might be a JSON string)
  try {
    return JSON.parse(value) as T;
  } catch {
    // If parsing fails, return as-is (it's a plain string value)
    return value as T;
  }
}

// Type definitions
export interface Setting {
  id: string;
  setting_key: string;
  setting_value: unknown;
  setting_type: "string" | "number" | "boolean" | "json" | "encrypted";
  description: string | null;
  is_sensitive: boolean;
  created_at: Date;
  updated_at: Date;
  updated_by: string | null;
}

export interface SettingInput {
  key: string;
  value: unknown;
  type?: Setting["setting_type"];
  description?: string;
  isSensitive?: boolean;
  updatedBy?: string;
}

// Database row type
interface SettingRow {
  id: string;
  setting_key: string;
  setting_value: string; // JSONB stored as string
  setting_type: string;
  description: string | null;
  is_sensitive: boolean;
  created_at: Date;
  updated_at: Date;
  updated_by: string | null;
}

/**
 * Get a setting value by key.
 * Automatically decrypts encrypted values.
 *
 * @param key - The setting key (e.g., "n8n.api_url")
 * @returns The setting value, or null if not found
 */
export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const row = await queryOne<SettingRow>(
    "SELECT * FROM app_settings WHERE setting_key = $1",
    [key]
  );

  if (!row) {
    return null;
  }

  let value = parseJsonbValue(row.setting_value);

  // Decrypt if this is an encrypted value
  if (row.setting_type === "encrypted" && typeof value === "string") {
    try {
      value = decrypt(value);
    } catch (error) {
      log.error("Failed to decrypt setting", { key, error });
      throw new Error(`Failed to decrypt setting: ${key}`);
    }
  }

  return value as T;
}

/**
 * Get multiple settings by keys.
 *
 * @param keys - Array of setting keys
 * @returns Object mapping keys to values (missing keys are omitted)
 */
export async function getSettings(
  keys: string[]
): Promise<Record<string, unknown>> {
  if (keys.length === 0) {
    return {};
  }

  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await query<SettingRow>(
    `SELECT * FROM app_settings WHERE setting_key IN (${placeholders})`,
    keys
  );

  const result: Record<string, unknown> = {};

  for (const row of rows) {
    let value = parseJsonbValue(row.setting_value);

    if (row.setting_type === "encrypted" && typeof value === "string") {
      try {
        value = decrypt(value);
      } catch (error) {
        log.error("Failed to decrypt setting", { key: row.setting_key, error });
        // Skip failed decryptions rather than throwing
        continue;
      }
    }

    result[row.setting_key] = value;
  }

  return result;
}

/**
 * Set a setting value.
 * Automatically encrypts sensitive values.
 *
 * @param input - Setting input object
 */
export async function setSetting(input: SettingInput): Promise<void> {
  const {
    key,
    value,
    type = "string",
    description,
    isSensitive = false,
    updatedBy,
  } = input;

  let storedValue = value;
  let storedType = type;

  // Encrypt sensitive values
  if (isSensitive || type === "encrypted") {
    if (!isEncryptionConfigured()) {
      throw new Error(
        "Cannot store encrypted setting: encryption not configured. " +
          "Ensure AUTH_SECRET is set."
      );
    }

    if (typeof value !== "string") {
      throw new Error("Encrypted values must be strings");
    }

    storedValue = encrypt(value);
    storedType = "encrypted";
  }

  await execute(
    `INSERT INTO app_settings (setting_key, setting_value, setting_type, description, is_sensitive, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (setting_key) DO UPDATE SET
       setting_value = EXCLUDED.setting_value,
       setting_type = EXCLUDED.setting_type,
       description = COALESCE(EXCLUDED.description, app_settings.description),
       is_sensitive = EXCLUDED.is_sensitive,
       updated_by = EXCLUDED.updated_by`,
    [
      key,
      JSON.stringify(storedValue),
      storedType,
      description ?? null,
      isSensitive || storedType === "encrypted",
      updatedBy ?? null,
    ]
  );

  log.info("Setting updated", {
    key,
    type: storedType,
    isSensitive: isSensitive || storedType === "encrypted",
  });
}

/**
 * Delete a setting by key.
 *
 * @param key - The setting key to delete
 * @returns true if deleted, false if not found
 */
export async function deleteSetting(key: string): Promise<boolean> {
  const affected = await execute(
    "DELETE FROM app_settings WHERE setting_key = $1",
    [key]
  );
  return affected > 0;
}

/**
 * Get a setting with its metadata (for display in UI).
 * Sensitive values are masked.
 *
 * @param key - The setting key
 * @returns Setting with masked value if sensitive
 */
export async function getSettingForDisplay(
  key: string
): Promise<(Setting & { displayValue: string }) | null> {
  const row = await queryOne<SettingRow>(
    "SELECT * FROM app_settings WHERE setting_key = $1",
    [key]
  );

  if (!row) {
    return null;
  }

  let value = parseJsonbValue(row.setting_value);
  let displayValue: string;

  if (row.setting_type === "encrypted" || row.is_sensitive) {
    // For encrypted values, decrypt first then mask
    // Encrypted values are always stored as strings (ciphertext)
    try {
      const decrypted = decrypt(value as string);
      displayValue = mask(decrypted, { showFirst: 3, showLast: 4 });
    } catch {
      displayValue = "********";
    }
  } else {
    displayValue = typeof value === "string" ? value : JSON.stringify(value);
  }

  return {
    id: row.id,
    setting_key: row.setting_key,
    setting_value: row.is_sensitive ? "[REDACTED]" : value,
    setting_type: row.setting_type as Setting["setting_type"],
    description: row.description,
    is_sensitive: row.is_sensitive,
    created_at: row.created_at,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
    displayValue,
  };
}

// ============================================
// Fallback Implementations for Missing DB Functions
// ============================================
// These functions query tables directly when PostgreSQL functions don't exist
// (e.g., when upgrading from a version before the setup wizard was added)

/**
 * Fallback for isSetupComplete when is_setup_complete() function doesn't exist.
 * Queries app_settings table directly.
 */
async function isSetupCompleteFallback(): Promise<boolean> {
  try {
    const row = await queryOne<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key = $1",
      ["setup.wizard_completed"]
    );
    if (!row) return false;

    // JSONB value could be stored as "true" or true
    const value = parseJsonbValue(row.setting_value);
    return value === true;
  } catch (tableError) {
    // Table doesn't exist either - fresh deployment needs migration
    if (isPostgresUndefinedTableError(tableError)) {
      log.warn("app_settings table not found - setup not complete");
      return false;
    }
    throw tableError;
  }
}

/**
 * Fallback for isN8nConfigured when is_n8n_configured() function doesn't exist.
 * Queries app_settings table directly.
 */
async function isN8nConfiguredFallback(): Promise<boolean> {
  try {
    const rows = await query<{ setting_key: string; setting_value: string }>(
      `SELECT setting_key, setting_value FROM app_settings
       WHERE setting_key IN ($1, $2)`,
      ["n8n.api_url", "n8n.api_key"]
    );

    if (rows.length < 2) return false;

    const urlRow = rows.find((r) => r.setting_key === "n8n.api_url");
    const keyRow = rows.find((r) => r.setting_key === "n8n.api_key");

    if (!urlRow || !keyRow) return false;

    // Check values are not empty
    const urlValue = parseJsonbValue(urlRow.setting_value);
    const keyValue = parseJsonbValue(keyRow.setting_value);

    return Boolean(urlValue && urlValue !== "" && keyValue && keyValue !== "");
  } catch (tableError) {
    if (isPostgresUndefinedTableError(tableError)) {
      log.warn("app_settings table not found - n8n not configured");
      return false;
    }
    throw tableError;
  }
}

/**
 * Fallback for getSetupStatus when setup_status view doesn't exist.
 * Queries tables directly and composes the result.
 */
async function getSetupStatusFallback(): Promise<{
  n8n_configured: boolean;
  wizard_completed: boolean;
  workflows_imported: string;
  workflows_total: string;
}> {
  try {
    // Get n8n configuration status
    const n8nConfigured = await isN8nConfiguredFallback();

    // Get wizard completion status
    const wizardCompleted = await isSetupCompleteFallback();

    // Get workflow counts from workflow_registry
    let workflowsImported = "0";
    let workflowsTotal = "0";

    try {
      const countResult = await queryOne<{ imported: string; total: string }>(`
        SELECT
          COUNT(*) FILTER (WHERE import_status = 'imported')::text AS imported,
          COUNT(*)::text AS total
        FROM workflow_registry
      `);

      if (countResult) {
        workflowsImported = countResult.imported;
        workflowsTotal = countResult.total;
      }
    } catch (workflowError) {
      // workflow_registry may not exist - that's okay
      if (!isPostgresUndefinedTableError(workflowError)) {
        throw workflowError;
      }
    }

    return {
      n8n_configured: n8nConfigured,
      wizard_completed: wizardCompleted,
      workflows_imported: workflowsImported,
      workflows_total: workflowsTotal,
    };
  } catch (error) {
    log.error("getSetupStatusFallback failed", { error });
    // Return safe defaults
    return {
      n8n_configured: false,
      wizard_completed: false,
      workflows_imported: "0",
      workflows_total: "0",
    };
  }
}

// ============================================
// n8n-specific helpers
// ============================================

/**
 * Check if n8n is configured (has both URL and API key).
 * Uses database function if available, falls back to direct query.
 */
export async function isN8nConfigured(): Promise<boolean> {
  try {
    const result = await queryOne<{ configured: boolean }>(
      "SELECT is_n8n_configured() as configured"
    );
    return result?.configured ?? false;
  } catch (error) {
    if (isPostgresUndefinedFunctionError(error)) {
      log.debug("is_n8n_configured() function not found, using fallback");
      return await isN8nConfiguredFallback();
    }
    throw error;
  }
}

/**
 * Get n8n configuration for use in API calls.
 * Returns null if not configured.
 */
export async function getN8nConfig(): Promise<{
  apiUrl: string;
  apiKey: string;
  webhookBaseUrl: string;
} | null> {
  const settings = await getSettings([
    "n8n.api_url",
    "n8n.api_key",
    "n8n.webhook_base_url",
  ]);

  const apiUrl = settings["n8n.api_url"] as string | undefined;
  const apiKey = settings["n8n.api_key"] as string | undefined;
  const webhookBaseUrl = settings["n8n.webhook_base_url"] as string | undefined;

  if (!apiUrl || !apiKey) {
    return null;
  }

  return {
    apiUrl,
    apiKey,
    webhookBaseUrl: webhookBaseUrl || apiUrl, // Default webhook URL to API URL
  };
}

/**
 * Save n8n configuration.
 */
export async function saveN8nConfig(config: {
  apiUrl: string;
  apiKey: string;
  webhookBaseUrl?: string;
  updatedBy?: string;
}): Promise<void> {
  const { apiUrl, apiKey, webhookBaseUrl, updatedBy } = config;

  await Promise.all([
    setSetting({
      key: "n8n.api_url",
      value: apiUrl,
      type: "string",
      description: "n8n instance API URL",
      updatedBy,
    }),
    setSetting({
      key: "n8n.api_key",
      value: apiKey,
      type: "encrypted",
      description: "n8n API key",
      isSensitive: true,
      updatedBy,
    }),
    setSetting({
      key: "n8n.webhook_base_url",
      value: webhookBaseUrl || apiUrl,
      type: "string",
      description: "Base URL for n8n webhooks",
      updatedBy,
    }),
    setSetting({
      key: "n8n.configured_at",
      value: new Date().toISOString(),
      type: "string",
      description: "When n8n was configured",
      updatedBy,
    }),
  ]);

  log.info("n8n configuration saved", { apiUrl, updatedBy });
}

/**
 * Clear n8n configuration.
 */
export async function clearN8nConfig(): Promise<void> {
  await Promise.all([
    deleteSetting("n8n.api_url"),
    deleteSetting("n8n.api_key"),
    deleteSetting("n8n.webhook_base_url"),
    deleteSetting("n8n.configured_at"),
    deleteSetting("n8n.last_health_check"),
  ]);

  log.info("n8n configuration cleared");
}

// ============================================
// Setup wizard helpers
// ============================================

/**
 * Check if setup wizard has been completed.
 */
export async function isSetupComplete(): Promise<boolean> {
  try {
    const result = await queryOne<{ complete: boolean }>(
      "SELECT is_setup_complete() as complete"
    );
    return result?.complete ?? false;
  } catch (error) {
    if (isPostgresUndefinedFunctionError(error)) {
      log.debug("is_setup_complete() function not found, using fallback");
      return await isSetupCompleteFallback();
    }
    throw error;
  }
}

/**
 * Mark setup wizard as complete.
 */
export async function completeSetup(userId?: string): Promise<void> {
  await Promise.all([
    setSetting({
      key: "setup.wizard_completed",
      value: true,
      type: "boolean",
      description: "Whether setup wizard has been completed",
      updatedBy: userId,
    }),
    setSetting({
      key: "setup.wizard_completed_at",
      value: new Date().toISOString(),
      type: "string",
      description: "When setup wizard was completed",
      updatedBy: userId,
    }),
    setSetting({
      key: "setup.wizard_completed_by",
      value: userId || "unknown",
      type: "string",
      description: "User who completed setup wizard",
      updatedBy: userId,
    }),
  ]);

  log.info("Setup wizard marked as complete", { userId });
}

/**
 * Mark setup wizard as skipped (user chose manual configuration).
 */
export async function skipSetup(userId?: string): Promise<void> {
  await setSetting({
    key: "setup.wizard_skipped",
    value: true,
    type: "boolean",
    description: "Whether user skipped setup wizard",
    updatedBy: userId,
  });

  log.info("Setup wizard skipped", { userId });
}

/**
 * Get full setup status for the setup wizard.
 */
export async function getSetupStatus(): Promise<{
  wizardCompleted: boolean;
  wizardSkipped: boolean;
  n8nConfigured: boolean;
  workflowsImported: number;
  workflowsTotal: number;
  lastHealthCheck: { timestamp: string; healthy: boolean } | null;
}> {
  let status: {
    n8n_configured: boolean;
    wizard_completed: boolean;
    workflows_imported: string;
    workflows_total: string;
  } | null = null;

  try {
    // Try to use the optimized view
    status = await queryOne<{
      n8n_configured: boolean;
      wizard_completed: boolean;
      workflows_imported: string;
      workflows_total: string;
    }>("SELECT * FROM setup_status");
  } catch (error) {
    if (isPostgresUndefinedTableError(error)) {
      log.debug("setup_status view not found, using fallback");
      status = await getSetupStatusFallback();
    } else {
      throw error;
    }
  }

  let skipped: boolean | null = null;
  let healthCheck: { timestamp: string; healthy: boolean } | null = null;

  try {
    skipped = await getSetting<boolean>("setup.wizard_skipped");
  } catch (error) {
    if (!isPostgresUndefinedTableError(error)) {
      throw error;
    }
    // Table doesn't exist - skipped is false
  }

  try {
    healthCheck = await getSetting<{ timestamp: string; healthy: boolean }>(
      "n8n.last_health_check"
    );
  } catch (error) {
    if (!isPostgresUndefinedTableError(error)) {
      throw error;
    }
    // Table doesn't exist - no health check
  }

  return {
    wizardCompleted: status?.wizard_completed ?? false,
    wizardSkipped: skipped ?? false,
    n8nConfigured: status?.n8n_configured ?? false,
    workflowsImported: parseInt(status?.workflows_imported ?? "0", 10),
    workflowsTotal: parseInt(status?.workflows_total ?? "0", 10),
    lastHealthCheck: healthCheck ?? null,
  };
}

/**
 * Update last health check result.
 */
export async function updateHealthCheck(healthy: boolean): Promise<void> {
  await setSetting({
    key: "n8n.last_health_check",
    value: {
      timestamp: new Date().toISOString(),
      healthy,
    },
    type: "json",
    description: "Last n8n health check result",
  });
}
