import { z } from "zod";

/**
 * Server-side environment variable validation using Zod
 *
 * This module provides centralized validation for all required environment
 * variables. It ensures fail-fast behavior on startup when configuration
 * is missing or invalid.
 */

// Server-side environment schema
const serverEnvSchema = z.object({
  // S3/SeaweedFS Configuration (Required)
  S3_ENDPOINT: z.string().min(1, "S3_ENDPOINT is required"),
  S3_ACCESS_KEY: z.string().min(1, "S3_ACCESS_KEY is required"),
  S3_SECRET_KEY: z.string().min(1, "S3_SECRET_KEY is required"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),
  S3_PUBLIC_ENDPOINT: z.string().optional(),

  // Database (Required)
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // n8n Webhook (Required)
  N8N_WEBHOOK_URL: z.string().min(1, "N8N_WEBHOOK_URL is required"),

  // Auth Configuration (Optional - defaults provided)
  AUTH_SECRET: z.string().optional(),
  AUTH_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  ALLOWED_EMAIL_DOMAINS: z.string().optional(),

  // Runtime
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .optional()
    .default("development"),
});

// Type inference from schema
export type ServerEnv = z.infer<typeof serverEnvSchema>;

// Cached validated environment
let validatedEnv: ServerEnv | null = null;

/**
 * Validate and return environment variables.
 * Throws descriptive error on first call if validation fails.
 * Caches result for subsequent calls.
 */
export function getEnv(): ServerEnv {
  if (!validatedEnv) {
    const result = serverEnvSchema.safeParse(process.env);

    if (!result.success) {
      const errors = result.error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      throw new Error(
        `❌ Environment validation failed:\n${errors}\n\nPlease check your .env file or environment configuration.`
      );
    }

    validatedEnv = result.data;
  }

  return validatedEnv;
}

/**
 * Convenience accessor for individual environment variables.
 * Uses lazy evaluation to defer validation until first access.
 */
export const env = {
  // S3/SeaweedFS
  get s3Endpoint() {
    return getEnv().S3_ENDPOINT;
  },
  get s3AccessKey() {
    return getEnv().S3_ACCESS_KEY;
  },
  get s3SecretKey() {
    return getEnv().S3_SECRET_KEY;
  },
  get s3Bucket() {
    return getEnv().S3_BUCKET;
  },
  get s3PublicEndpoint() {
    return getEnv().S3_PUBLIC_ENDPOINT;
  },

  // Database
  get databaseUrl() {
    return getEnv().DATABASE_URL;
  },

  // n8n
  get n8nWebhookUrl() {
    return getEnv().N8N_WEBHOOK_URL;
  },

  // Auth
  get authSecret() {
    return getEnv().AUTH_SECRET;
  },
  get authUrl() {
    return getEnv().AUTH_URL;
  },
  get googleClientId() {
    return getEnv().GOOGLE_CLIENT_ID;
  },
  get googleClientSecret() {
    return getEnv().GOOGLE_CLIENT_SECRET;
  },
  get allowedEmailDomains() {
    return getEnv().ALLOWED_EMAIL_DOMAINS;
  },

  // Runtime
  get nodeEnv() {
    return getEnv().NODE_ENV;
  },
  get isDevelopment() {
    return getEnv().NODE_ENV === "development";
  },
  get isProduction() {
    return getEnv().NODE_ENV === "production";
  },
};

/**
 * Validate environment on module load in production.
 * In development, defer validation to allow partial configs during testing.
 */
if (process.env.NODE_ENV === "production") {
  try {
    getEnv();
    console.log("✅ Environment validation passed");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
