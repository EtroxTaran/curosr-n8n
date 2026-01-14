import { createAPIFileRoute } from "@tanstack/start/api";
import { GovernanceResponseSchema } from "@/lib/schemas";

export const APIRoute = createAPIFileRoute("/api/governance")({
  POST: async ({ request }) => {
    try {
      const body = await request.json();

      // Validate request body with Zod
      const parseResult = GovernanceResponseSchema.safeParse(body);
      if (!parseResult.success) {
        return Response.json(
          {
            error: "Invalid governance response",
            details: parseResult.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
      }

      const governanceResponse = parseResult.data;

      // Forward to n8n webhook for batch governance processing
      const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
      if (!n8nWebhookUrl) {
        throw new Error("N8N_WEBHOOK_URL is not configured");
      }

      const webhookEndpoint = `${n8nWebhookUrl}/governance-batch`;

      const n8nResponse = await fetch(webhookEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(governanceResponse),
      });

      if (!n8nResponse.ok) {
        const errorText = await n8nResponse.text();
        console.error("n8n governance webhook error:", errorText);
        return Response.json(
          {
            error: "Failed to process governance decisions",
            message: `n8n returned ${n8nResponse.status}`,
          },
          { status: 502 }
        );
      }

      // Parse n8n response if any
      let n8nResult = {};
      try {
        n8nResult = await n8nResponse.json();
      } catch {
        // n8n might not return JSON
      }

      return Response.json({
        success: true,
        message: "Governance decisions submitted successfully",
        scavenging_id: governanceResponse.scavenging_id,
        decisions_count: governanceResponse.decisions.length,
        approved_count: governanceResponse.decisions.filter(
          (d) => d.action === "approve"
        ).length,
        n8n_response: n8nResult,
      });
    } catch (error) {
      console.error("Error processing governance response:", error);
      return Response.json(
        {
          error: "Failed to process governance decisions",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  },
});
