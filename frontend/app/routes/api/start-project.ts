import { createFileRoute } from "@tanstack/react-router";
import { query } from "@/lib/db";
import { triggerStartProject } from "@/lib/n8n";
import { getServerSession } from "@/lib/auth";
import type { InputFile } from "@/lib/schemas";
import {
  createRequestContext,
  logRequestStart,
  logRequestComplete,
  logRequestError,
  withCorrelationId,
} from "@/lib/request-context";

interface StartProjectRequest {
  projectName: string;
  projectId: string;
  description?: string;
  inputFiles: InputFile[];
}

interface ProjectRecord {
  project_id: string;
  project_name: string;
  session_id: string;
  created_at: string;
}

/**
 * Workflow trigger status
 */
type WorkflowStatus = "started" | "failed" | "skipped";

export const Route = createFileRoute("/api/start-project")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now();
        const ctx = createRequestContext(request);
        const log = ctx.logger.child({ operation: "start-project" });

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
          const body = (await request.json()) as StartProjectRequest;

          // Validate required fields
          if (!body.projectName || !body.projectName.trim()) {
            log.warn("Project name missing in request");
            const response = Response.json(
              { error: "Project name is required" },
              { status: 400 }
            );
            logRequestComplete(ctx, 400, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          if (!body.inputFiles || body.inputFiles.length === 0) {
            log.warn("No input files in request", {
              projectName: body.projectName,
            });
            const response = Response.json(
              { error: "At least one input file is required" },
              { status: 400 }
            );
            logRequestComplete(ctx, 400, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          // Generate project ID if not provided
          const projectId =
            body.projectId ||
            body.projectName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .concat("-", Date.now().toString(36));

          // Generate session ID
          const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

          // Create project record in database
          const result = await query<ProjectRecord>(
            `INSERT INTO project_state (
              project_id,
              project_name,
              session_id,
              current_phase,
              phase_status,
              input_files,
              config
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING project_id, project_name, session_id, created_at`,
            [
              projectId,
              body.projectName.trim(),
              sessionId,
              0,
              "pending",
              JSON.stringify(body.inputFiles),
              JSON.stringify({
                max_iterations: 5,
                score_threshold: 90,
              }),
            ]
          );

          if (result.length === 0) {
            log.error("Failed to create project in database", undefined, {
              projectName: body.projectName,
            });
            const response = Response.json(
              { error: "Failed to create project" },
              { status: 500 }
            );
            logRequestComplete(ctx, 500, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          const project = result[0];

          // Update logger with project context
          const projectLog = log.child({ projectId: project.project_id });

          // Trigger n8n workflow with retry logic
          let workflowStatus: WorkflowStatus = "skipped";
          let workflowError: string | undefined;
          let executionId: string | undefined;

          const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
          if (n8nWebhookUrl) {
            // Use the retry-enabled trigger function
            const workflowResult = await triggerStartProject({
              projectId: project.project_id,
              projectName: project.project_name,
              sessionId: project.session_id,
              description: body.description || "",
              inputFiles: body.inputFiles.map((f) => ({
                key: f.key,
                name: f.name,
                size: f.size,
                contentType: f.contentType,
              })),
            });

            if (workflowResult.success) {
              workflowStatus = "started";
              executionId = workflowResult.executionId;
              projectLog.info("Workflow triggered successfully", { executionId });
            } else {
              workflowStatus = "failed";
              workflowError = workflowResult.error;
              projectLog.error("Failed to trigger workflow", new Error(workflowError || "Unknown error"));

              // Update project status to indicate workflow failure
              await query(
                `UPDATE project_state
                 SET phase_status = $1, error_message = $2
                 WHERE project_id = $3`,
                ["workflow_failed", workflowError, project.project_id]
              ).catch((err) => {
                projectLog.error("Failed to update project status", err);
              });
            }
          } else {
            projectLog.warn("N8N_WEBHOOK_URL not configured, skipping workflow trigger");
          }

          projectLog.info("Project created successfully", {
            workflowStatus,
            executionId,
          });

          const response = Response.json({
            status: "created",
            project_id: project.project_id,
            project_name: project.project_name,
            session_id: project.session_id,
            created_at: project.created_at,
            workflow_status: workflowStatus,
            execution_id: executionId,
            workflow_error: workflowError,
            message:
              workflowStatus === "started"
                ? `Project '${project.project_name}' has been created and workflow started.`
                : workflowStatus === "failed"
                  ? `Project '${project.project_name}' was created but workflow failed to start: ${workflowError}`
                  : `Project '${project.project_name}' has been created (workflow not configured).`,
          });

          logRequestComplete(ctx, 200, Date.now() - startTime);
          return withCorrelationId(response, ctx.correlationId);
        } catch (error) {
          logRequestError(ctx, error, 500);

          // Check for duplicate project
          if (
            error instanceof Error &&
            error.message.includes("duplicate key")
          ) {
            const response = Response.json(
              { error: "A project with this name already exists" },
              { status: 409 }
            );
            logRequestComplete(ctx, 409, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          const response = Response.json(
            { error: "Internal server error" },
            { status: 500 }
          );
          logRequestComplete(ctx, 500, Date.now() - startTime);
          return withCorrelationId(response, ctx.correlationId);
        }
      },
    },
  },
});
