import { createFileRoute } from "@tanstack/react-router";
import { healthCheck } from "@/lib/db";
import {
  createRequestContext,
  logRequestComplete,
  withCorrelationId,
} from "@/lib/request-context";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const startTime = Date.now();
        const ctx = createRequestContext(request);
        const log = ctx.logger.child({ operation: "health-check" });

        // Check database connectivity
        let dbHealthy = false;
        try {
          dbHealthy = await healthCheck();
        } catch (error) {
          log.warn("Database health check failed", {
            error: error instanceof Error ? error.message : "Unknown error",
          });
          dbHealthy = false;
        }

        const responseTime = Date.now() - startTime;

        const status = dbHealthy ? "healthy" : "unhealthy";
        const statusCode = dbHealthy ? 200 : 503;

        if (!dbHealthy) {
          log.warn("Health check returned unhealthy status", {
            database: "down",
            responseTimeMs: responseTime,
          });
        } else {
          log.debug("Health check passed", {
            database: "up",
            responseTimeMs: responseTime,
          });
        }

        const response = Response.json(
          {
            status,
            timestamp: new Date().toISOString(),
            responseTime: `${responseTime}ms`,
            checks: {
              database: {
                status: dbHealthy ? "up" : "down",
              },
            },
            version: process.env.npm_package_version || "1.0.0",
          },
          {
            status: statusCode,
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          }
        );

        logRequestComplete(ctx, statusCode, responseTime);
        return withCorrelationId(response, ctx.correlationId);
      },
    },
  },
});
