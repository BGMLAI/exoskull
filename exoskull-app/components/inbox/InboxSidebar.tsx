"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  MessageSquare,
  Phone,
  MessageCircle,
  Inbox,
  RefreshCw,
  Filter,
} from "lucide-react";
import { MessageListItem } from "./MessageListItem";
import type { UnifiedMessage } from "./types";

export type { UnifiedMessage };

interface InboxSidebarProps {
  selectedId?: string;
  onSelectMessage: (message: UnifiedMessage) => void;
}

type FilterType = "all" | "unread" | "email" | "sms" | "voice" | "web_chat";

const FILTER_CONFIG: Record<
  FilterType,
  { label: string; icon: React.ReactNode }
> = {
  all: { label: "Wszystkie", icon: <Inbox className="h-4 w-4" /> },
  unread: { label: "Nieprzeczytane", icon: <Filter className="h-4 w-4" /> },
  email: { label: "Email", icon: <Mail className="h-4 w-4" /> },
  sms: { label: "SMS", icon: <MessageSquare className="h-4 w-4" /> },
  voice: { label: "Telefon", icon: <Phone className="h-4 w-4" /> },
  web_chat: { label: "Chat", icon: <MessageCircle className="h-4 w-4" /> },
};

export function InboxSidebar({
  selectedId,
  onSelectMessage,
}: InboxSidebarProps) {
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [channelCounts, setChannelCounts] = useState<Record<string, number>>(
    {},
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");

      if (activeFilter === "unread") {
        params.set("unread", "true");
      } else if (activeFilter !== "all") {
        params.set("channel", activeFilter);
      }

      const response = await fetch(`/api/unified-thread?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        setChannelCounts(data.channelCounts || {});
        setUnreadCount(data.unreadCount || 0);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error("[InboxSidebar] Fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const getFilterCount = (filter: FilterType): number => {
    if (filter === "all") return total;
    if (filter === "unread") return unreadCount;
    return channelCounts[filter] || 0;
  };

  return (
    <div className="flex flex-col h-full border-r bg-background">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold text-lg">Wiadomosci</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchMessages}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Filters */}
      <div className="p-2 border-b space-y-1">
        {(Object.keys(FILTER_CONFIG) as FilterType[]).map((filter) => {
          const count = getFilterCount(filter);
          const isActive = activeFilter === filter;

          return (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-2">
                {FILTER_CONFIG[filter].icon}
                {FILTER_CONFIG[filter].label}
              </span>
              {count > 0 && (
                <Badge
                  variant={isActive ? "secondary" : "outline"}
                  className="ml-auto"
                >
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="flex gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Brak wiadomosci</p>
          </div>
        ) : (
          <div className="divide-y">
            {messages.map((message) => (
              <MessageListItem
                key={message.id}
                message={message}
                isSelected={message.id === selectedId}
                onClick={() => onSelectMessage(message)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
