import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileUpload } from "@/components/upload/FileUpload";
import { ArrowLeft, Loader2, Rocket } from "lucide-react";
import type { InputFile } from "@/lib/schemas";

export const Route = createFileRoute("/projects/new")({
  component: NewProjectPage,
});

function NewProjectPage() {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<InputFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate project ID from name
  const projectId = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .concat("-", Date.now().toString(36));

  const handleUploadComplete = (files: InputFile[]) => {
    setUploadedFiles(files);
    setError(null);
  };

  const handleUploadError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!projectName.trim()) {
      setError("Project name is required");
      return;
    }

    if (uploadedFiles.length === 0) {
      setError("Please upload at least one document");
      return;
    }

    setIsSubmitting(true);

    try {
      // Call the API to start the project
      const response = await fetch("/api/start-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: projectName.trim(),
          projectId,
          description: description.trim(),
          inputFiles: uploadedFiles,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create project");
      }

      const data = await response.json();

      // Navigate to the project page
      navigate({
        to: "/projects/$projectId",
        params: { projectId: data.project_id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container max-w-2xl py-6">
      <Button
        variant="ghost"
        className="mb-4"
        onClick={() => navigate({ to: "/projects" })}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Projects
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Create New Project
          </CardTitle>
          <CardDescription>
            Upload your source documents and start the AI Product Factory workflow
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {/* Project Name */}
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name *</Label>
              <Input
                id="projectName"
                placeholder="e.g., ShopFast E-commerce Platform"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                disabled={isSubmitting}
              />
              {projectName && (
                <p className="text-xs text-muted-foreground">
                  Project ID: {projectId}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Briefly describe your project goals and context..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={isSubmitting}
              />
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>Source Documents *</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Upload architecture docs, requirements, technical standards, or any
                documents that should inform the vision and architecture.
              </p>
              <FileUpload
                projectId={projectId || "temp"}
                onUploadComplete={handleUploadComplete}
                onUploadError={handleUploadError}
                disabled={isSubmitting || !projectName.trim()}
                maxFiles={10}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-between border-t pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: "/projects" })}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting || !projectName.trim() || uploadedFiles.length === 0
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Project...
                </>
              ) : (
                <>
                  <Rocket className="mr-2 h-4 w-4" />
                  Start Project
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
