import { createFileRoute } from "@tanstack/react-router";
import { getServerSession } from "@/lib/auth";
import { saveN8nConfig, getN8nConfig, isN8nConfigured } from "@/lib/settings";
import { testConnection } from "@/lib/n8n-api";
import {
  createRequestContext,
  logRequestStart,
  logRequestComplete,
  logRequestError,
  withCorrelationId,
} from "@/lib/request-context";

interface SaveConfigRequest {
  apiUrl: string;
  apiKey?: string; // Optional - if empty, use existing key
  webhookBaseUrl?: string;
}

/**
 * POST /api/setup/n8n/save-config
 *
 * Save n8n configuration (API URL and key).
 * API key is encrypted before storage.
 * Requires authentication.
 */
export const Route = createFileRoute("/api/setup/n8n/save-config")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now();
        const ctx = createRequestContext(request);
        const log = ctx.logger.child({ operation: "save-n8n-config" });

        logRequestStart(ctx);

        try {
          // Check authentication
          const session = await getServerSession(request.headers);
          if (!session?.user) {
            const response = Response.json(
              { error: "Authentication required" },
              { status: 401 }
            );
            logRequestComplete(ctx, 401, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          // Parse request body
          const body = (await request.json()) as SaveConfigRequest;

          // Validate required fields
          if (!body.apiUrl || !body.apiUrl.trim()) {
            const response = Response.json(
              { error: "n8n API URL is required" },
              { status: 400 }
            );
            logRequestComplete(ctx, 400, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          // Normalize URLs
          const apiUrl = body.apiUrl.trim().replace(/\/+$/, "");
          const webhookBaseUrl = body.webhookBaseUrl?.trim().replace(/\/+$/, "") || apiUrl;

          // Determine which API key to use
          let apiKeyToUse: string;

          if (body.apiKey && body.apiKey.trim()) {
            // User provided a new API key
            apiKeyToUse = body.apiKey.trim();
          } else {
            // No new API key provided - check if n8n is already configured
            const alreadyConfigured = await isN8nConfigured();
            if (!alreadyConfigured) {
              // First time setup - API key is required
              const response = Response.json(
                { error: "n8n API key is required for initial configuration" },
                { status: 400 }
              );
              logRequestComplete(ctx, 400, Date.now() - startTime);
              return withCorrelationId(response, ctx.correlationId);
            }

            // Use existing API key from database
            const existingConfig = await getN8nConfig();
            if (!existingConfig?.apiKey) {
              const response = Response.json(
                { error: "Unable to retrieve existing API key. Please provide a new one." },
                { status: 400 }
              );
              logRequestComplete(ctx, 400, Date.now() - startTime);
              return withCorrelationId(response, ctx.correlationId);
            }
            apiKeyToUse = existingConfig.apiKey;
            log.info("Using existing API key (not provided in request)");
          }

          // Verify the connection works before saving
          log.info("Verifying n8n connection before saving", { apiUrl });
          const connectionTest = await testConnection(apiUrl, apiKeyToUse);

          if (!connectionTest.success) {
            const response = Response.json(
              {
                error: "Cannot save configuration: connection test failed",
                details: connectionTest.error,
              },
              { status: 400 }
            );
            logRequestComplete(ctx, 400, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          // Save the configuration
          await saveN8nConfig({
            apiUrl,
            apiKey: apiKeyToUse,
            webhookBaseUrl,
            updatedBy: session.user.id,
          });

          log.info("n8n configuration saved", {
            apiUrl,
            webhookBaseUrl,
            userId: session.user.id,
          });

          const response = Response.json({
            success: true,
            message: "n8n configuration saved successfully",
          });

          logRequestComplete(ctx, 200, Date.now() - startTime);
          return withCorrelationId(response, ctx.correlationId);
        } catch (error) {
          log.error("Failed to save n8n configuration", { error });
          logRequestError(ctx, error, 500);

          const response = Response.json(
            {
              error: "Failed to save configuration",
              message: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
          );

          return withCorrelationId(response, ctx.correlationId);
        }
      },
    },
  },
});
