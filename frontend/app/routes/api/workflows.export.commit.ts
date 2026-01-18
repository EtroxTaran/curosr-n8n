import { createFileRoute } from "@tanstack/react-router";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
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

const execAsync = promisify(exec);

interface ExportCommitRequest {
  workflowId: string;
  commitMessage?: string;
  filename?: string; // Optional override for filename
}

interface SanitizedNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
}

interface SanitizedWorkflow {
  name: string;
  nodes: SanitizedNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: Record<string, unknown>;
}

// Workflows directory relative to frontend
const WORKFLOWS_DIR = process.env.WORKFLOWS_DIR || path.join(process.cwd(), "..", "workflows");

/**
 * Sanitize workflow for export.
 */
function sanitizeForExport(workflow: N8nWorkflow): SanitizedWorkflow {
  const sanitizedNodes: SanitizedNode[] = (workflow.nodes || []).map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    typeVersion: node.typeVersion,
    position: node.position,
    parameters: node.parameters,
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
 * Generate safe filename from workflow name.
 */
function generateFilename(workflowName: string): string {
  const kebabName = workflowName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${kebabName}.json`;
}

/**
 * Check if the workflows directory is a git repository.
 */
async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await execAsync("git rev-parse --git-dir", { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/workflows/export/commit
 *
 * Export a workflow from n8n and save it to the workflows directory.
 * Optionally creates a git commit if the directory is a git repository.
 */
export const Route = createFileRoute("/api/workflows/export/commit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now();
        const ctx = createRequestContext(request);
        const log = ctx.logger.child({ operation: "export-workflow-commit" });

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
          const body = (await request.json()) as ExportCommitRequest;

          if (!body.workflowId) {
            const response = Response.json(
              { error: "workflowId is required" },
              { status: 400 }
            );
            logRequestComplete(ctx, 400, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          log.info("Exporting workflow to git", {
            workflowId: body.workflowId,
            workflowsDir: WORKFLOWS_DIR,
          });

          // Verify workflows directory exists
          try {
            await fs.access(WORKFLOWS_DIR);
          } catch {
            const response = Response.json(
              {
                error: "Workflows directory not accessible",
                path: WORKFLOWS_DIR,
              },
              { status: 500 }
            );
            logRequestComplete(ctx, 500, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          // Fetch workflow from n8n
          const workflow = await getWorkflow(body.workflowId, config);

          // Sanitize for export
          const sanitized = sanitizeForExport(workflow);

          // Generate or use provided filename
          const filename = body.filename || generateFilename(workflow.name);
          const filePath = path.join(WORKFLOWS_DIR, filename);

          // Format JSON with proper indentation
          const content = JSON.stringify(sanitized, null, 2);

          // Write file
          await fs.writeFile(filePath, content, "utf-8");
          log.info("Workflow file written", { filePath });

          // Check if git is available and this is a git repo
          const hasGit = await isGitRepo(WORKFLOWS_DIR);

          let committed = false;
          let commitHash: string | undefined;

          if (hasGit) {
            try {
              // Stage the file
              await execAsync(`git add "${filename}"`, { cwd: WORKFLOWS_DIR });

              // Generate commit message
              const commitMessage =
                body.commitMessage ||
                `Update workflow: ${workflow.name}\n\nExported from n8n instance.`;

              // Commit with proper escaping
              const { stdout } = await execAsync(
                `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
                { cwd: WORKFLOWS_DIR }
              );

              // Extract commit hash from output
              const hashMatch = stdout.match(/\[[\w-]+ ([a-f0-9]+)\]/);
              commitHash = hashMatch ? hashMatch[1] : undefined;

              committed = true;
              log.info("Git commit created", { commitHash, filename });
            } catch (gitError) {
              // Git might fail if there are no changes
              const errorMessage =
                gitError instanceof Error ? gitError.message : String(gitError);

              if (errorMessage.includes("nothing to commit")) {
                log.info("No changes to commit", { filename });
              } else {
                log.warn("Git commit failed", { error: errorMessage });
              }
            }
          }

          const response = Response.json({
            success: true,
            filename,
            filePath,
            workflowName: workflow.name,
            nodeCount: sanitized.nodes.length,
            committed,
            commitHash,
            message: committed
              ? `Workflow saved and committed to git`
              : hasGit
              ? "Workflow saved (no changes to commit)"
              : "Workflow saved (git not available)",
          });

          logRequestComplete(ctx, 200, Date.now() - startTime);
          return withCorrelationId(response, ctx.correlationId);
        } catch (error) {
          log.error("Failed to export workflow to git", { error });
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
