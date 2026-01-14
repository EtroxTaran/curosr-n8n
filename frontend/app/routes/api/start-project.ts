import { json } from "@tanstack/react-router";
import { createAPIFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db";
import type { InputFile } from "@/lib/schemas";

interface StartProjectRequest {
  projectName: string;
  projectId: string;
  description?: string;
  inputFiles: InputFile[];
}

export const APIRoute = createAPIFileRoute("/api/start-project")({
  POST: async ({ request }) => {
    try {
      const body = (await request.json()) as StartProjectRequest;

      // Validate required fields
      if (!body.projectName || !body.projectName.trim()) {
        return json({ error: "Project name is required" }, { status: 400 });
      }

      if (!body.inputFiles || body.inputFiles.length === 0) {
        return json(
          { error: "At least one input file is required" },
          { status: 400 }
        );
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
      const result = await db`
        INSERT INTO project_state (
          project_id,
          project_name,
          session_id,
          current_phase,
          phase_status,
          input_files,
          config
        ) VALUES (
          ${projectId},
          ${body.projectName.trim()},
          ${sessionId},
          0,
          'pending',
          ${JSON.stringify(body.inputFiles)},
          ${JSON.stringify({
            max_iterations: 5,
            score_threshold: 90,
          })}
        )
        RETURNING project_id, project_name, session_id, created_at
      `;

      if (result.length === 0) {
        return json({ error: "Failed to create project" }, { status: 500 });
      }

      const project = result[0];

      // Trigger n8n workflow asynchronously
      const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
      if (n8nWebhookUrl) {
        // Fire and forget - don't wait for response
        fetch(`${n8nWebhookUrl}/webhook/start-project`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.project_id,
            projectName: project.project_name,
            sessionId: project.session_id,
            description: body.description || "",
            inputFiles: body.inputFiles,
          }),
        }).catch((err) => {
          console.error("Failed to trigger n8n workflow:", err);
        });
      }

      return json({
        status: "created",
        project_id: project.project_id,
        project_name: project.project_name,
        session_id: project.session_id,
        created_at: project.created_at,
        message: `Project '${project.project_name}' has been created and workflow started.`,
      });
    } catch (error) {
      console.error("Error creating project:", error);

      // Check for duplicate project
      if (
        error instanceof Error &&
        error.message.includes("duplicate key")
      ) {
        return json(
          { error: "A project with this name already exists" },
          { status: 409 }
        );
      }

      return json({ error: "Internal server error" }, { status: 500 });
    }
  },
});
