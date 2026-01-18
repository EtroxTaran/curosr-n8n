import { createFileRoute } from "@tanstack/react-router";
import { generateUploadUrl, getContentType } from "@/lib/s3";
import { getServerSession } from "@/lib/auth";
import { PresignedUrlRequestSchema } from "@/lib/schemas";
import {
  createRequestContext,
  logRequestStart,
  logRequestComplete,
  logRequestError,
  withCorrelationId,
} from "@/lib/request-context";

export const Route = createFileRoute("/api/presigned-url")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now();
        const ctx = createRequestContext(request);
        const log = ctx.logger.child({ operation: "presigned-url" });

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
          const parseResult = PresignedUrlRequestSchema.safeParse(body);
          if (!parseResult.success) {
            log.warn("Invalid presigned URL request", {
              errors: parseResult.error.flatten().fieldErrors,
            });
            const response = Response.json(
              {
                error: "Invalid request",
                details: parseResult.error.flatten().fieldErrors,
              },
              { status: 400 }
            );
            logRequestComplete(ctx, 400, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          const { projectId, filename, contentType } = parseResult.data;

          // Validate file type
          const allowedTypes = [
            "application/pdf",
            "text/markdown",
            "text/plain",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
          ];

          // If contentType not provided, infer from filename
          const finalContentType = contentType || getContentType(filename);

          if (!allowedTypes.includes(finalContentType)) {
            log.warn("Invalid file type rejected", {
              projectId,
              filename,
              contentType: finalContentType,
            });
            const response = Response.json(
              {
                error: "Invalid file type",
                message: `Allowed types: PDF, MD, TXT, DOCX. Got: ${finalContentType}`,
              },
              { status: 400 }
            );
            logRequestComplete(ctx, 400, Date.now() - startTime);
            return withCorrelationId(response, ctx.correlationId);
          }

          // Generate presigned URL for upload
          const { uploadUrl, key, expiresIn } = await generateUploadUrl(
            projectId,
            filename,
            finalContentType
          );

          log.info("Presigned URL generated successfully", {
            projectId,
            filename,
            key,
            expiresIn,
          });

          const response = Response.json({
            uploadUrl,
            key,
            expiresIn,
            contentType: finalContentType,
          });

          logRequestComplete(ctx, 200, Date.now() - startTime);
          return withCorrelationId(response, ctx.correlationId);
        } catch (error) {
          logRequestError(ctx, error, 500);
          const response = Response.json(
            {
              error: "Failed to generate upload URL",
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
