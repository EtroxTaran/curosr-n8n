import { createFileRoute } from "@tanstack/react-router";
import { getServerSession } from "@/lib/auth";
import { getN8nConfig } from "@/lib/settings";
import { getWorkflow, type N8nWorkflow } from "@/lib/n8n-api";
import {
  createRequestContext,
  logRequestStart,
  logRequestComplete,
  logRequestError,
  withCorrelationId,
} from "@/lib/request-context";

interface ExportWorkflowRequest {
  workflowId: string;
}

interface SanitizedWorkflow {
  name: string;
  nodes: SanitizedNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: Record<string, unknown>;
}

interface SanitizedNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  // credentials are intentionally stripped
}

/**
 * Sanitize workflow for export by removing:
 * - id, createdAt, updatedAt, versionId (n8n metadata)
 * - active (should be false on import)
 * - tags (read-only field)
 * - credentials from all nodes (security)
 */
function sanitizeForExport(workflow: N8nWorkflow): SanitizedWorkflow {
  const sanitizedNodes: SanitizedNode[] = (workflow.nodes || []).map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    typeVersion: node.typeVersion,
    position: node.position,
    parameters: node.parameters,
    // credentials intentionally omitted
  }));

  return {
    name: workflow.name,
    nodes: sanitizedNodes,
    connections: workflow.connections || {},
    settings: workflow.settings,
    staticData: workflow.staticData,
  };
}

/**
 * Generate a safe filename from workflow name.
 */
function generateFilename(workflowName: string): string {
  // Convert name to kebab-case
  const kebabName = workflowName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${kebabName}.json`;
}

/**
 * POST /api/workflows/export
 *
 * Export a workflow from n8n as a sanitized JSON file.
 * Strips credentials and n8n-specific metadata for safe git storage.
 */
export const Route = createFileRoute("/api/workflows/export")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now();
        const ctx = createRequestContext(request);
        const log = ctx.logger.child({ operation: "export-workflow" });

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
              { error: "n8n is not configured" },
              { status: 400 }
            );
            logRequestComplete(ctx, 400, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          // Parse request body
          const body = (await request.json()) as ExportWorkflowRequest;

          if (!body.workflowId) {
            const response = Response.json(
              { error: "workflowId is required" },
              { status: 400 }
            );
            logRequestComplete(ctx, 400, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          log.info("Exporting workflow", { workflowId: body.workflowId });

          // Fetch workflow from n8n
          const workflow = await getWorkflow(body.workflowId, config);

          // Sanitize for export
          const sanitized = sanitizeForExport(workflow);

          // Generate filename
          const filename = generateFilename(workflow.name);

          // Format JSON with proper indentation
          const content = JSON.stringify(sanitized, null, 2);

          log.info("Workflow exported successfully", {
            workflowId: body.workflowId,
            workflowName: workflow.name,
            filename,
            nodeCount: sanitized.nodes.length,
          });

          const response = Response.json({
            success: true,
            filename,
            workflowName: workflow.name,
            content,
            nodeCount: sanitized.nodes.length,
          });

          logRequestComplete(ctx, 200, Date.now() - startTime);
          return withCorrelationId(response, ctx.correlationId);
        } catch (error) {
          log.error("Failed to export workflow", { error });
          logRequestError(ctx, error, 500);

          const response = Response.json(
            {
              error: "Failed to export workflow",
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
