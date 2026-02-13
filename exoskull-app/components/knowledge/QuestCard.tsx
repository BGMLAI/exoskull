"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Quest, QUEST_STATUS_LABELS, Loop } from "@/lib/types/knowledge";
import {
  Calendar,
  CheckSquare,
  ChevronRight,
  MoreHorizontal,
  Tag,
  Trash2,
} from "lucide-react";

interface QuestCardProps {
  quest: Quest;
  loop?: Loop;
  isSelected?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function QuestCard({
  quest,
  loop,
  isSelected,
  onClick,
  onEdit,
  onDelete,
  className,
}: QuestCardProps) {
  const statusInfo = QUEST_STATUS_LABELS[quest.status];
  const progress =
    quest.target_ops && quest.target_ops > 0
      ? Math.round((quest.completed_ops / quest.target_ops) * 100)
      : null;

  const isOverdue =
    quest.deadline &&
    new Date(quest.deadline) < new Date() &&
    quest.status !== "completed";

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
        isSelected && "border-primary ring-2 ring-primary/20",
        isOverdue && "border-destructive/50",
        className,
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            {loop && <span className="text-lg">{loop.icon}</span>}
            {quest.title}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Badge className={cn("text-xs text-white", statusInfo.color)}>
              {statusInfo.label}
            </Badge>
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                aria-label="Edytuj quest"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                aria-label="Usun quest"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {quest.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {quest.description}
          </p>
        )}

        {/* Progress bar (if target_ops is set) */}
        {progress !== null && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Postep</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Tags */}
        {quest.tags && quest.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {quest.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                <Tag className="h-2 w-2 mr-1" />
                {tag}
              </Badge>
            ))}
            {quest.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{quest.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <CheckSquare className="h-3 w-3" />
              <span>
                {quest.completed_ops}
                {quest.target_ops ? `/${quest.target_ops}` : ""} ops
              </span>
            </div>
            {quest.deadline && (
              <div
                className={cn(
                  "flex items-center gap-1",
                  isOverdue && "text-destructive",
                )}
              >
                <Calendar className="h-3 w-3" />
                <span>
                  {new Date(quest.deadline).toLocaleDateString("pl-PL")}
                </span>
              </div>
            )}
          </div>
          <ChevronRight className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}
