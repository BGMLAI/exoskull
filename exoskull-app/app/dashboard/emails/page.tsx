"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Mail,
  Search,
  RefreshCw,
  ChevronLeft,
  Send,
  Star,
  Clock,
  AlertCircle,
  Inbox,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface Email {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_email: string;
  to_emails: string[];
  date_received: string;
  category: string | null;
  priority: string;
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
  is_read: boolean;
  follow_up_needed: boolean;
  follow_up_by: string | null;
  direction: string;
  has_attachments: boolean;
  attachment_names: string[];
  action_items: Array<{ text: string; due_date?: string }>;
  key_facts: Array<{ fact: string }>;
  sentiment: string | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function EmailsPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setTenantId(user.id);
        fetchEmails(user.id);
      }
    });
  }, []);

  const fetchEmails = useCallback(
    async (tid?: string) => {
      const id = tid || tenantId;
      if (!id) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({ tenantId: id, limit: "50" });
        if (searchQuery) params.set("query", searchQuery);
        if (categoryFilter !== "all") params.set("category", categoryFilter);

        const res = await fetch(`/api/emails?${params}`);
        if (!res.ok) throw new Error("Failed to fetch emails");
        const data = await res.json();
        setEmails(data.emails || []);
      } catch {
        toast.error("Nie udalo sie zaladowac emaili");
      } finally {
        setLoading(false);
      }
    },
    [tenantId, searchQuery, categoryFilter],
  );

  const handleReply = async () => {
    if (!selectedEmail || !replyText.trim() || !tenantId) return;
    setSendingReply(true);
    try {
      // Send reply via chat stream — IORS will compose and send
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Odpowiedz na email od ${selectedEmail.from_name || selectedEmail.from_email} (temat: "${selectedEmail.subject}"). Tresc odpowiedzi: ${replyText}`,
          channel: "web_chat",
        }),
      });
      if (res.ok) {
        toast.success("Odpowiedz wyslana przez IORS");
        setReplyText("");
      }
    } catch {
      toast.error("Blad wysylania odpowiedzi");
    } finally {
      setSendingReply(false);
    }
  };

  const categories = [
    "all",
    "work",
    "personal",
    "finance",
    "newsletter",
    "notification",
    "health",
    "social",
  ];
  const priorityColors: Record<string, string> = {
    urgent: "text-red-500 bg-red-500/10",
    high: "text-orange-500 bg-orange-500/10",
    normal: "text-blue-500 bg-blue-500/10",
    low: "text-gray-500 bg-gray-500/10",
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selectedEmail ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedEmail(null)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Powrot
            </Button>
          ) : (
            <>
              <Mail className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-semibold">Skrzynka</h1>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!selectedEmail && (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchEmails()}
                  placeholder="Szukaj emaili..."
                  className="pl-8 pr-3 py-2 text-sm rounded-md border bg-background w-48 focus:w-64 transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => fetchEmails()}>
                <RefreshCw
                  className={cn("w-4 h-4", loading && "animate-spin")}
                />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Category filter */}
      {!selectedEmail && (
        <div className="border-b px-4 py-2 flex gap-1 overflow-x-auto">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={categoryFilter === cat ? "default" : "ghost"}
              size="sm"
              className="text-xs whitespace-nowrap"
              onClick={() => {
                setCategoryFilter(cat);
                fetchEmails();
              }}
            >
              {cat === "all" ? "Wszystkie" : cat}
            </Button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {selectedEmail ? (
          /* Email detail view */
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Subject + meta */}
              <div>
                <h2 className="text-xl font-semibold">
                  {selectedEmail.subject || "(brak tematu)"}
                </h2>
                <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {selectedEmail.from_name || selectedEmail.from_email}
                  </span>
                  <span>&lt;{selectedEmail.from_email}&gt;</span>
                  <span>
                    {new Date(selectedEmail.date_received).toLocaleString(
                      "pl-PL",
                    )}
                  </span>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-xs",
                      priorityColors[selectedEmail.priority] || "",
                    )}
                  >
                    {selectedEmail.priority}
                  </span>
                </div>
                {selectedEmail.to_emails?.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Do: {selectedEmail.to_emails.join(", ")}
                  </div>
                )}
              </div>

              {/* AI Analysis */}
              {(selectedEmail.action_items?.length > 0 ||
                selectedEmail.key_facts?.length > 0) && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Star className="w-3 h-3" /> Analiza AI
                  </div>
                  {selectedEmail.action_items?.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>
                        {item.text}
                        {item.due_date ? ` (do: ${item.due_date})` : ""}
                      </span>
                    </div>
                  ))}
                  {selectedEmail.key_facts?.map((fact, i) => (
                    <div key={i} className="text-sm text-muted-foreground">
                      - {fact.fact}
                    </div>
                  ))}
                </div>
              )}

              {/* Follow-up alert */}
              {selectedEmail.follow_up_needed && (
                <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-sm">
                    Follow-up wymagany
                    {selectedEmail.follow_up_by
                      ? ` do ${new Date(selectedEmail.follow_up_by).toLocaleDateString("pl-PL")}`
                      : ""}
                  </span>
                </div>
              )}

              {/* Email body */}
              <div className="prose dark:prose-invert prose-sm max-w-none">
                {selectedEmail.body_html ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: selectedEmail.body_html,
                    }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {selectedEmail.body_text || "(brak tresci)"}
                  </pre>
                )}
              </div>

              {/* Attachments */}
              {selectedEmail.has_attachments &&
                selectedEmail.attachment_names?.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">
                      Zalaczniki ({selectedEmail.attachment_names.length}):
                    </div>
                    {selectedEmail.attachment_names.map((name, i) => (
                      <div
                        key={i}
                        className="text-sm px-3 py-1.5 rounded bg-muted/50 inline-block mr-2"
                      >
                        {name}
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* Reply bar */}
            <div className="border-t p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleReply()}
                  placeholder="Napisz odpowiedz (IORS wysle w Twoim imieniu)..."
                  className="flex-1 px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <Button
                  onClick={handleReply}
                  disabled={!replyText.trim() || sendingReply}
                  size="sm"
                >
                  <Send className="w-4 h-4 mr-1" />
                  {sendingReply ? "Wysylanie..." : "Odpowiedz"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                IORS napisze odpowiedz w Twoim tonie i wysle przez email.
              </p>
            </div>
          </div>
        ) : (
          /* Email list */
          <div className="h-full overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <Inbox className="w-8 h-8 mb-2" />
                <p className="text-sm">Brak emaili</p>
              </div>
            ) : (
              emails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors flex items-start gap-3",
                    !email.is_read && "bg-primary/5",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm font-medium truncate",
                          !email.is_read && "font-bold",
                        )}
                      >
                        {email.from_name || email.from_email}
                      </span>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px]",
                          priorityColors[email.priority] || "",
                        )}
                      >
                        {email.priority === "urgent" ? "PILNE" : email.priority}
                      </span>
                      {email.follow_up_needed && (
                        <Clock className="w-3 h-3 text-amber-500" />
                      )}
                      {email.has_attachments && (
                        <Mail className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="text-sm truncate">
                      {email.subject || "(brak tematu)"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {email.snippet?.slice(0, 100)}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(email.date_received).toLocaleDateString("pl-PL")}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
