"use client";

import { Mail, AlertTriangle, Clock, ArrowUpRight } from "lucide-react";

export interface EmailWidgetData {
  summary: {
    unread: number;
    urgent: number;
    needsReply: number;
    overdueFollowUps: number;
    todayReceived: number;
  };
  urgentEmails: {
    id: string;
    subject: string;
    from_name: string | null;
    from_email: string;
    date_received: string;
    priority: string;
  }[];
  overdueEmails: {
    id: string;
    subject: string;
    from_name: string | null;
    from_email: string;
    follow_up_by: string;
  }[];
  connectedAccounts: number;
}

export function EmailAnalyticsWidget({ data }: { data: EmailWidgetData }) {
  const { summary, urgentEmails, overdueEmails } = data;

  return (
    <div className="flex flex-col h-full gap-3 text-sm">
      {/* Header stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatBadge
          icon={<Mail className="w-3.5 h-3.5" />}
          value={summary.unread}
          label="Nieprzeczytane"
          variant="default"
        />
        <StatBadge
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          value={summary.urgent}
          label="Pilne"
          variant={summary.urgent > 0 ? "danger" : "default"}
        />
        <StatBadge
          icon={<Clock className="w-3.5 h-3.5" />}
          value={summary.overdueFollowUps}
          label="Zaległe"
          variant={summary.overdueFollowUps > 0 ? "warning" : "default"}
        />
      </div>

      {/* Urgent emails */}
      {urgentEmails.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
            Pilne
          </h4>
          <div className="space-y-1.5">
            {urgentEmails.slice(0, 3).map((email) => (
              <EmailRow key={email.id} email={email} variant="urgent" />
            ))}
          </div>
        </div>
      )}

      {/* Overdue follow-ups */}
      {overdueEmails.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
            Czekaja na odpowiedz
          </h4>
          <div className="space-y-1.5">
            {overdueEmails.slice(0, 3).map((email) => (
              <EmailRow key={email.id} email={email} variant="overdue" />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {urgentEmails.length === 0 && overdueEmails.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
          {data.connectedAccounts === 0
            ? "Polacz skrzynke mailowa w Ustawieniach"
            : "Brak pilnych emaili. Wszystko ogarniete!"}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto pt-1 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <span>Dzis: +{summary.todayReceived} emaili</span>
        <span>{data.connectedAccounts} kont</span>
      </div>
    </div>
  );
}

function StatBadge({
  icon,
  value,
  label,
  variant,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  variant: "default" | "danger" | "warning";
}) {
  const colors = {
    default: "bg-muted text-foreground",
    danger: "bg-red-500/10 text-red-500",
    warning: "bg-amber-500/10 text-amber-500",
  };

  return (
    <div
      className={`rounded-lg p-2 flex flex-col items-center gap-0.5 ${colors[variant]}`}
    >
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-lg font-semibold">{value}</span>
      </div>
      <span className="text-[10px] opacity-70">{label}</span>
    </div>
  );
}

function EmailRow({
  email,
  variant,
}: {
  email: {
    subject: string | null;
    from_name: string | null;
    from_email: string;
    date_received?: string;
    follow_up_by?: string;
  };
  variant: "urgent" | "overdue";
}) {
  const sender = email.from_name || email.from_email.split("@")[0];
  const dateStr = email.date_received
    ? formatRelative(email.date_received)
    : email.follow_up_by
      ? `do ${formatRelative(email.follow_up_by)}`
      : "";

  return (
    <div
      className={`rounded-md px-2.5 py-1.5 flex items-start gap-2 ${
        variant === "urgent"
          ? "bg-red-500/5 border border-red-500/10"
          : "bg-amber-500/5 border border-amber-500/10"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">
          {email.subject || "(brak tematu)"}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {sender} · {dateStr}
        </p>
      </div>
      <ArrowUpRight className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
    </div>
  );
}

function formatRelative(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / 3600_000);
  const diffDays = Math.floor(diffMs / 86400_000);

  if (diffHours < 0) {
    // Future date (for follow_up_by)
    const futureDays = Math.ceil(-diffMs / 86400_000);
    if (futureDays === 0) return "dzis";
    if (futureDays === 1) return "jutro";
    return `za ${futureDays}d`;
  }

  if (diffHours < 1) return "teraz";
  if (diffHours < 24) return `${diffHours}h temu`;
  if (diffDays === 1) return "wczoraj";
  return `${diffDays}d temu`;
}
