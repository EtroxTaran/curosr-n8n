import archiver from "archiver";
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type { Readable } from "stream";

// S3 client singleton
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
      region: "us-east-1",
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true,
      maxAttempts: 3, // Retry configuration for transient failures
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

export interface ExportResult {
  data: string; // Base64 encoded ZIP
  filename: string;
  fileCount: number;
  totalSize: number;
}

/**
 * Create a ZIP archive of all project artifacts
 */
export async function createProjectZip(
  projectId: string,
  projectName?: string
): Promise<ExportResult> {
  const client = getS3Client();
  const bucket = getBucket();
  const prefix = `projects/${projectId}/`;

  // List all objects for this project
  const listCommand = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  });

  const response = await client.send(listCommand);
  const objects = response.Contents || [];

  if (objects.length === 0) {
    throw new Error(`No artifacts found for project: ${projectId}`);
  }

  // Create ZIP archive in memory
  const archive = archiver("zip", {
    zlib: { level: 9 }, // Maximum compression
  });

  const chunks: Buffer[] = [];
  let totalSize = 0;
  let fileCount = 0;

  // Collect archive chunks
  archive.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  // Process each object
  for (const obj of objects) {
    if (!obj.Key || !obj.Size || obj.Size === 0) continue;

    try {
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: obj.Key,
      });

      const fileResponse = await client.send(getCommand);

      if (fileResponse.Body) {
        // Get the relative path within the project
        const relativePath = obj.Key.replace(prefix, "");

        // Convert stream to buffer and append to archive
        const bodyStream = fileResponse.Body as Readable;
        archive.append(bodyStream, { name: relativePath });

        totalSize += obj.Size;
        fileCount++;
      }
    } catch (error) {
      console.error(`Failed to fetch file: ${obj.Key}`, error);
      // Continue with other files
    }
  }

  // Finalize the archive
  await archive.finalize();

  // Combine all chunks into a single buffer
  const zipBuffer = Buffer.concat(chunks);

  // Generate filename
  const safeName = (projectName || projectId)
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .slice(0, 50);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${safeName}_${timestamp}.zip`;

  return {
    data: zipBuffer.toString("base64"),
    filename,
    fileCount,
    totalSize,
  };
}

/**
 * Helper to download base64 ZIP in browser
 */
export function downloadZip(base64Data: string, filename: string): void {
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
