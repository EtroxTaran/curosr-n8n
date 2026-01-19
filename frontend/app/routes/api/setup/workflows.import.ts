import { createFileRoute } from "@tanstack/react-router";
import { getServerSession } from "@/lib/auth";
import {
  importWorkflow,
  importAllWorkflows,
  dryRunImport,
} from "@/lib/workflow-importer";
import { getN8nConfig } from "@/lib/settings";
import {
  createRequestContext,
  logRequestStart,
  logRequestComplete,
  logRequestError,
  withCorrelationId,
} from "@/lib/request-context";

interface ImportWorkflowsRequest {
  filename?: string; // Specific file, or omit for all
  forceUpdate?: boolean;
  dryRun?: boolean; // Preview import without making changes
  clearRegistryFirst?: boolean; // Clear registry before import (prevents stale ID errors)
}

/**
 * POST /api/setup/workflows/import
 *
 * Import one or all workflows to n8n.
 * Requires authentication and n8n to be configured.
 */
export const Route = createFileRoute("/api/setup/workflows/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now();
        const ctx = createRequestContext(request);
        const log = ctx.logger.child({ operation: "import-workflows" });

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

          // Check n8n is configured
          const config = await getN8nConfig();
          if (!config) {
            const response = Response.json(
              { error: "n8n is not configured. Please configure n8n first." },
              { status: 400 }
            );
            logRequestComplete(ctx, 400, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          // Parse request body
          const body = (await request.json()) as ImportWorkflowsRequest;
          const forceUpdate = body.forceUpdate || false;
          const dryRun = body.dryRun || false;
          const clearRegistryFirst = body.clearRegistryFirst || false;

          // Handle dry-run mode - preview without making changes
          if (dryRun) {
            log.info("Running dry-run import preview", { forceUpdate });

            const dryRunResult = await dryRunImport(
              undefined, // Use default workflows dir
              config, // configOverride
              forceUpdate
            );

            const response = Response.json({
              success: true,
              dryRun: true,
              preview: dryRunResult,
              summary: {
                total: dryRunResult.workflows.length,
                wouldImport: dryRunResult.workflows.filter(
                  (w) => w.action === "create"
                ).length,
                wouldUpdate: dryRunResult.workflows.filter(
                  (w) => w.action === "update"
                ).length,
                wouldSkip: dryRunResult.workflows.filter(
                  (w) => w.action === "skip"
                ).length,
                validationErrors: dryRunResult.validation.errors.length,
                validationWarnings: dryRunResult.validation.warnings.length,
              },
              webhookBaseUrl: config.webhookBaseUrl,
            });

            logRequestComplete(ctx, 200, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          if (body.filename) {
            // Import single workflow
            log.info("Importing single workflow", {
              filename: body.filename,
              forceUpdate,
            });

            const result = await importWorkflow(body.filename, {
              forceUpdate,
              configOverride: config,
            });

            const response = Response.json({
              success: result.status !== "failed",
              results: [result],
              webhookBaseUrl: config.webhookBaseUrl,
            });

            logRequestComplete(ctx, 200, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          } else {
            // Import all workflows
            log.info("Importing all workflows", { forceUpdate, clearRegistryFirst });

            const progress = await importAllWorkflows(undefined, {
              forceUpdate,
              configOverride: config,
              clearRegistryFirst,
            });

            const failedCount = progress.results.filter(
              (r) => r.status === "failed"
            ).length;

            const response = Response.json({
              success: failedCount === 0,
              results: progress.results,
              summary: {
                total: progress.total,
                imported: progress.results.filter((r) => r.status === "imported")
                  .length,
                updated: progress.results.filter((r) => r.status === "updated")
                  .length,
                skipped: progress.results.filter((r) => r.status === "skipped")
                  .length,
                failed: failedCount,
              },
              webhookBaseUrl: config.webhookBaseUrl,
            });

            logRequestComplete(ctx, 200, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }
        } catch (error) {
          log.error("Failed to import workflows", { error });
          logRequestError(ctx, error, 500);

          const response = Response.json(
            {
              error: "Failed to import workflows",
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
