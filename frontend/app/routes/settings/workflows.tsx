import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Workflow,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Clock,
  FileCode,
  ExternalLink,
} from "lucide-react";
import { RouteErrorBoundary } from "@/components/error/RouteErrorBoundary";
import { RouteLoadingSpinner } from "@/components/loading/RouteLoadingSpinner";
import { requireAuth } from "@/lib/auth-guard";

export const Route = createFileRoute("/settings/workflows")({
  beforeLoad: async ({ location }) => {
    return requireAuth(location);
  },
  component: WorkflowsSettingsPage,
  errorComponent: RouteErrorBoundary,
  pendingComponent: RouteLoadingSpinner,
});

interface WorkflowStatus {
  filename: string;
  name: string;
  localVersion: string;
  n8nWorkflowId: string | null;
  isActive: boolean;
  importStatus: "pending" | "importing" | "imported" | "failed" | "update_available" | "updating";
  webhookPaths: string[];
  hasCredentials: boolean;
  lastImportAt: string | null;
  lastError: string | null;
}

function getStatusIcon(status: WorkflowStatus["importStatus"]) {
  switch (status) {
    case "imported":
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    case "importing":
    case "updating":
      return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-600" />;
    case "update_available":
      return <AlertTriangle className="w-4 h-4 text-amber-600" />;
    default:
      return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

function getStatusBadge(status: WorkflowStatus["importStatus"]) {
  switch (status) {
    case "imported":
      return <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Imported</Badge>;
    case "importing":
      return <Badge variant="default" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Importing...</Badge>;
    case "updating":
      return <Badge variant="default" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Updating...</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "update_available":
      return <Badge variant="default" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Update Available</Badge>;
    default:
      return <Badge variant="secondary">Pending</Badge>;
  }
}

function WorkflowsSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowStatus[]>([]);
  const [n8nBaseUrl, setN8nBaseUrl] = useState("");

  // Load workflows
  const loadWorkflows = async () => {
    try {
      const response = await fetch("/api/setup/workflows/list");
      if (!response.ok) throw new Error("Failed to load workflows");
      const data = await response.json();
      setWorkflows(data.workflows);

      // Get n8n URL from status
      const statusResponse = await fetch("/api/setup/status");
      const statusData = await statusResponse.json();
      setN8nBaseUrl(statusData.apiUrl || "");
    } catch {
      toast.error("Failed to load workflows");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, []);

  // Import single workflow
  const importWorkflow = async (filename: string) => {
    setIsImporting(true);
    try {
      const response = await fetch("/api/setup/workflows/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await response.json();

      if (data.success) {
        toast.success("Workflow imported");
        await loadWorkflows();
      } else {
        toast.error(data.error || "Import failed");
      }
    } catch {
      toast.error("Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  // Update all workflows
  const updateAll = async () => {
    setIsImporting(true);
    try {
      const response = await fetch("/api/setup/workflows/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importAll: true, forceUpdate: true }),
      });
      const data = await response.json();

      if (data.success) {
        toast.success("All workflows updated");
        await loadWorkflows();
      } else {
        toast.error(data.error || "Update failed");
      }
    } catch {
      toast.error("Update failed");
    } finally {
      setIsImporting(false);
    }
  };

  // Check for updates
  const checkForUpdates = async () => {
    setIsLoading(true);
    await loadWorkflows();
    toast.success("Update check complete");
  };

  const importedCount = workflows.filter((w) => w.importStatus === "imported").length;
  const pendingCount = workflows.filter((w) => w.importStatus === "pending").length;
  const failedCount = workflows.filter((w) => w.importStatus === "failed").length;
  const updateAvailableCount = workflows.filter((w) => w.importStatus === "update_available").length;

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      {/* Header */}
      <div className="mb-8">
        <Link to="/settings">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Settings
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
            <Workflow className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Workflow Management</h1>
            <p className="text-muted-foreground">
              View and manage imported n8n workflows
            </p>
          </div>
        </div>
      </div>

      {/* Summary card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Workflow Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/50">
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                {importedCount}
              </div>
              <p className="text-sm text-green-600 dark:text-green-400">Imported</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold">{pendingCount}</div>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50">
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                {updateAvailableCount}
              </div>
              <p className="text-sm text-amber-600 dark:text-amber-400">Updates Available</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950/50">
              <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                {failedCount}
              </div>
              <p className="text-sm text-red-600 dark:text-red-400">Failed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Button
          variant="outline"
          onClick={checkForUpdates}
          disabled={isLoading}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Check for Updates
        </Button>
        {(updateAvailableCount > 0 || pendingCount > 0) && (
          <Button
            onClick={updateAll}
            disabled={isImporting}
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Update All
              </>
            )}
          </Button>
        )}
      </div>

      {/* Workflow list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Workflows</CardTitle>
          <CardDescription>
            {workflows.length} bundled workflows
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {workflows.map((workflow) => (
                <div
                  key={workflow.filename}
                  className={`flex items-center gap-3 p-4 rounded-lg border transition-colors ${
                    workflow.importStatus === "importing" || workflow.importStatus === "updating"
                      ? "bg-blue-50 border-blue-200 dark:bg-blue-950/50 dark:border-blue-900"
                      : workflow.importStatus === "imported"
                      ? "bg-green-50/50 border-green-200/50 dark:bg-green-950/30 dark:border-green-900/50"
                      : workflow.importStatus === "failed"
                      ? "bg-red-50/50 border-red-200/50 dark:bg-red-950/30 dark:border-red-900/50"
                      : "bg-muted/30"
                  }`}
                >
                  {getStatusIcon(workflow.importStatus)}
                  <FileCode className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{workflow.name}</p>
                      {workflow.isActive && (
                        <Badge variant="outline" className="text-xs text-green-600">
                          Active
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {workflow.filename} • v{workflow.localVersion}
                    </p>
                    {workflow.lastError && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1 truncate">
                        Error: {workflow.lastError}
                      </p>
                    )}
                    {workflow.lastImportAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last imported: {new Date(workflow.lastImportAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {getStatusBadge(workflow.importStatus)}
                    {workflow.n8nWorkflowId && n8nBaseUrl && (
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={`${n8nBaseUrl}/workflow/${workflow.n8nWorkflowId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    )}
                    {(workflow.importStatus === "pending" ||
                      workflow.importStatus === "failed" ||
                      workflow.importStatus === "update_available") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => importWorkflow(workflow.filename)}
                        disabled={isImporting}
                      >
                        {workflow.importStatus === "update_available" ? "Update" : "Import"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
