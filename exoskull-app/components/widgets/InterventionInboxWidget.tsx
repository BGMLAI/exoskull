"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Inbox,
  Check,
  X,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  Clock,
} from "lucide-react";
import type {
  PendingIntervention,
  CompletedIntervention,
} from "@/lib/dashboard/types";

interface InterventionInboxWidgetProps {
  pending: PendingIntervention[];
  needsFeedback: CompletedIntervention[];
}

export function InterventionInboxWidget({
  pending: initialPending,
  needsFeedback: initialFeedback,
}: InterventionInboxWidgetProps) {
  const [pending, setPending] = useState(initialPending);
  const [needsFeedback, setNeedsFeedback] = useState(initialFeedback);
  const [loading, setLoading] = useState<string | null>(null);

  const respond = useCallback(
    async (
      id: string,
      action: "approve" | "dismiss" | "feedback",
      feedback?: string,
      rating?: number,
    ) => {
      setLoading(id);
      try {
        await fetch(`/api/interventions/${id}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, feedback, rating }),
        });

        if (action === "approve" || action === "dismiss") {
          setPending((prev) => prev.filter((p) => p.id !== id));
        }
        if (action === "feedback") {
          setNeedsFeedback((prev) => prev.filter((p) => p.id !== id));
        }
      } catch (err) {
        console.error("[InterventionInbox] Respond error:", err);
      } finally {
        setLoading(null);
      }
    },
    [],
  );

  const isEmpty = pending.length === 0 && needsFeedback.length === 0;

  return (
    <Card className="h-full overflow-auto">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          Interwencje
          {pending.length > 0 && (
            <Badge variant="destructive" className="ml-1 text-xs">
              {pending.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
            <Check className="h-8 w-8 mb-2 text-green-500" />
            <p className="text-sm">Wszystko pod kontrola</p>
            <p className="text-xs">Brak oczekujacych interwencji</p>
          </div>
        )}

        {/* Pending interventions */}
        {pending.map((intv) => (
          <div
            key={intv.id}
            className="p-3 rounded-lg border bg-muted/30 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <PriorityBadge priority={intv.priority} />
                  <span className="text-xs text-muted-foreground">
                    {intv.intervention_type}
                  </span>
                </div>
                <p className="text-sm font-medium truncate">{intv.title}</p>
                {intv.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {intv.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={loading === intv.id}
                onClick={() => respond(intv.id, "approve")}
              >
                <Check className="h-3 w-3 mr-1" />
                Zatwierdz
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="flex-1"
                disabled={loading === intv.id}
                onClick={() => respond(intv.id, "dismiss")}
              >
                <X className="h-3 w-3 mr-1" />
                Odrzuc
              </Button>
            </div>
          </div>
        ))}

        {/* Needs feedback */}
        {needsFeedback.length > 0 && (
          <>
            {pending.length > 0 && (
              <div className="border-t pt-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Ocen wykonane
                </p>
              </div>
            )}
            {needsFeedback.map((intv) => (
              <div
                key={intv.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/20"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{intv.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRelative(intv.completed_at)}
                  </p>
                </div>
                <div className="flex gap-1 ml-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    disabled={loading === intv.id}
                    onClick={() => respond(intv.id, "feedback", "helpful", 5)}
                  >
                    <ThumbsUp className="h-4 w-4 text-green-500" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    disabled={loading === intv.id}
                    onClick={() => respond(intv.id, "feedback", "unhelpful", 2)}
                  >
                    <ThumbsDown className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    medium:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[priority] || colors.low}`}
    >
      {priority === "critical" && <AlertTriangle className="h-3 w-3" />}
      {priority}
    </span>
  );
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min temu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h temu`;
  const days = Math.floor(hours / 24);
  return `${days}d temu`;
}
