"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Op, OP_STATUS_LABELS, Loop } from "@/lib/types/knowledge";
import {
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  MoreHorizontal,
  Repeat,
  Tag,
  Trash2,
  Zap,
} from "lucide-react";

interface OpCardProps {
  op: Op;
  loop?: Loop;
  isSelected?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleStatus?: () => void;
  className?: string;
}

export function OpCard({
  op,
  loop,
  isSelected,
  onClick,
  onEdit,
  onDelete,
  onToggleStatus,
  className,
}: OpCardProps) {
  const statusInfo = OP_STATUS_LABELS[op.status];
  const isCompleted = op.status === "completed";
  const isOverdue =
    op.due_date && new Date(op.due_date) < new Date() && !isCompleted;

  const priorityColor =
    op.priority >= 8
      ? "text-red-500"
      : op.priority >= 5
        ? "text-yellow-500"
        : "text-muted-foreground";

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
        isSelected && "border-primary ring-2 ring-primary/20",
        isOverdue && "border-destructive/50",
        isCompleted && "opacity-60",
        className,
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Status checkbox */}
            {onToggleStatus && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStatus();
                }}
                className="flex-shrink-0 hover:scale-110 transition-transform"
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />
                )}
              </button>
            )}
            <CardTitle
              className={cn(
                "text-base font-semibold flex items-center gap-2 truncate",
                isCompleted && "line-through text-muted-foreground",
              )}
            >
              {loop && (
                <span className="text-lg flex-shrink-0">{loop.icon}</span>
              )}
              <span className="truncate">{op.title}</span>
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
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
                aria-label="Edytuj op"
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
                aria-label="Usun op"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {op.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {op.description}
          </p>
        )}

        {/* Tags */}
        {op.tags && op.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {op.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                <Tag className="h-2 w-2 mr-1" />
                {tag}
              </Badge>
            ))}
            {op.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{op.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            {/* Priority */}
            <div className={cn("flex items-center gap-1", priorityColor)}>
              <Zap className="h-3 w-3" />
              <span>P{op.priority}</span>
            </div>

            {/* Estimated effort */}
            {op.estimated_effort && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{op.estimated_effort}h</span>
              </div>
            )}

            {/* Due date */}
            {op.due_date && (
              <div
                className={cn(
                  "flex items-center gap-1",
                  isOverdue && "text-destructive",
                )}
              >
                <Calendar className="h-3 w-3" />
                <span>{new Date(op.due_date).toLocaleDateString("pl-PL")}</span>
              </div>
            )}
          </div>

          {/* Recurring indicator */}
          {op.is_recurring && <Repeat className="h-4 w-4 text-blue-500" />}
        </div>
      </CardContent>
    </Card>
  );
}
