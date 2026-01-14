import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Artifact } from "@/types/artifact";
import { getArtifactType } from "@/types/artifact";
import type { InputFile } from "@/lib/schemas";

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const endpoint = process.env.S3_ENDPOINT;
    const accessKey = process.env.S3_ACCESS_KEY;
    const secretKey = process.env.S3_SECRET_KEY;

    if (!endpoint || !accessKey || !secretKey) {
      throw new Error("S3 environment variables are not configured");
    }

    s3Client = new S3Client({
      endpoint,
      region: "us-east-1", // SeaweedFS doesn't care, but SDK requires it
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true, // Required for SeaweedFS
    });
  }
  return s3Client;
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET environment variable is not set");
  }
  return bucket;
}

export async function listProjectArtifacts(
  projectId: string
): Promise<Artifact[]> {
  const client = getS3Client();
  const bucket = getBucket();
  const prefix = `projects/${projectId}/`;

  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  });

  const response = await client.send(command);
  const contents = response.Contents || [];

  const artifacts: Artifact[] = await Promise.all(
    contents
      .filter((obj) => obj.Key && obj.Size && obj.Size > 0)
      .map(async (obj) => {
        const key = obj.Key!;
        const name = key.split("/").pop() || key;

        // Generate presigned URL for download
        const getCommand = new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        });
        const url = await getSignedUrl(client, getCommand, { expiresIn: 3600 });

        return {
          key,
          name,
          size: obj.Size || 0,
          lastModified: obj.LastModified?.toISOString() || "",
          url,
          type: getArtifactType(key),
        };
      })
  );

  return artifacts;
}

export async function getArtifactContent(key: string): Promise<string> {
  const client = getS3Client();
  const bucket = getBucket();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await client.send(command);
  const body = response.Body;

  if (!body) {
    throw new Error("Empty response body");
  }

  // Convert stream to string
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return buffer.toString("utf-8");
}

export async function uploadArtifact(
  projectId: string,
  filename: string,
  content: string,
  contentType: string = "text/markdown"
): Promise<string> {
  const client = getS3Client();
  const bucket = getBucket();
  const key = `projects/${projectId}/artifacts/${filename}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: content,
    ContentType: contentType,
  });

  await client.send(command);
  return key;
}

export async function getPresignedUrl(key: string): Promise<string> {
  const client = getS3Client();
  const bucket = getBucket();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: 3600 });
}

export function getPublicUrl(key: string): string {
  const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT;
  const bucket = getBucket();

  if (!publicEndpoint) {
    return "";
  }

  return `${publicEndpoint}/${bucket}/${key}`;
}

// ============================================
// Input File Operations (for file uploads)
// ============================================

/**
 * Content type mapping for common file extensions
 */
const CONTENT_TYPE_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".json": "application/json",
};

/**
 * Get content type from filename
 */
export function getContentType(filename: string): string {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
  return CONTENT_TYPE_MAP[ext] || "application/octet-stream";
}

/**
 * Generate a presigned PUT URL for direct browser uploads
 * Returns the upload URL and the S3 key where the file will be stored
 */
export async function generateUploadUrl(
  projectId: string,
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; key: string; expiresIn: number }> {
  const client = getS3Client();
  const bucket = getBucket();

  // Sanitize filename to prevent path traversal
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `projects/${projectId}/input/${sanitizedFilename}`;
  const expiresIn = 3600; // 1 hour

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });

  return { uploadUrl, key, expiresIn };
}

/**
 * List all input files for a project
 */
export async function listInputFiles(projectId: string): Promise<InputFile[]> {
  const client = getS3Client();
  const bucket = getBucket();
  const prefix = `projects/${projectId}/input/`;

  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  });

  const response = await client.send(command);
  const contents = response.Contents || [];

  const files: InputFile[] = contents
    .filter((obj) => obj.Key && obj.Size && obj.Size > 0)
    .map((obj) => {
      const key = obj.Key!;
      const name = key.split("/").pop() || key;

      return {
        key,
        name,
        size: obj.Size || 0,
        contentType: getContentType(name),
        uploadedAt: obj.LastModified?.toISOString() || new Date().toISOString(),
      };
    });

  return files;
}

/**
 * Delete an input file from S3
 */
export async function deleteInputFile(key: string): Promise<void> {
  const client = getS3Client();
  const bucket = getBucket();

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await client.send(command);
}

/**
 * Get presigned download URL for an input file
 */
export async function getInputFileUrl(key: string): Promise<string> {
  const client = getS3Client();
  const bucket = getBucket();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: 3600 });
}

/**
 * Download input file content as string (for text-based files)
 */
export async function getInputFileContent(key: string): Promise<string> {
  return getArtifactContent(key);
}
