import * as React from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, File, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import type { InputFile } from "@/lib/schemas";
import { getContentType } from "@/lib/s3";

// ============================================
// Types
// ============================================

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "complete" | "error";
  error?: string;
  key?: string;
}

interface FileUploadProps {
  projectId: string;
  onUploadComplete: (files: InputFile[]) => void;
  onUploadError?: (error: string) => void;
  maxFiles?: number;
  maxSizeBytes?: number;
  acceptedTypes?: string[];
  existingFiles?: InputFile[];
  disabled?: boolean;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MAX_FILES = 10;
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_ACCEPTED_TYPES = [
  "application/pdf",
  "text/markdown",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

const ACCEPTED_EXTENSIONS = {
  "application/pdf": [".pdf"],
  "text/markdown": [".md"],
  "text/plain": [".txt"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
};

// ============================================
// Helper Functions
// ============================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ============================================
// FileUpload Component
// ============================================

export function FileUpload({
  projectId,
  onUploadComplete,
  onUploadError,
  maxFiles = DEFAULT_MAX_FILES,
  maxSizeBytes = DEFAULT_MAX_SIZE,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  existingFiles = [],
  disabled = false,
}: FileUploadProps) {
  const [uploadingFiles, setUploadingFiles] = React.useState<UploadingFile[]>([]);
  const [completedFiles, setCompletedFiles] = React.useState<InputFile[]>(existingFiles);

  // Build accept object for dropzone
  const accept = React.useMemo(() => {
    const acceptObj: Record<string, string[]> = {};
    for (const type of acceptedTypes) {
      if (type in ACCEPTED_EXTENSIONS) {
        acceptObj[type] = ACCEPTED_EXTENSIONS[type as keyof typeof ACCEPTED_EXTENSIONS];
      }
    }
    return acceptObj;
  }, [acceptedTypes]);

  // Upload a single file using presigned URL
  const uploadFile = React.useCallback(
    async (uploadingFile: UploadingFile) => {
      const { file, id } = uploadingFile;

      try {
        // Update status to uploading
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, status: "uploading" as const, progress: 0 } : f
          )
        );

        // Get presigned URL from API
        const contentType = getContentType(file.name);
        const presignedResponse = await fetch("/api/presigned-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            filename: file.name,
            contentType,
          }),
        });

        if (!presignedResponse.ok) {
          const error = await presignedResponse.json();
          throw new Error(error.message || "Failed to get upload URL");
        }

        const { uploadUrl, key } = await presignedResponse.json();

        // Upload file directly to S3 using presigned URL
        const xhr = new XMLHttpRequest();

        await new Promise<void>((resolve, reject) => {
          xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100);
              setUploadingFiles((prev) =>
                prev.map((f) => (f.id === id ? { ...f, progress } : f))
              );
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          });

          xhr.addEventListener("error", () => reject(new Error("Upload failed")));
          xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", contentType);
          xhr.send(file);
        });

        // Mark as complete
        const completedFile: InputFile = {
          key,
          name: file.name,
          size: file.size,
          contentType,
          uploadedAt: new Date().toISOString(),
        };

        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, status: "complete" as const, progress: 100, key }
              : f
          )
        );

        setCompletedFiles((prev) => {
          const updated = [...prev, completedFile];
          // Notify parent of all completed files
          onUploadComplete(updated);
          return updated;
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Upload failed";

        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, status: "error" as const, error: errorMessage } : f
          )
        );

        onUploadError?.(errorMessage);
      }
    },
    [projectId, onUploadComplete, onUploadError]
  );

  // Handle dropped files
  const onDrop = React.useCallback(
    (acceptedFiles: File[]) => {
      const totalFiles = completedFiles.length + uploadingFiles.length + acceptedFiles.length;

      if (totalFiles > maxFiles) {
        onUploadError?.(`Maximum ${maxFiles} files allowed`);
        return;
      }

      // Create uploading file entries and start uploads immediately
      const newUploadingFiles: UploadingFile[] = acceptedFiles.map((file) => ({
        id: generateId(),
        file,
        progress: 0,
        status: "pending" as const,
      }));

      setUploadingFiles((prev) => [...prev, ...newUploadingFiles]);

      // Start uploads immediately (auto-upload on drop)
      for (const uploadingFile of newUploadingFiles) {
        uploadFile(uploadingFile);
      }
    },
    [completedFiles.length, uploadingFiles.length, maxFiles, onUploadError, uploadFile]
  );

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize: maxSizeBytes,
    maxFiles: maxFiles - completedFiles.length,
    disabled: disabled || completedFiles.length >= maxFiles,
    onDropRejected: (rejections) => {
      const errors = rejections.map((r) => {
        if (r.errors[0]?.code === "file-too-large") {
          return `${r.file.name} is too large (max ${formatFileSize(maxSizeBytes)})`;
        }
        if (r.errors[0]?.code === "file-invalid-type") {
          return `${r.file.name} has invalid type`;
        }
        return r.errors[0]?.message || "Invalid file";
      });
      onUploadError?.(errors.join(", "));
    },
  });

  // Remove a completed file
  const removeFile = React.useCallback(
    async (key: string) => {
      try {
        // Remove from local state immediately
        setCompletedFiles((prev) => {
          const updated = prev.filter((f) => f.key !== key);
          onUploadComplete(updated);
          return updated;
        });

        // Note: We don't delete from S3 here - that would be done on project cancel
      } catch (error) {
        onUploadError?.(error instanceof Error ? error.message : "Failed to remove file");
      }
    },
    [onUploadComplete, onUploadError]
  );

  // Cancel an uploading file
  const cancelUpload = React.useCallback((id: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
        {isDragActive ? (
          <p className="text-primary font-medium">Drop files here...</p>
        ) : (
          <>
            <p className="text-muted-foreground">
              Drag & drop files here, or click to select
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              PDF, Markdown, TXT, DOCX (max {formatFileSize(maxSizeBytes)} per file)
            </p>
          </>
        )}
      </div>

      {/* Uploading Files */}
      {uploadingFiles.length > 0 && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            {uploadingFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-2 rounded-md bg-muted/50"
              >
                <File className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.file.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {file.status === "uploading" && (
                      <>
                        <Progress value={file.progress} className="flex-1 h-1" />
                        <span className="text-xs text-muted-foreground w-10">
                          {file.progress}%
                        </span>
                      </>
                    )}
                    {file.status === "pending" && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Waiting...
                      </span>
                    )}
                    {file.status === "error" && (
                      <span className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {file.error}
                      </span>
                    )}
                    {file.status === "complete" && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Uploaded
                      </span>
                    )}
                  </div>
                </div>
                {(file.status === "pending" || file.status === "error") && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => cancelUpload(file.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Completed Files */}
      {completedFiles.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-medium mb-3">
              Uploaded Files ({completedFiles.length})
            </p>
            <div className="space-y-2">
              {completedFiles.map((file) => (
                <div
                  key={file.key}
                  className="flex items-center gap-3 p-2 rounded-md bg-green-50 dark:bg-green-950/20"
                >
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => removeFile(file.key)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* File count indicator */}
      <p className="text-xs text-muted-foreground text-center">
        {completedFiles.length} of {maxFiles} files uploaded
      </p>
    </div>
  );
}

export default FileUpload;
