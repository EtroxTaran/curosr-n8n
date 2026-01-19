import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  SetupWizardLayout,
  SetupStepWelcome,
  SetupStepConnect,
  SetupStepImport,
  SetupStepWebhooks,
  SetupStepVerify,
  SetupStepComplete,
  type WorkflowStatus,
  type WebhookInfo,
  type VerificationResult,
  type SyncResult,
  type DryRunResult,
} from "@/components/setup";
import { RouteErrorBoundary } from "@/components/error/RouteErrorBoundary";
import { RouteLoadingSpinner } from "@/components/loading/RouteLoadingSpinner";
import { requireAuth } from "@/lib/auth-guard";

export const Route = createFileRoute("/setup/")({
  beforeLoad: async ({ location }) => {
    return requireAuth(location);
  },
  component: SetupWizardPage,
  errorComponent: RouteErrorBoundary,
  pendingComponent: RouteLoadingSpinner,
});

interface SetupState {
  // Step 2: Connect
  apiUrl: string;
  apiKey: string;
  webhookBaseUrl: string;
  connectionStatus: "idle" | "testing" | "success" | "error";
  connectionError?: string;
  connectionVersion?: string;

  // Step 3: Import
  workflows: WorkflowStatus[];
  isLoadingWorkflows: boolean;
  isImporting: boolean;
  importProgress: { current: string; completed: number; total: number; phase?: "creating" | "activating" } | null;
  isSyncing: boolean;
  lastSyncResult: SyncResult | null;

  // Step 4: Webhooks
  webhooks: WebhookInfo[];

  // Step 5: Verify
  verificationResults: VerificationResult[];
  isVerifying: boolean;

  // Step 6: Complete
  setupSummary: {
    n8nConfigured: boolean;
    workflowsImported: number;
    workflowsTotal: number;
    webhooksConfigured: number;
  };
}

const initialVerificationResults: VerificationResult[] = [
  {
    id: "n8n-health",
    name: "n8n Instance Health",
    description: "Verify n8n instance is running and accessible",
    status: "pending",
  },
  {
    id: "api-access",
    name: "API Access",
    description: "Verify API key has correct permissions",
    status: "pending",
  },
  {
    id: "workflows",
    name: "Workflow Status",
    description: "Verify all workflows are imported and active",
    status: "pending",
  },
  {
    id: "webhooks",
    name: "Webhook Endpoints",
    description: "Verify webhook endpoints are accessible",
    status: "pending",
  },
];

function SetupWizardPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [state, setState] = useState<SetupState>({
    apiUrl: "",
    apiKey: "",
    webhookBaseUrl: "",
    connectionStatus: "idle",
    workflows: [],
    isLoadingWorkflows: false,
    isImporting: false,
    importProgress: null,
    isSyncing: false,
    lastSyncResult: null,
    webhooks: [],
    verificationResults: initialVerificationResults,
    isVerifying: false,
    setupSummary: {
      n8nConfigured: false,
      workflowsImported: 0,
      workflowsTotal: 0,
      webhooksConfigured: 0,
    },
  });

  // Load workflows when entering step 3
  const loadWorkflows = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoadingWorkflows: true }));
    try {
      const response = await fetch("/api/setup/workflows/list");
      if (!response.ok) throw new Error("Failed to load workflows");
      const data = await response.json();
      setState((prev) => ({
        ...prev,
        workflows: data.workflows,
        isLoadingWorkflows: false,
      }));
    } catch (error) {
      toast.error("Failed to load workflows");
      setState((prev) => ({ ...prev, isLoadingWorkflows: false }));
    }
  }, []);

  // Test n8n connection
  const testConnection = async () => {
    setState((prev) => ({ ...prev, connectionStatus: "testing" }));
    try {
      const response = await fetch("/api/setup/n8n/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiUrl: state.apiUrl,
          apiKey: state.apiKey,
        }),
      });
      const data = await response.json();

      if (data.success) {
        setState((prev) => ({
          ...prev,
          connectionStatus: "success",
          connectionVersion: data.version,
          connectionError: undefined,
        }));
        toast.success("Connection successful!");
      } else {
        setState((prev) => ({
          ...prev,
          connectionStatus: "error",
          connectionError: data.error,
        }));
        toast.error(data.error || "Connection failed");
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        connectionStatus: "error",
        connectionError: "Network error. Please check your connection.",
      }));
      toast.error("Connection failed");
    }
  };

  // Save n8n config
  const saveConfig = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/setup/n8n/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiUrl: state.apiUrl,
          apiKey: state.apiKey,
          webhookBaseUrl: state.webhookBaseUrl || state.apiUrl,
        }),
      });
      const data = await response.json();

      if (data.success) {
        toast.success("Configuration saved");
        return true;
      } else {
        toast.error(data.error || "Failed to save configuration");
        return false;
      }
    } catch {
      toast.error("Failed to save configuration");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Import workflows
  const startImport = async () => {
    setState((prev) => ({
      ...prev,
      isImporting: true,
      importProgress: { current: "", completed: 0, total: prev.workflows.length },
    }));

    try {
      const response = await fetch("/api/setup/workflows/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importAll: true }),
      });
      const data = await response.json();

      if (data.success) {
        toast.success(`Imported ${data.progress.completed} workflows`);
        await loadWorkflows(); // Refresh the list
      } else {
        toast.error(data.error || "Import failed");
      }
    } catch {
      toast.error("Import failed");
    } finally {
      setState((prev) => ({
        ...prev,
        isImporting: false,
        importProgress: null,
      }));
    }
  };

  // Retry failed imports
  const retryFailed = async () => {
    const failedWorkflows = state.workflows.filter((w) => w.importStatus === "failed");
    setState((prev) => ({
      ...prev,
      isImporting: true,
      importProgress: { current: "", completed: 0, total: failedWorkflows.length },
    }));

    try {
      for (const workflow of failedWorkflows) {
        setState((prev) => ({
          ...prev,
          importProgress: {
            ...prev.importProgress!,
            current: workflow.name,
          },
        }));

        const response = await fetch("/api/setup/workflows/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: workflow.filename }),
        });

        if (response.ok) {
          setState((prev) => ({
            ...prev,
            importProgress: {
              ...prev.importProgress!,
              completed: prev.importProgress!.completed + 1,
            },
          }));
        }
      }

      await loadWorkflows();
      toast.success("Retry complete");
    } catch {
      toast.error("Retry failed");
    } finally {
      setState((prev) => ({
        ...prev,
        isImporting: false,
        importProgress: null,
      }));
    }
  };

  // Sync workflows with n8n
  const syncWorkflows = async () => {
    setState((prev) => ({ ...prev, isSyncing: true, lastSyncResult: null }));

    try {
      const response = await fetch("/api/workflows/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();

      if (data.success !== false) {
        const syncResult: SyncResult = {
          total: data.total,
          synced: data.synced,
          deleted: data.deleted,
          stateChanged: data.stateChanged,
          errors: data.errors,
        };

        setState((prev) => ({
          ...prev,
          lastSyncResult: syncResult,
        }));

        if (data.deleted > 0 || data.stateChanged > 0) {
          toast.success(
            `Sync complete: ${data.deleted} deleted, ${data.stateChanged} changed`
          );
          // Refresh workflow list to show updated state
          await loadWorkflows();
        } else {
          toast.success("Sync complete: No changes detected");
        }
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch {
      toast.error("Failed to sync with n8n");
    } finally {
      setState((prev) => ({ ...prev, isSyncing: false }));
    }
  };

  // Phase B: Dry-run import preview
  const dryRunImport = useCallback(async (): Promise<DryRunResult> => {
    const response = await fetch("/api/setup/workflows/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });

    if (!response.ok) {
      throw new Error("Failed to run dry-run preview");
    }

    const data = await response.json();
    return data.preview as DryRunResult;
  }, []);

  // Build webhooks list from workflows
  useEffect(() => {
    const webhooks: WebhookInfo[] = [];
    const baseUrl = state.webhookBaseUrl || state.apiUrl;

    for (const workflow of state.workflows) {
      for (const path of workflow.webhookPaths) {
        webhooks.push({
          workflowName: workflow.name,
          path,
          fullUrl: `${baseUrl}${path}`,
          isActive: workflow.isActive,
        });
      }
    }

    setState((prev) => ({ ...prev, webhooks }));
  }, [state.workflows, state.webhookBaseUrl, state.apiUrl]);

  // Run verification
  const runVerification = async () => {
    setState((prev) => ({
      ...prev,
      isVerifying: true,
      verificationResults: prev.verificationResults.map((r) => ({
        ...r,
        status: "checking" as const,
      })),
    }));

    try {
      const response = await fetch("/api/setup/workflows/verify", {
        method: "POST",
      });
      const data = await response.json();

      const results: VerificationResult[] = [
        {
          id: "n8n-health",
          name: "n8n Instance Health",
          description: "Verify n8n instance is running and accessible",
          status: data.n8nHealth?.healthy ? "success" : "error",
          message: data.n8nHealth?.healthy
            ? "n8n instance is healthy"
            : data.n8nHealth?.error || "n8n instance is not accessible",
        },
        {
          id: "api-access",
          name: "API Access",
          description: "Verify API key has correct permissions",
          status: data.apiAccess ? "success" : "error",
          message: data.apiAccess
            ? "API access verified"
            : "API access failed",
        },
        {
          id: "workflows",
          name: "Workflow Status",
          description: "Verify all workflows are imported and active",
          status:
            data.workflowsActive === data.workflowsTotal
              ? "success"
              : data.workflowsActive > 0
              ? "warning"
              : "error",
          message: `${data.workflowsActive}/${data.workflowsTotal} workflows active`,
        },
        {
          id: "webhooks",
          name: "Webhook Endpoints",
          description: "Verify webhook endpoints are accessible",
          status:
            data.webhooksConfigured > 0 ? "success" : "warning",
          message: `${data.webhooksConfigured} webhook endpoints configured`,
        },
      ];

      setState((prev) => ({
        ...prev,
        verificationResults: results,
        isVerifying: false,
        setupSummary: {
          n8nConfigured: data.n8nHealth?.healthy ?? false,
          workflowsImported: data.workflowsImported ?? 0,
          workflowsTotal: data.workflowsTotal ?? 0,
          webhooksConfigured: data.webhooksConfigured ?? 0,
        },
      }));
    } catch {
      toast.error("Verification failed");
      setState((prev) => ({
        ...prev,
        isVerifying: false,
        verificationResults: prev.verificationResults.map((r) => ({
          ...r,
          status: "error" as const,
          message: "Failed to run verification",
        })),
      }));
    }
  };

  // Complete setup
  const completeSetup = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();

      if (data.success) {
        toast.success("Setup complete!");
        setCurrentStep(5);
      } else {
        toast.error(data.error || "Failed to complete setup");
      }
    } catch {
      toast.error("Failed to complete setup");
    } finally {
      setIsLoading(false);
    }
  };

  // Skip setup
  const skipSetup = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip: true }),
      });
      const data = await response.json();

      if (data.success) {
        toast.success("Setup skipped");
        navigate({ to: "/projects" });
      } else {
        toast.error(data.error || "Failed to skip setup");
      }
    } catch {
      toast.error("Failed to skip setup");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle navigation
  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = async () => {
    switch (currentStep) {
      case 0: // Welcome -> Connect
        setCurrentStep(1);
        break;

      case 1: // Connect -> Import
        if (state.connectionStatus === "success") {
          const saved = await saveConfig();
          if (saved) {
            setCurrentStep(2);
            loadWorkflows();
          }
        } else {
          toast.error("Please test your connection first");
        }
        break;

      case 2: // Import -> Webhooks
        const importedCount = state.workflows.filter(
          (w) => w.importStatus === "imported"
        ).length;
        if (importedCount > 0) {
          setCurrentStep(3);
        } else {
          toast.error("Please import at least one workflow");
        }
        break;

      case 3: // Webhooks -> Verify
        setCurrentStep(4);
        break;

      case 4: // Verify -> Complete
        await completeSetup();
        break;

      default:
        break;
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <SetupStepWelcome />;
      case 1:
        return (
          <SetupStepConnect
            apiUrl={state.apiUrl}
            apiKey={state.apiKey}
            webhookBaseUrl={state.webhookBaseUrl}
            onApiUrlChange={(v) => setState((prev) => ({ ...prev, apiUrl: v, connectionStatus: "idle" }))}
            onApiKeyChange={(v) => setState((prev) => ({ ...prev, apiKey: v, connectionStatus: "idle" }))}
            onWebhookBaseUrlChange={(v) => setState((prev) => ({ ...prev, webhookBaseUrl: v }))}
            onTestConnection={testConnection}
            connectionStatus={state.connectionStatus}
            connectionError={state.connectionError}
            connectionVersion={state.connectionVersion}
          />
        );
      case 2:
        return (
          <SetupStepImport
            workflows={state.workflows}
            isLoading={state.isLoadingWorkflows}
            isImporting={state.isImporting}
            importProgress={state.importProgress}
            onStartImport={startImport}
            onRetryFailed={retryFailed}
            isSyncing={state.isSyncing}
            lastSyncResult={state.lastSyncResult}
            onSync={syncWorkflows}
            onDryRun={dryRunImport}
          />
        );
      case 3:
        return (
          <SetupStepWebhooks
            webhooks={state.webhooks}
            webhookBaseUrl={state.webhookBaseUrl || state.apiUrl}
          />
        );
      case 4:
        return (
          <SetupStepVerify
            verificationResults={state.verificationResults}
            isVerifying={state.isVerifying}
            onVerify={runVerification}
          />
        );
      case 5:
        return (
          <SetupStepComplete
            summary={state.setupSummary}
            onGoToProjects={() => navigate({ to: "/projects" })}
            onGoToSettings={() => navigate({ to: "/settings/n8n" })}
          />
        );
      default:
        return null;
    }
  };

  const getNextLabel = () => {
    switch (currentStep) {
      case 1:
        return state.connectionStatus === "success" ? "Save & Continue" : "Continue";
      case 4:
        return "Complete Setup";
      case 5:
        return ""; // No next button on complete step
      default:
        return "Continue";
    }
  };

  const isNextDisabled = () => {
    switch (currentStep) {
      case 1:
        return state.connectionStatus !== "success";
      case 2:
        return (
          state.workflows.filter((w) => w.importStatus === "imported").length === 0
        );
      default:
        return false;
    }
  };

  return (
    <SetupWizardLayout
      currentStep={currentStep}
      onBack={handleBack}
      onNext={handleNext}
      onSkip={skipSetup}
      nextLabel={getNextLabel()}
      nextDisabled={isNextDisabled()}
      showBack={currentStep > 0 && currentStep < 5}
      showNext={currentStep < 5}
      showSkip={currentStep === 0}
      isLoading={isLoading || state.isImporting}
    >
      {renderStep()}
    </SetupWizardLayout>
  );
}
