import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Server, Workflow, RefreshCw } from "lucide-react";
import { RouteErrorBoundary } from "@/components/error/RouteErrorBoundary";
import { RouteLoadingSpinner } from "@/components/loading/RouteLoadingSpinner";
import { requireAuth } from "@/lib/auth-guard";

export const Route = createFileRoute("/settings/")({
  beforeLoad: async ({ location }) => {
    return requireAuth(location);
  },
  component: SettingsPage,
  errorComponent: RouteErrorBoundary,
  pendingComponent: RouteLoadingSpinner,
});

const settingsCategories = [
  {
    id: "n8n",
    title: "n8n Integration",
    description: "Configure your n8n instance connection and API settings",
    icon: Server,
    href: "/settings/n8n",
  },
  {
    id: "workflows",
    title: "Workflow Management",
    description: "View imported workflows, check for updates, and manage versions",
    icon: Workflow,
    href: "/settings/workflows",
  },
];

function SettingsPage() {
  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Manage your AI Product Factory configuration and integrations.
        </p>
      </div>

      <div className="grid gap-4">
        {settingsCategories.map((category) => (
          <Link key={category.id} to={category.href}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-4 pb-2">
                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
                  <category.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg">{category.title}</CardTitle>
                  <CardDescription>{category.description}</CardDescription>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/setup">
            <Button variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Re-run Setup Wizard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
