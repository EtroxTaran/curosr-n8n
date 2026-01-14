import { createAPIFileRoute } from "@tanstack/start/api";
import { generateUploadUrl, getContentType } from "@/lib/s3";
import { PresignedUrlRequestSchema } from "@/lib/schemas";

export const APIRoute = createAPIFileRoute("/api/presigned-url")({
  POST: async ({ request }) => {
    try {
      const body = await request.json();

      // Validate request body with Zod
      const parseResult = PresignedUrlRequestSchema.safeParse(body);
      if (!parseResult.success) {
        return Response.json(
          {
            error: "Invalid request",
            details: parseResult.error.flatten().fieldErrors,
          },
          { status: 400 }
        );
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
        return Response.json(
          {
            error: "Invalid file type",
            message: `Allowed types: PDF, MD, TXT, DOCX. Got: ${finalContentType}`,
          },
          { status: 400 }
        );
      }

      // Generate presigned URL for upload
      const { uploadUrl, key, expiresIn } = await generateUploadUrl(
        projectId,
        filename,
        finalContentType
      );

      return Response.json({
        uploadUrl,
        key,
        expiresIn,
        contentType: finalContentType,
      });
    } catch (error) {
      console.error("Error generating presigned URL:", error);
      return Response.json(
        {
          error: "Failed to generate upload URL",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  },
});
