import * as React from "react";
import {
  Settings2,
  CheckCircle2,
  XCircle,
  SkipForward,
  Globe,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  GovernancePayload,
  GovernanceResponse,
  TechItem,
  TechDecision,
} from "@/lib/schemas";

// ============================================
// Types
// ============================================

type ActionType = "approve" | "reject" | "skip";
type ScopeType = "global" | "local";

interface TechDecisionState {
  action: ActionType;
  scope?: ScopeType;
  selectedAlternative?: string;
}

interface GovernanceWidgetProps {
  payload: GovernancePayload;
  onSubmit: (response: GovernanceResponse) => Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
}

// ============================================
// Helper Components
// ============================================

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    database: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    framework: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    language: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    security: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
    infrastructure: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
    integration: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
    compliance: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    development: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
  };

  return (
    <Badge variant="outline" className={cn("text-xs", colors[category] || "")}>
      {category}
    </Badge>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const color =
    percent >= 80 ? "bg-green-500" : percent >= 50 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{percent}%</span>
    </div>
  );
}

// ============================================
// TechRow Component
// ============================================

interface TechRowProps {
  tech: TechItem;
  decision: TechDecisionState;
  onDecisionChange: (decision: TechDecisionState) => void;
  expanded: boolean;
  onExpandToggle: () => void;
}

function TechRow({ tech, decision, onDecisionChange, expanded, onExpandToggle }: TechRowProps) {
  const hasAlternatives = tech.alternatives && tech.alternatives.length > 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Main Row */}
      <div
        className={cn(
          "flex items-center gap-4 p-3 cursor-pointer hover:bg-muted/50 transition-colors",
          decision.action === "approve" && "bg-green-50 dark:bg-green-950/20",
          decision.action === "reject" && "bg-red-50 dark:bg-red-950/20",
          decision.action === "skip" && "bg-muted/30"
        )}
        onClick={onExpandToggle}
      >
        {/* Tech Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{tech.name}</span>
            <CategoryBadge category={tech.category} />
            {hasAlternatives && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    {tech.alternatives!.length} alternatives available
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {tech.source}
            </span>
            <ConfidenceBar confidence={tech.confidence} />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={decision.action === "approve" && decision.scope === "global" ? "default" : "ghost"}
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDecisionChange({ action: "approve", scope: "global" });
                  }}
                >
                  <Globe className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Approve (Global)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={decision.action === "approve" && decision.scope === "local" ? "default" : "ghost"}
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDecisionChange({ action: "approve", scope: "local" });
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Approve (Local)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={decision.action === "skip" ? "secondary" : "ghost"}
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDecisionChange({ action: "skip" });
                  }}
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Skip</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button size="icon" variant="ghost" className="h-8 w-8">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="p-4 bg-muted/30 border-t space-y-4">
          <p className="text-sm text-muted-foreground">{tech.description}</p>

          {/* Alternatives Selection */}
          {hasAlternatives && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Use Alternative</Label>
              <Select
                value={decision.selectedAlternative || tech.name}
                onValueChange={(value) =>
                  onDecisionChange({
                    ...decision,
                    selectedAlternative: value === tech.name ? undefined : value,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={tech.name}>
                    {tech.name} (Original)
                  </SelectItem>
                  {tech.alternatives!.map((alt) => (
                    <SelectItem key={alt.name} value={alt.name}>
                      {alt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Show alternative details if selected */}
              {decision.selectedAlternative && (
                <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-md text-sm">
                  {(() => {
                    const alt = tech.alternatives!.find(
                      (a) => a.name === decision.selectedAlternative
                    );
                    if (!alt) return null;
                    return (
                      <>
                        <p className="text-muted-foreground">{alt.description}</p>
                        {alt.pros && alt.pros.length > 0 && (
                          <div className="mt-2">
                            <span className="text-green-600 font-medium">Pros: </span>
                            {alt.pros.join(", ")}
                          </div>
                        )}
                        {alt.cons && alt.cons.length > 0 && (
                          <div className="mt-1">
                            <span className="text-red-600 font-medium">Cons: </span>
                            {alt.cons.join(", ")}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Scope Selection */}
          {decision.action === "approve" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Scope</Label>
              <RadioGroup
                value={decision.scope}
                onValueChange={(value: ScopeType) =>
                  onDecisionChange({ ...decision, scope: value })
                }
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="global" id={`${tech.id}-global`} />
                  <Label htmlFor={`${tech.id}-global`} className="font-normal">
                    Global (all projects)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="local" id={`${tech.id}-local`} />
                  <Label htmlFor={`${tech.id}-local`} className="font-normal">
                    Local (this project only)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// GovernanceWidget Component
// ============================================

export function GovernanceWidget({
  payload,
  onSubmit,
  onCancel,
  disabled = false,
}: GovernanceWidgetProps) {
  const [decisions, setDecisions] = React.useState<Record<string, TechDecisionState>>(() => {
    // Initialize all techs with "skip" action
    const initial: Record<string, TechDecisionState> = {};
    for (const tech of payload.detected_stack) {
      initial[tech.id] = { action: "skip" };
    }
    return initial;
  });

  const [expandedTech, setExpandedTech] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Calculate stats
  const stats = React.useMemo(() => {
    const values = Object.values(decisions);
    return {
      approved: values.filter((d) => d.action === "approve").length,
      approvedGlobal: values.filter((d) => d.action === "approve" && d.scope === "global").length,
      approvedLocal: values.filter((d) => d.action === "approve" && d.scope === "local").length,
      skipped: values.filter((d) => d.action === "skip").length,
      total: values.length,
    };
  }, [decisions]);

  // Update a single decision
  const updateDecision = React.useCallback((techId: string, decision: TechDecisionState) => {
    setDecisions((prev) => ({ ...prev, [techId]: decision }));
  }, []);

  // Batch actions
  const approveAll = React.useCallback((scope: ScopeType) => {
    setDecisions((prev) => {
      const updated = { ...prev };
      for (const id of Object.keys(updated)) {
        updated[id] = { action: "approve", scope };
      }
      return updated;
    });
  }, []);

  const skipAll = React.useCallback(() => {
    setDecisions((prev) => {
      const updated = { ...prev };
      for (const id of Object.keys(updated)) {
        updated[id] = { action: "skip" };
      }
      return updated;
    });
  }, []);

  // Submit handler
  const handleSubmit = React.useCallback(async () => {
    setIsSubmitting(true);
    try {
      const techDecisions: TechDecision[] = payload.detected_stack.map((tech) => {
        const decision = decisions[tech.id];
        return {
          tech_id: tech.id,
          action: decision.action,
          scope: decision.scope,
          selected_alternative: decision.selectedAlternative,
        };
      });

      const response: GovernanceResponse = {
        scavenging_id: payload.scavenging_id,
        project_id: payload.project_id,
        decisions: techDecisions,
        submitted_at: new Date().toISOString(),
      };

      await onSubmit(response);
    } finally {
      setIsSubmitting(false);
    }
  }, [payload, decisions, onSubmit]);

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Tech Stack Configurator
            </CardTitle>
            <CardDescription className="mt-1">
              Review detected technologies and approve them for use in this project
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30">
              {stats.approved} Approved
            </Badge>
            <Badge variant="outline" className="bg-muted">
              {stats.skipped} Skipped
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Batch Actions */}
        <div className="flex flex-wrap gap-2 pb-2 border-b">
          <Button
            size="sm"
            variant="outline"
            onClick={() => approveAll("global")}
            disabled={disabled || isSubmitting}
          >
            <Globe className="h-4 w-4 mr-1" />
            Approve All (Global)
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => approveAll("local")}
            disabled={disabled || isSubmitting}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Approve All (Local)
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={skipAll}
            disabled={disabled || isSubmitting}
          >
            <SkipForward className="h-4 w-4 mr-1" />
            Skip All
          </Button>
        </div>

        {/* Tech List */}
        <div className="space-y-2">
          {payload.detected_stack.map((tech) => (
            <TechRow
              key={tech.id}
              tech={tech}
              decision={decisions[tech.id]}
              onDecisionChange={(d) => updateDecision(tech.id, d)}
              expanded={expandedTech === tech.id}
              onExpandToggle={() =>
                setExpandedTech((prev) => (prev === tech.id ? null : tech.id))
              }
            />
          ))}
        </div>

        {payload.detected_stack.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No technologies detected in the uploaded documents.
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between border-t pt-4">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <div className="flex items-center gap-4 ml-auto">
          <span className="text-sm text-muted-foreground">
            {stats.approvedGlobal} global, {stats.approvedLocal} local
          </span>
          <Button onClick={handleSubmit} disabled={disabled || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirm Selections
              </>
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default GovernanceWidget;
