import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle,
  XCircle,
  Loader2,
  FileCode,
  RefreshCw,
  AlertTriangle,
  Clock,
} from "lucide-react";

export interface WorkflowStatus {
  filename: string;
  name: string;
  localVersion: string;
  n8nWorkflowId: string | null;
  isActive: boolean;
  importStatus:
    | "pending"
    | "importing"
    | "imported"
    | "failed"
    | "update_available"
    | "updating"
    | "created"
    | "activation_failed";
  webhookPaths: string[];
  hasCredentials: boolean;
  lastImportAt: string | null;
  lastError: string | null;
}

interface SetupStepImportProps {
  workflows: WorkflowStatus[];
  isLoading: boolean;
  isImporting: boolean;
  importProgress: {
    current: string;
    completed: number;
    total: number;
    phase?: "creating" | "activating";
  } | null;
  onStartImport: () => void;
  onRetryFailed: () => void;
}

function getStatusIcon(status: WorkflowStatus["importStatus"]) {
  switch (status) {
    case "imported":
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    case "importing":
    case "updating":
      return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
    case "created":
      return <Clock className="w-4 h-4 text-blue-600" />;
    case "failed":
    case "activation_failed":
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
      return <Badge variant="default" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Creating...</Badge>;
    case "updating":
      return <Badge variant="default" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Updating...</Badge>;
    case "created":
      return <Badge variant="default" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Created</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "activation_failed":
      return <Badge variant="destructive">Activation Failed</Badge>;
    case "update_available":
      return <Badge variant="default" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Update Available</Badge>;
    default:
      return <Badge variant="secondary">Pending</Badge>;
  }
}

export function SetupStepImport({
  workflows,
  isLoading,
  isImporting,
  importProgress,
  onStartImport,
  onRetryFailed,
}: SetupStepImportProps) {
  const importedCount = workflows.filter((w) => w.importStatus === "imported").length;
  const failedCount = workflows.filter(
    (w) => w.importStatus === "failed" || w.importStatus === "activation_failed"
  ).length;
  const pendingCount = workflows.filter((w) => w.importStatus === "pending").length;

  const allImported = importedCount === workflows.length;
  const hasFailures = failedCount > 0;

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Bundled Workflows</h3>
          <p className="text-sm text-muted-foreground">
            {workflows.length} workflows will be imported to your n8n instance
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">
            {importedCount}/{workflows.length}
          </div>
          <p className="text-xs text-muted-foreground">Imported</p>
        </div>
      </div>

      {/* Import progress */}
      {isImporting && importProgress && (
        <div className="space-y-3">
          {/* Phase indicator */}
          <div className="flex items-center justify-center gap-4">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                importProgress.phase === "creating"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span className="font-medium">1.</span>
              <span>Creating Workflows</span>
              {importProgress.phase === "creating" && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              {importProgress.phase === "activating" && (
                <CheckCircle className="w-3.5 h-3.5 text-green-600" />
              )}
            </div>
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                importProgress.phase === "activating"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span className="font-medium">2.</span>
              <span>Activating Workflows</span>
              {importProgress.phase === "activating" && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
            </div>
          </div>

          {/* Current workflow */}
          <div className="flex justify-between text-sm">
            <span>
              {importProgress.phase === "creating" ? "Creating" : "Activating"}:{" "}
              <span className="font-medium">{importProgress.current}</span>
            </span>
            <span>
              {importProgress.completed}/{importProgress.total}
            </span>
          </div>
          <Progress
            value={(importProgress.completed / importProgress.total) * 100}
            className="h-2"
          />
        </div>
      )}

      {/* Workflow list */}
      <ScrollArea className="h-64 rounded-lg border">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {workflows.map((workflow) => (
              <div
                key={workflow.filename}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
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
                  <p className="font-medium truncate">{workflow.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {workflow.filename}
                  </p>
                  {workflow.lastError && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      Error: {workflow.lastError}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {workflow.hasCredentials && (
                    <Badge variant="outline" className="text-xs">
                      Credentials
                    </Badge>
                  )}
                  {getStatusBadge(workflow.importStatus)}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Action buttons */}
      <div className="flex justify-center gap-4">
        {!allImported && pendingCount > 0 && (
          <Button
            onClick={onStartImport}
            disabled={isImporting || isLoading}
            size="lg"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <FileCode className="w-4 h-4 mr-2" />
                Import All Workflows
              </>
            )}
          </Button>
        )}

        {hasFailures && !isImporting && (
          <Button
            onClick={onRetryFailed}
            variant="outline"
            size="lg"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry Failed ({failedCount})
          </Button>
        )}
      </div>

      {/* Status message */}
      {allImported && (
        <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900">
          <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="font-medium text-green-900 dark:text-green-100">
            All workflows imported successfully!
          </p>
          <p className="text-sm text-green-800 dark:text-green-200">
            Click Continue to configure webhook endpoints.
          </p>
        </div>
      )}

      {hasFailures && !isImporting && (
        <div className="text-center text-sm text-muted-foreground space-y-2">
          <p>
            Some workflows failed to{" "}
            {workflows.some((w) => w.importStatus === "activation_failed")
              ? "activate"
              : "import"}
            . You can retry them or continue and fix them later in Settings.
          </p>
          {workflows.some((w) => w.importStatus === "activation_failed") && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Tip: Activation failures often occur when dependent workflows aren&apos;t
              ready. Retry usually fixes this.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default SetupStepImport;
