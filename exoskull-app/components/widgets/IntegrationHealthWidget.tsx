"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle, AlertTriangle, XCircle } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

export interface IntegrationHealthItem {
  integration_type: string;
  status: "healthy" | "degraded" | "down";
  circuit_state: "closed" | "open" | "half_open";
  consecutive_failures: number;
  error_count_24h: number;
  last_check_at: string | null;
  last_success_at: string | null;
  last_error_message: string | null;
}

interface IntegrationHealthWidgetProps {
  integrations: IntegrationHealthItem[];
}

// ============================================================================
// HELPERS
// ============================================================================

const INTEGRATION_LABELS: Record<string, { name: string; icon: string }> = {
  gmail: { name: "Gmail", icon: "mail" },
  outlook: { name: "Outlook", icon: "mail" },
  google_fit: { name: "Google Fit", icon: "heart" },
  google_drive: { name: "Google Drive", icon: "hard-drive" },
  google_calendar: { name: "Google Calendar", icon: "calendar" },
  twilio: { name: "Twilio (Voice)", icon: "phone" },
  elevenlabs: { name: "ElevenLabs (TTS)", icon: "mic" },
  openai: { name: "OpenAI", icon: "brain" },
  anthropic: { name: "Anthropic", icon: "brain" },
  google_gemini: { name: "Gemini", icon: "sparkles" },
  supabase: { name: "Supabase", icon: "database" },
  tavily: { name: "Tavily (Search)", icon: "search" },
  firecrawl: { name: "Firecrawl", icon: "globe" },
};

function getIntegrationLabel(type: string): string {
  return (
    INTEGRATION_LABELS[type]?.name ||
    type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function formatLastCheck(dateStr: string | null): string {
  if (!dateStr) return "Nigdy";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 1) return "Przed chwila";
  if (diffMins < 60) return `${diffMins} min temu`;
  if (diffHours < 24) return `${diffHours}h temu`;
  return `${Math.floor(diffHours / 24)}d temu`;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "healthy":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "degraded":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case "down":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Activity className="h-4 w-4 text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    degraded:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    down: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  const labels: Record<string, string> = {
    healthy: "OK",
    degraded: "Degraded",
    down: "Down",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-800"}`}
    >
      {labels[status] || status}
    </span>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function IntegrationHealthWidget({
  integrations,
}: IntegrationHealthWidgetProps) {
  const healthyCount = integrations.filter(
    (i) => i.status === "healthy",
  ).length;
  const degradedCount = integrations.filter(
    (i) => i.status === "degraded",
  ).length;
  const downCount = integrations.filter((i) => i.status === "down").length;
  const totalCount = integrations.length;

  // Sort: down first, then degraded, then healthy
  const sorted = [...integrations].sort((a, b) => {
    const order: Record<string, number> = { down: 0, degraded: 1, healthy: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  if (totalCount === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Zdrowie integracji
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Brak danych o integracjach. Dane pojawia sie po pierwszym uzyciu.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Zdrowie integracji
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            {healthyCount}/{totalCount}
            {downCount > 0 && (
              <span className="text-red-500 ml-1">({downCount} down)</span>
            )}
            {degradedCount > 0 && downCount === 0 && (
              <span className="text-yellow-500 ml-1">
                ({degradedCount} degraded)
              </span>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map((integration) => (
          <div
            key={integration.integration_type}
            className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <StatusIcon status={integration.status} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {getIntegrationLabel(integration.integration_type)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {integration.status === "down" &&
                  integration.last_error_message
                    ? integration.last_error_message.slice(0, 60)
                    : `Sprawdzono: ${formatLastCheck(integration.last_check_at)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {integration.error_count_24h > 0 && (
                <span className="text-xs text-muted-foreground">
                  {integration.error_count_24h} err/24h
                </span>
              )}
              <StatusBadge status={integration.status} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
