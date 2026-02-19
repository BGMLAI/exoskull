"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Ban,
  Loader2,
} from "lucide-react";
import type { AutonomyData } from "./useAutonomyData";
import type { InterventionUI } from "./types";
import { STATUS_CONFIG, PRIORITY_CONFIG, INTERVENTION_TYPES } from "./types";

interface Props {
  data: AutonomyData;
}

type FilterStatus = "all" | "completed" | "failed" | "rejected";

export function InterventionsTab({ data }: Props) {
  const {
    pending,
    interventions,
    approveIntervention,
    rejectIntervention,
    sendFeedback,
  } = data;

  const [filter, setFilter] = useState<FilterStatus>("all");
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>(
    {},
  );
  const [feedbackNotes, setFeedbackNotes] = useState<Record<string, string>>(
    {},
  );
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);

  const executing = interventions.filter(
    (i) => i.status === "executing" || i.status === "approved",
  );

  const history = interventions.filter((i) =>
    filter === "all"
      ? !["proposed", "approved", "executing"].includes(i.status)
      : i.status === filter,
  );

  const handleReject = async (id: string) => {
    await rejectIntervention(id, rejectReasons[id]);
    setRejectReasons((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleFeedback = async (id: string, feedback: string) => {
    await sendFeedback(id, feedback, feedbackNotes[id]);
    setExpandedFeedback(null);
    setFeedbackNotes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Pending Section */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Oczekujace na decyzje ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map((item) => (
              <PendingCard
                key={item.id}
                item={item}
                rejectReason={rejectReasons[item.id] || ""}
                onRejectReasonChange={(v) =>
                  setRejectReasons((p) => ({ ...p, [item.id]: v }))
                }
                onApprove={() => approveIntervention(item.id)}
                onReject={() => handleReject(item.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Executing Section */}
      {executing.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />W trakcie
            ({executing.length})
          </h2>
          <div className="space-y-2">
            {executing.map((item) => (
              <Card
                key={item.id}
                className="border-blue-200 dark:border-blue-800"
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {INTERVENTION_TYPES[item.intervention_type] ||
                          item.intervention_type}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-0 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                    >
                      {item.status === "approved" ? "W kolejce" : "Wykonywane"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* History Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Historia</h2>
          <div className="flex gap-1">
            {(["all", "completed", "failed", "rejected"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "ghost"}
                onClick={() => setFilter(f)}
                className="text-xs"
              >
                {f === "all" && "Wszystkie"}
                {f === "completed" && "Wykonane"}
                {f === "failed" && "Nieudane"}
                {f === "rejected" && "Odrzucone"}
              </Button>
            ))}
          </div>
        </div>

        {history.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Brak historii</h3>
              <p className="text-muted-foreground">
                Dzialania autonomiczne pojawia sie tutaj
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <HistoryCard
                key={item.id}
                item={item}
                expandedFeedback={expandedFeedback}
                feedbackNotes={feedbackNotes[item.id] || ""}
                onExpandFeedback={setExpandedFeedback}
                onFeedbackNotesChange={(v) =>
                  setFeedbackNotes((p) => ({ ...p, [item.id]: v }))
                }
                onFeedback={(fb) => handleFeedback(item.id, fb)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Pending Card
// ============================================================================

function PendingCard({
  item,
  rejectReason,
  onRejectReasonChange,
  onApprove,
  onReject,
}: {
  item: InterventionUI;
  rejectReason: string;
  onRejectReasonChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [showReject, setShowReject] = useState(false);

  return (
    <Card className="border-yellow-200 dark:border-yellow-800">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-medium">{item.title}</h3>
              <Badge variant="outline" className="border-0 text-xs bg-muted">
                {INTERVENTION_TYPES[item.intervention_type] ||
                  item.intervention_type}
              </Badge>
              <Badge
                variant="outline"
                className={`border-0 text-xs ${PRIORITY_CONFIG[item.priority]?.color || ""}`}
              >
                {PRIORITY_CONFIG[item.priority]?.label || item.priority}
              </Badge>
              {item.urgency_score > 0 && (
                <span className="text-xs text-muted-foreground">
                  Pilnosc: {item.urgency_score}/10
                </span>
              )}
            </div>
            {item.description && (
              <p className="text-sm text-muted-foreground">
                {item.description}
              </p>
            )}
            {item.source_agent && (
              <p className="text-xs text-muted-foreground mt-1">
                Zrodlo: {item.source_agent}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button size="sm" onClick={onApprove}>
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Zatwierdz
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowReject(!showReject)}
            >
              <XCircle className="w-4 h-4 mr-1" />
              Odrzuc
            </Button>
          </div>
        </div>
        {showReject && (
          <div className="mt-3 flex gap-2">
            <Textarea
              placeholder="Powod odrzucenia (opcjonalnie)"
              value={rejectReason}
              onChange={(e) => onRejectReasonChange(e.target.value)}
              className="text-sm h-16"
            />
            <Button size="sm" variant="destructive" onClick={onReject}>
              Odrzuc
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// History Card
// ============================================================================

function HistoryCard({
  item,
  expandedFeedback,
  feedbackNotes,
  onExpandFeedback,
  onFeedbackNotesChange,
  onFeedback,
}: {
  item: InterventionUI;
  expandedFeedback: string | null;
  feedbackNotes: string;
  onExpandFeedback: (id: string | null) => void;
  onFeedbackNotesChange: (v: string) => void;
  onFeedback: (fb: string) => void;
}) {
  const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.completed;
  const isExpanded = expandedFeedback === item.id;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-sm">{item.title}</h4>
              <Badge
                variant="outline"
                className={`border-0 text-xs ${statusCfg.color}`}
              >
                {statusCfg.label}
              </Badge>
            </div>
            {item.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {item.description}
              </p>
            )}
            {item.execution_error && (
              <p className="text-xs text-red-500 mt-1">
                {item.execution_error}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(item.created_at).toLocaleString("pl-PL", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          {/* Feedback */}
          {item.status === "completed" && !item.user_feedback && (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onFeedback("helpful")}
                title="Pomocne"
              >
                <ThumbsUp className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onExpandFeedback(isExpanded ? null : item.id)}
                title="Wiecej opcji"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onFeedback("unhelpful")}
                title="Niepomocne"
              >
                <ThumbsDown className="w-4 h-4" />
              </Button>
            </div>
          )}
          {item.user_feedback && (
            <Badge
              variant="outline"
              className={`border-0 text-xs ${
                item.user_feedback === "helpful"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : item.user_feedback === "harmful"
                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {item.user_feedback === "helpful" && "👍 Pomocne"}
              {item.user_feedback === "neutral" && "😐 Neutralne"}
              {item.user_feedback === "unhelpful" && "👎 Niepomocne"}
              {item.user_feedback === "harmful" && "⛔ Szkodliwe"}
            </Badge>
          )}
        </div>

        {/* Expanded feedback */}
        {isExpanded && (
          <div className="mt-3 space-y-2 border-t pt-3">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onFeedback("helpful")}
              >
                <ThumbsUp className="w-3 h-3 mr-1" /> Pomocne
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onFeedback("neutral")}
              >
                <Minus className="w-3 h-3 mr-1" /> Neutralne
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onFeedback("unhelpful")}
              >
                <ThumbsDown className="w-3 h-3 mr-1" /> Niepomocne
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onFeedback("harmful")}
              >
                <Ban className="w-3 h-3 mr-1" /> Szkodliwe
              </Button>
            </div>
            <Textarea
              placeholder="Dodatkowe uwagi (opcjonalnie)"
              value={feedbackNotes}
              onChange={(e) => onFeedbackNotesChange(e.target.value)}
              className="text-sm h-16"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
