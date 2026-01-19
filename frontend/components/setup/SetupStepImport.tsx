import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle,
  XCircle,
  Loader2,
  FileCode,
  RefreshCw,
  AlertTriangle,
  Clock,
  RefreshCcw,
  Eye,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Play,
  AlertCircle,
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

export interface SyncResult {
  total: number;
  synced: number;
  deleted: number;
  stateChanged: number;
  errors: number;
}

// Phase B: Dry-run preview types
export interface DryRunWorkflow {
  filename: string;
  name: string;
  action: "create" | "update" | "skip";
  reason: string;
  currentVersion?: string;
  newVersion?: string;
}

export interface DryRunResult {
  workflows: DryRunWorkflow[];
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    nodeValidation: {
      missingNodes: Array<{ nodeType: string; workflows: string[] }>;
    };
    dependencyValidation: {
      hasCycle: boolean;
      cycles: string[][];
      dependencyOrder: string[];
    };
  };
}

// Phase B: SSE streaming types
export interface SSEImportEvent {
  type: "start" | "validation" | "workflow_start" | "workflow_complete" | "phase_change" | "complete" | "error";
  timestamp: string;
  data: Record<string, unknown>;
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
  // Sync functionality
  isSyncing?: boolean;
  lastSyncResult?: SyncResult | null;
  onSync?: () => void;
  // Phase B: Enhanced import features
  onDryRun?: () => Promise<DryRunResult>;
  onStartStreamingImport?: () => void;
  useStreamingImport?: boolean;
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
  isSyncing,
  lastSyncResult,
  onSync,
  onDryRun,
  onStartStreamingImport,
  useStreamingImport,
}: SetupStepImportProps) {
  // Phase B: Local state for dry-run preview
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [showDependencyGraph, setShowDependencyGraph] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const importedCount = workflows.filter((w) => w.importStatus === "imported").length;
  const failedCount = workflows.filter(
    (w) => w.importStatus === "failed" || w.importStatus === "activation_failed"
  ).length;
  const pendingCount = workflows.filter((w) => w.importStatus === "pending").length;

  const allImported = importedCount === workflows.length;
  const hasFailures = failedCount > 0;

  // Phase B: Run dry-run preview
  const handleDryRun = useCallback(async () => {
    if (!onDryRun) return;
    setIsDryRunning(true);
    try {
      const result = await onDryRun();
      setDryRunResult(result);
      setShowValidation(true);
    } catch (error) {
      console.error("Dry-run failed:", error);
    } finally {
      setIsDryRunning(false);
    }
  }, [onDryRun]);

  // Phase B: Handle import (with streaming if available)
  const handleStartImport = useCallback(() => {
    if (useStreamingImport && onStartStreamingImport) {
      onStartStreamingImport();
    } else {
      onStartImport();
    }
  }, [useStreamingImport, onStartStreamingImport, onStartImport]);

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

      {/* Phase B: Dry-run validation results */}
      {dryRunResult && (
        <div className="space-y-3">
          {/* Validation status banner */}
          <div
            className={`p-3 rounded-lg border ${
              dryRunResult.validation.valid
                ? "bg-green-50 border-green-200 dark:bg-green-950/50 dark:border-green-900"
                : "bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:border-amber-900"
            }`}
          >
            <div className="flex items-center gap-2">
              {dryRunResult.validation.valid ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              )}
              <span className="font-medium">
                {dryRunResult.validation.valid
                  ? "Pre-import validation passed"
                  : "Validation warnings detected"}
              </span>
            </div>
          </div>

          {/* Validation details collapsible */}
          <Collapsible open={showValidation} onOpenChange={setShowValidation}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Validation Details
                </span>
                {showValidation ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {/* Errors */}
              {dryRunResult.validation.errors.length > 0 && (
                <div className="p-2 rounded bg-red-50 dark:bg-red-950/50 text-sm">
                  <p className="font-medium text-red-800 dark:text-red-200 mb-1">
                    Errors ({dryRunResult.validation.errors.length})
                  </p>
                  <ul className="list-disc list-inside text-red-700 dark:text-red-300 space-y-1">
                    {dryRunResult.validation.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Warnings */}
              {dryRunResult.validation.warnings.length > 0 && (
                <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/50 text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                    Warnings ({dryRunResult.validation.warnings.length})
                  </p>
                  <ul className="list-disc list-inside text-amber-700 dark:text-amber-300 space-y-1">
                    {dryRunResult.validation.warnings.map((warn, i) => (
                      <li key={i}>{warn}</li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Missing nodes */}
              {dryRunResult.validation.nodeValidation.missingNodes.length > 0 && (
                <div className="p-2 rounded bg-red-50 dark:bg-red-950/50 text-sm">
                  <p className="font-medium text-red-800 dark:text-red-200 mb-1">
                    Missing Node Types
                  </p>
                  <ul className="list-disc list-inside text-red-700 dark:text-red-300 space-y-1">
                    {dryRunResult.validation.nodeValidation.missingNodes.map((node, i) => (
                      <li key={i}>
                        <code className="bg-red-100 dark:bg-red-900 px-1 rounded">{node.nodeType}</code>
                        {" in "}{node.workflows.join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Cycles */}
              {dryRunResult.validation.dependencyValidation.hasCycle && (
                <div className="p-2 rounded bg-red-50 dark:bg-red-950/50 text-sm">
                  <p className="font-medium text-red-800 dark:text-red-200 mb-1">
                    Circular Dependencies Detected
                  </p>
                  <ul className="list-disc list-inside text-red-700 dark:text-red-300 space-y-1">
                    {dryRunResult.validation.dependencyValidation.cycles.map((cycle, i) => (
                      <li key={i}>{cycle.join(" → ")}</li>
                    ))}
                  </ul>
                </div>
              )}
              {/* No issues */}
              {dryRunResult.validation.errors.length === 0 &&
                dryRunResult.validation.warnings.length === 0 &&
                dryRunResult.validation.nodeValidation.missingNodes.length === 0 &&
                !dryRunResult.validation.dependencyValidation.hasCycle && (
                <div className="p-2 rounded bg-green-50 dark:bg-green-950/50 text-sm text-green-700 dark:text-green-300">
                  All validation checks passed.
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Dependency graph collapsible */}
          <Collapsible open={showDependencyGraph} onOpenChange={setShowDependencyGraph}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4" />
                  Dependency Order ({dryRunResult.validation.dependencyValidation.dependencyOrder.length} workflows)
                </span>
                {showDependencyGraph ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="text-xs text-muted-foreground mb-2">
                  Workflows will be imported in this order (dependencies first):
                </p>
                <div className="space-y-1">
                  {dryRunResult.validation.dependencyValidation.dependencyOrder.map((name, i) => (
                    <div key={name} className="flex items-center gap-2 text-sm">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                        {i + 1}
                      </span>
                      <span className="truncate">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Preview changes summary */}
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="p-2 rounded bg-green-50 dark:bg-green-950/50">
              <div className="font-bold text-green-700 dark:text-green-300">
                {dryRunResult.workflows.filter(w => w.action === "create").length}
              </div>
              <div className="text-xs text-green-600 dark:text-green-400">Will Create</div>
            </div>
            <div className="p-2 rounded bg-blue-50 dark:bg-blue-950/50">
              <div className="font-bold text-blue-700 dark:text-blue-300">
                {dryRunResult.workflows.filter(w => w.action === "update").length}
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-400">Will Update</div>
            </div>
            <div className="p-2 rounded bg-muted">
              <div className="font-bold text-muted-foreground">
                {dryRunResult.workflows.filter(w => w.action === "skip").length}
              </div>
              <div className="text-xs text-muted-foreground">Will Skip</div>
            </div>
          </div>
        </div>
      )}

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

      {/* Sync result banner */}
      {lastSyncResult && (lastSyncResult.deleted > 0 || lastSyncResult.stateChanged > 0) && (
        <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Sync completed:</strong>{" "}
            {lastSyncResult.deleted > 0 && (
              <span>{lastSyncResult.deleted} workflow(s) were deleted from n8n. </span>
            )}
            {lastSyncResult.stateChanged > 0 && (
              <span>{lastSyncResult.stateChanged} workflow(s) had state changes. </span>
            )}
            {lastSyncResult.errors > 0 && (
              <span className="text-red-600">{lastSyncResult.errors} error(s) occurred.</span>
            )}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-center gap-4 flex-wrap">
        {/* Phase B: Preview Changes button */}
        {!allImported && pendingCount > 0 && onDryRun && !dryRunResult && (
          <Button
            onClick={handleDryRun}
            disabled={isImporting || isLoading || isSyncing || isDryRunning}
            variant="outline"
            size="lg"
          >
            {isDryRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                Preview Changes
              </>
            )}
          </Button>
        )}

        {!allImported && pendingCount > 0 && (
          <Button
            onClick={handleStartImport}
            disabled={isImporting || isLoading || isSyncing || isDryRunning}
            size="lg"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                {dryRunResult ? "Start Import" : "Import All Workflows"}
              </>
            )}
          </Button>
        )}

        {hasFailures && !isImporting && (
          <Button
            onClick={onRetryFailed}
            variant="outline"
            size="lg"
            disabled={isSyncing}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry Failed ({failedCount})
          </Button>
        )}

        {/* Sync button - always visible when there are imported workflows */}
        {onSync && importedCount > 0 && (
          <Button
            onClick={onSync}
            variant="outline"
            size="lg"
            disabled={isImporting || isLoading || isSyncing}
          >
            {isSyncing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCcw className="w-4 h-4 mr-2" />
                Sync with n8n
              </>
            )}
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
