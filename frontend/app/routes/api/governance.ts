import { createFileRoute } from "@tanstack/react-router";
import { GovernanceResponseSchema } from "@/lib/schemas";
import { fetchWithRetry, type RetryOptions } from "@/lib/n8n";
import { getServerSession } from "@/lib/auth";
import {
  createRequestContext,
  logRequestStart,
  logRequestComplete,
  logRequestError,
  withCorrelationId,
} from "@/lib/request-context";

export const Route = createFileRoute("/api/governance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now();
        const ctx = createRequestContext(request);
        const log = ctx.logger.child({ operation: "governance-submit" });

        logRequestStart(ctx);

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

        try {
          const body = await request.json();

          // Validate request body with Zod
          const parseResult = GovernanceResponseSchema.safeParse(body);
          if (!parseResult.success) {
            log.warn("Invalid governance request payload", {
              errors: parseResult.error.flatten().fieldErrors,
            });
            const response = Response.json(
              {
                error: "Invalid governance response",
                details: parseResult.error.flatten().fieldErrors,
              },
              { status: 400 }
            );
            logRequestComplete(ctx, 400, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          const governanceResponse = parseResult.data;

          log.info("Processing governance decisions", {
            projectId: governanceResponse.project_id,
            scavengingId: governanceResponse.scavenging_id,
            decisionsCount: governanceResponse.decisions.length,
          });

          // Forward to n8n webhook for batch governance processing
          const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
          if (!n8nWebhookUrl) {
            throw new Error("N8N_WEBHOOK_URL is not configured");
          }

          const webhookEndpoint = `${n8nWebhookUrl}/governance-batch`;

          // Use fetchWithRetry for resilience against transient failures
          const retryOptions: RetryOptions = {
            maxRetries: 3,
            baseDelayMs: 1000,
            maxDelayMs: 30000,
            timeoutMs: 60000, // 1 minute timeout for governance processing
            onRetry: (error, attempt) => {
              log.warn("n8n webhook retry", {
                attempt,
                error: error.message,
                webhookEndpoint,
              });
            },
          };

          const n8nResponse = await fetchWithRetry(
            webhookEndpoint,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-correlation-id": ctx.correlationId,
              },
              body: JSON.stringify(governanceResponse),
            },
            retryOptions
          );

          if (!n8nResponse.ok) {
            const errorText = await n8nResponse.text();
            log.error("n8n governance webhook failed", new Error(errorText), {
              statusCode: n8nResponse.status,
              webhookEndpoint,
            });
            const response = Response.json(
              {
                error: "Failed to process governance decisions",
                message: `n8n returned ${n8nResponse.status}`,
              },
              { status: 502 }
            );
            logRequestComplete(ctx, 502, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          // Parse n8n response if any
          let n8nResult = {};
          try {
            n8nResult = await n8nResponse.json();
          } catch {
            // n8n might not return JSON
          }

          const approvedCount = governanceResponse.decisions.filter(
            (d) => d.action === "approve"
          ).length;

          log.info("Governance decisions processed successfully", {
            projectId: governanceResponse.project_id,
            decisionsCount: governanceResponse.decisions.length,
            approvedCount,
          });

          const response = Response.json({
            success: true,
            message: "Governance decisions submitted successfully",
            scavenging_id: governanceResponse.scavenging_id,
            decisions_count: governanceResponse.decisions.length,
            approved_count: approvedCount,
            n8n_response: n8nResult,
          });

          logRequestComplete(ctx, 200, Date.now() - startTime);
          return withCorrelationId(response, ctx.correlationId);
        } catch (error) {
          logRequestError(ctx, error, 500);
          const response = Response.json(
            {
              error: "Failed to process governance decisions",
              message: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
          );
          logRequestComplete(ctx, 500, Date.now() - startTime);
          return withCorrelationId(response, ctx.correlationId);
        }
      },
    },
  },
});
