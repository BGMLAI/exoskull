"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Lightbulb,
  AlertTriangle,
  TrendingDown,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
} from "lucide-react";

interface InsightItem {
  id: string;
  insight_summary: string;
  delivery_channel: string;
  delivered_at: string;
  source_type: "intervention" | "highlight" | "learning" | "unknown";
}

interface InsightHistoryWidgetProps {
  insights: InsightItem[];
}

export function InsightHistoryWidget({
  insights: initialInsights,
}: InsightHistoryWidgetProps) {
  const [insights] = useState(initialInsights);
  const [rated, setRated] = useState<Set<string>>(new Set());

  const giveFeedback = useCallback(
    async (insightId: string, isPositive: boolean) => {
      try {
        // Log feedback via general feedback endpoint
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feedback_type: "action",
            rating: isPositive ? 5 : 2,
            context: { insight_delivery_id: insightId },
            channel: "dashboard",
          }),
        }).catch(() => {
          // Fallback: silently fail
        });
        setRated((prev) => new Set(prev).add(insightId));
      } catch {
        // Silently handle
      }
    },
    [],
  );

  return (
    <Card className="h-full overflow-auto">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Lightbulb className="h-5 w-5" />
          Historia insightow
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
            <Lightbulb className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">Brak insightow</p>
            <p className="text-xs">
              IORS bedzie tu wyswietlac proaktywne spostrzezenia
            </p>
          </div>
        ) : (
          insights.map((insight) => (
            <div
              key={insight.id}
              className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <SourceIcon sourceType={insight.source_type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug">
                  {insight.insight_summary}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(insight.delivered_at)}
                  </span>
                  <ChannelBadge channel={insight.delivery_channel} />
                </div>
              </div>

              {/* Feedback buttons */}
              {!rated.has(insight.id) ? (
                <div className="flex gap-0.5 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => giveFeedback(insight.id, true)}
                    title="Pomocne"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => giveFeedback(insight.id, false)}
                    title="Niepomocne"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-green-500 shrink-0">
                  Ocenione
                </span>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SourceIcon({
  sourceType,
}: {
  sourceType: InsightItem["source_type"];
}) {
  switch (sourceType) {
    case "intervention":
      return (
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      );
    case "highlight":
      return <Lightbulb className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />;
    case "learning":
      return <TrendingDown className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />;
    default:
      return (
        <MessageSquare className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
      );
  }
}

function ChannelBadge({ channel }: { channel: string }) {
  const labels: Record<string, string> = {
    sms: "SMS",
    voice: "Rozmowa",
    whatsapp: "WhatsApp",
    email: "Email",
    telegram: "Telegram",
    slack: "Slack",
    discord: "Discord",
    web_chat: "Chat",
  };
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
      {labels[channel] || channel}
    </Badge>
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
