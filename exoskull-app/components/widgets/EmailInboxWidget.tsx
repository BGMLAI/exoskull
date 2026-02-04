"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, RefreshCw, Inbox } from "lucide-react";
import { useEffect, useState, useCallback } from "react";

interface Email {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  labelIds: string[];
}

interface EmailInboxWidgetProps {
  tenantId: string | null;
  rigSlug: string;
  isConnected: boolean;
}

function parseFromField(from: string): { name: string; email: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match)
    return { name: match[1].replace(/"/g, "").trim(), email: match[2] };
  return { name: from, email: from };
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 1) return "teraz";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

export function EmailInboxWidget({
  tenantId,
  rigSlug,
  isConnected,
}: EmailInboxWidgetProps) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const fetchEmails = useCallback(async () => {
    if (!tenantId || !isConnected) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/rigs/${rigSlug}/emails?max=10`, {
        headers: { "x-tenant-id": tenantId },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setEmails(data.emails || []);
      setUnreadCount(data.unreadCount || 0);
      setFetched(true);
    } catch (err) {
      console.error("[EmailInboxWidget] Fetch failed:", err);
      setError(
        err instanceof Error ? err.message : "Nie udalo sie pobrac maili",
      );
    } finally {
      setLoading(false);
    }
  }, [tenantId, rigSlug, isConnected]);

  // Auto-fetch on mount if connected
  useEffect(() => {
    if (isConnected && !fetched) {
      fetchEmails();
    }
  }, [isConnected, fetched, fetchEmails]);

  if (!isConnected) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Skrzynka odbiorcza
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                {unreadCount}
              </span>
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchEmails}
            disabled={loading}
            className="h-8 px-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && !fetched && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex gap-3">
                <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        {fetched && emails.length === 0 && !error && (
          <div className="text-center py-6 text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Brak maili</p>
          </div>
        )}

        {emails.length > 0 && (
          <div className="space-y-1">
            {emails.map((email) => {
              const sender = parseFromField(email.from);
              const isUnread = email.labelIds?.includes("UNREAD");

              return (
                <div
                  key={email.id}
                  className={`p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-default ${
                    isUnread ? "bg-blue-50/50 dark:bg-blue-950/30" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-sm truncate ${isUnread ? "font-semibold" : "font-medium"}`}
                        >
                          {sender.name}
                        </p>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatDate(email.date)}
                        </span>
                      </div>
                      <p
                        className={`text-sm truncate ${isUnread ? "font-medium" : "text-muted-foreground"}`}
                      >
                        {email.subject || "(brak tematu)"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {email.snippet}
                      </p>
                    </div>
                    {isUnread && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
