import { useMemo } from "react";
import { cn, formatBytes, formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyStateNoArtifacts } from "@/components/ui/empty-state";
import type { Artifact } from "@/types/artifact";
import { ARTIFACT_LABELS } from "@/types/artifact";

interface ArtifactListProps {
  artifacts: Artifact[];
  selectedKey?: string;
  onSelect: (artifact: Artifact) => void;
  isLoading?: boolean;
}

export function ArtifactList({
  artifacts,
  selectedKey,
  onSelect,
  isLoading,
}: ArtifactListProps) {
  // Memoize artifact grouping - must be called before any early returns
  const { finalArtifacts, draftArtifacts, otherArtifacts } = useMemo(() => {
    const finals = artifacts.filter(
      (a) => a.type === "vision_final" || a.type === "architecture_final"
    );
    const drafts = artifacts.filter(
      (a) => a.type === "vision_draft" || a.type === "architecture_draft"
    );
    const others = artifacts.filter(
      (a) =>
        !["vision_final", "architecture_final", "vision_draft", "architecture_draft"].includes(
          a.type
        )
    );
    return { finalArtifacts: finals, draftArtifacts: drafts, otherArtifacts: others };
  }, [artifacts]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-3 border rounded-lg">
            <Skeleton className="h-4 w-32 mb-2" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (artifacts.length === 0) {
    return <EmptyStateNoArtifacts />;
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-2">
        {finalArtifacts.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 px-2">
              Final Documents
            </h4>
            <div className="space-y-1">
              {finalArtifacts.map((artifact) => (
                <ArtifactItem
                  key={artifact.key}
                  artifact={artifact}
                  isSelected={selectedKey === artifact.key}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        )}
        {draftArtifacts.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 px-2">
              Drafts
            </h4>
            <div className="space-y-1">
              {draftArtifacts.map((artifact) => (
                <ArtifactItem
                  key={artifact.key}
                  artifact={artifact}
                  isSelected={selectedKey === artifact.key}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        )}
        {otherArtifacts.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 px-2">
              Other Files
            </h4>
            <div className="space-y-1">
              {otherArtifacts.map((artifact) => (
                <ArtifactItem
                  key={artifact.key}
                  artifact={artifact}
                  isSelected={selectedKey === artifact.key}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

interface ArtifactItemProps {
  artifact: Artifact;
  isSelected: boolean;
  onSelect: (artifact: Artifact) => void;
}

function ArtifactItem({ artifact, isSelected, onSelect }: ArtifactItemProps) {
  const getTypeVariant = () => {
    if (artifact.type.includes("final")) return "success";
    if (artifact.type.includes("draft")) return "secondary";
    if (artifact.type === "decision_log") return "info";
    return "outline";
  };

  return (
    <button
      onClick={() => onSelect(artifact)}
      className={cn(
        "w-full text-left p-3 rounded-lg border transition-colors",
        isSelected
          ? "bg-primary/10 border-primary"
          : "hover:bg-muted/50 border-transparent"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium truncate flex-1">
          {artifact.name}
        </span>
        <Badge variant={getTypeVariant()} className="text-xs shrink-0">
          {ARTIFACT_LABELS[artifact.type]}
        </Badge>
      </div>
      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
        <span>{formatBytes(artifact.size)}</span>
        <span>•</span>
        <span>{formatRelativeTime(artifact.lastModified)}</span>
      </div>
    </button>
  );
}
