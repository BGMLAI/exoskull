"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Package,
  Sparkles,
  LayoutGrid,
  Archive,
  Shield,
  Zap,
  Database,
  Globe,
  Bell,
  Power,
  PowerOff,
  Clock,
} from "lucide-react";
import {
  type UnifiedExtension,
  type SkillMeta,
  type ModMeta,
  TYPE_BADGE_CONFIG,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
} from "@/lib/extensions/types";

// ============================================================================
// TYPE ICON MAP
// ============================================================================

const TYPE_ICONS = {
  mod: Package,
  skill: Sparkles,
  app: LayoutGrid,
} as const;

const RISK_CONFIG = {
  low: {
    label: "Niskie",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  medium: {
    label: "Srednie",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  high: {
    label: "Wysokie",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

interface ExtensionCardProps {
  extension: UnifiedExtension;
  onArchive?: (id: string) => void;
}

export function ExtensionCard({ extension, onArchive }: ExtensionCardProps) {
  const router = useRouter();
  const TypeIcon = TYPE_ICONS[extension.type];
  const badgeConfig = TYPE_BADGE_CONFIG[extension.type];

  const handleClick = () => {
    if (extension.detailHref) {
      router.push(extension.detailHref);
    }
  };

  return (
    <Card
      className={`hover:shadow-md transition-shadow ${extension.detailHref ? "cursor-pointer" : ""}`}
      onClick={handleClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Icon */}
            {extension.icon ? (
              <span className="text-2xl shrink-0">{extension.icon}</span>
            ) : (
              <div className="p-2 rounded-lg bg-muted shrink-0">
                <TypeIcon className="w-4 h-4" />
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-1.5">
              {/* Name + type badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium truncate">{extension.name}</h3>
                <Badge className={`text-xs border-0 ${badgeConfig.color}`}>
                  <TypeIcon className="w-3 h-3 mr-1" />
                  {badgeConfig.label}
                </Badge>
              </div>

              {/* Description */}
              {extension.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {extension.description}
                </p>
              )}

              {/* Metadata row */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Category */}
                {extension.category && (
                  <Badge
                    variant="outline"
                    className={`border-0 text-xs ${CATEGORY_COLORS[extension.category] || ""}`}
                  >
                    {CATEGORY_LABELS[extension.category] || extension.category}
                  </Badge>
                )}

                {/* Skill-specific metadata */}
                {extension.meta.kind === "skill" && (
                  <>
                    <Badge
                      className={`text-xs border-0 ${RISK_CONFIG[(extension.meta as SkillMeta).riskLevel]?.color || ""}`}
                    >
                      <Shield className="h-3 w-3 mr-1" />
                      {RISK_CONFIG[(extension.meta as SkillMeta).riskLevel]
                        ?.label || ""}
                    </Badge>
                    {(extension.meta as SkillMeta).capabilities?.database
                      ?.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Database className="h-3 w-3" />
                        DB
                      </span>
                    )}
                    {(extension.meta as SkillMeta).capabilities
                      ?.externalApi && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        API
                      </span>
                    )}
                    {(extension.meta as SkillMeta).capabilities
                      ?.notifications && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Bell className="h-3 w-3" />
                        Notif.
                      </span>
                    )}
                    {(extension.meta as SkillMeta).usageCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Zap className="h-3 w-3" />
                        {(extension.meta as SkillMeta).usageCount}x
                      </span>
                    )}
                  </>
                )}

                {/* Mod active status */}
                {extension.meta.kind === "mod" && (
                  <>
                    {(extension.meta as ModMeta).active ? (
                      <Badge
                        variant="outline"
                        className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs"
                      >
                        <Power className="w-3 h-3 mr-1" />
                        On
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-muted text-muted-foreground border-0 text-xs"
                      >
                        <PowerOff className="w-3 h-3 mr-1" />
                        Off
                      </Badge>
                    )}
                  </>
                )}

                {/* Pending status */}
                {extension.status === "pending" && (
                  <Badge className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-0">
                    <Clock className="h-3 w-3 mr-1" />
                    Oczekuje
                  </Badge>
                )}

                {/* Date */}
                <span className="text-xs text-muted-foreground">
                  {new Date(extension.createdAt).toLocaleDateString("pl-PL")}
                </span>
              </div>
            </div>
          </div>

          {/* Archive action (skills only) */}
          {extension.type === "skill" && onArchive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onArchive(extension.id);
              }}
              title="Archiwizuj"
            >
              <Archive className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
