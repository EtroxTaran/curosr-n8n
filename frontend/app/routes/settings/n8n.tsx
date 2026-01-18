import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowLeft,
  Server,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Save,
} from "lucide-react";
import { RouteErrorBoundary } from "@/components/error/RouteErrorBoundary";
import { RouteLoadingSpinner } from "@/components/loading/RouteLoadingSpinner";
import { requireAuth } from "@/lib/auth-guard";

export const Route = createFileRoute("/settings/n8n")({
  beforeLoad: async ({ location }) => {
    return requireAuth(location);
  },
  component: N8nSettingsPage,
  errorComponent: RouteErrorBoundary,
  pendingComponent: RouteLoadingSpinner,
});

interface N8nStatus {
  configured: boolean;
  apiUrl?: string;
  webhookBaseUrl?: string;
  lastHealthCheck?: {
    timestamp: string;
    healthy: boolean;
  };
  n8nVersion?: string;
}

function N8nSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const [status, setStatus] = useState<N8nStatus | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookBaseUrl, setWebhookBaseUrl] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");

  // Load current settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch("/api/setup/status");
        const data = await response.json();

        setStatus({
          configured: data.n8nConfigured,
          apiUrl: data.apiUrl,
          webhookBaseUrl: data.webhookBaseUrl,
          lastHealthCheck: data.lastHealthCheck,
        });

        if (data.apiUrl) {
          setApiUrl(data.apiUrl);
        }
        if (data.webhookBaseUrl) {
          setWebhookBaseUrl(data.webhookBaseUrl);
        }
      } catch {
        toast.error("Failed to load settings");
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, []);

  // Test connection
  const testConnection = async () => {
    setIsTesting(true);
    setConnectionStatus("idle");

    try {
      const response = await fetch("/api/setup/n8n/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiUrl,
          apiKey: apiKey || undefined, // Only send if user entered new key
        }),
      });
      const data = await response.json();

      if (data.success) {
        setConnectionStatus("success");
        toast.success("Connection successful!");
      } else {
        setConnectionStatus("error");
        toast.error(data.error || "Connection failed");
      }
    } catch {
      setConnectionStatus("error");
      toast.error("Connection test failed");
    } finally {
      setIsTesting(false);
    }
  };

  // Save settings
  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/setup/n8n/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiUrl,
          apiKey: apiKey || undefined,
          webhookBaseUrl: webhookBaseUrl || apiUrl,
        }),
      });
      const data = await response.json();

      if (data.success) {
        toast.success("Settings saved");
        setApiKey(""); // Clear the API key field
        // Reload status
        const statusResponse = await fetch("/api/setup/status");
        const statusData = await statusResponse.json();
        setStatus({
          configured: statusData.n8nConfigured,
          apiUrl: statusData.apiUrl,
          webhookBaseUrl: statusData.webhookBaseUrl,
          lastHealthCheck: statusData.lastHealthCheck,
        });
      } else {
        toast.error(data.error || "Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  // Clear settings
  const clearSettings = async () => {
    if (!confirm("Are you sure you want to clear the n8n configuration?")) {
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/settings/n8n", {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        toast.success("Configuration cleared");
        setStatus({ configured: false });
        setApiUrl("");
        setApiKey("");
        setWebhookBaseUrl("");
        setConnectionStatus("idle");
      } else {
        toast.error(data.error || "Failed to clear settings");
      }
    } catch {
      toast.error("Failed to clear settings");
    } finally {
      setIsSaving(false);
    }
  };

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
            <Server className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">n8n Integration</h1>
            <p className="text-muted-foreground">
              Configure your n8n instance connection settings
            </p>
          </div>
        </div>
      </div>

      {/* Status card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Connection Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {status?.configured ? (
                <>
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="font-medium">Connected</p>
                    <p className="text-sm text-muted-foreground">
                      {status.apiUrl}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="w-6 h-6 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Not Configured</p>
                    <p className="text-sm text-muted-foreground">
                      Enter your n8n credentials below
                    </p>
                  </div>
                </>
              )}
            </div>
            {status?.lastHealthCheck && (
              <div className="text-right">
                <Badge
                  variant={status.lastHealthCheck.healthy ? "default" : "destructive"}
                  className={status.lastHealthCheck.healthy ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : ""}
                >
                  {status.lastHealthCheck.healthy ? "Healthy" : "Unhealthy"}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  Last checked: {new Date(status.lastHealthCheck.timestamp).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Configuration form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuration</CardTitle>
          <CardDescription>
            Update your n8n instance URL and API credentials
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* API URL */}
          <div className="space-y-2">
            <Label htmlFor="apiUrl">n8n Instance URL</Label>
            <Input
              id="apiUrl"
              type="url"
              placeholder="https://n8n.example.com"
              value={apiUrl}
              onChange={(e) => {
                setApiUrl(e.target.value);
                setConnectionStatus("idle");
              }}
              className="font-mono"
            />
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="apiKey">
              API Key
              {status?.configured && (
                <span className="text-muted-foreground font-normal ml-2">
                  (leave empty to keep existing)
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                placeholder={status?.configured ? "••••••••••••" : "n8n_api_..."}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setConnectionStatus("idle");
                }}
                className="font-mono pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Webhook Base URL */}
          <div className="space-y-2">
            <Label htmlFor="webhookBaseUrl">Webhook Base URL (Optional)</Label>
            <Input
              id="webhookBaseUrl"
              type="url"
              placeholder={apiUrl || "https://n8n.example.com"}
              value={webhookBaseUrl}
              onChange={(e) => {
                setWebhookBaseUrl(e.target.value);
              }}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use the same URL as your n8n instance
            </p>
          </div>

          {/* Connection test result */}
          {connectionStatus === "success" && (
            <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-900 dark:text-green-100">
                Connection Successful
              </AlertTitle>
              <AlertDescription className="text-green-800 dark:text-green-200">
                Successfully connected to your n8n instance.
              </AlertDescription>
            </Alert>
          )}

          {connectionStatus === "error" && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Connection Failed</AlertTitle>
              <AlertDescription>
                Unable to connect to the n8n instance. Please check your URL and API key.
              </AlertDescription>
            </Alert>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 pt-4">
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={isTesting || !apiUrl}
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>

            <Button
              onClick={saveSettings}
              disabled={isSaving || !apiUrl || (!apiKey && !status?.configured)}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>

            {status?.configured && (
              <Button
                variant="destructive"
                onClick={clearSettings}
                disabled={isSaving}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Configuration
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
