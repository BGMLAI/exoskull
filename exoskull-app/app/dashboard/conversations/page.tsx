"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Phone,
  Mail,
  Globe,
  Loader2,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Smartphone,
  Send,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface Conversation {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  insights: string[] | null;
  message_count: number;
  user_messages: number;
  agent_messages: number;
  context: Record<string, unknown>;
}

interface Message {
  id: string;
  role: string;
  content: string;
  timestamp: string;
  context: Record<string, unknown>;
}

interface UnifiedMessage {
  id: string;
  role: string;
  content: string;
  channel: string;
  direction: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CHANNEL_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  voice: {
    label: "Glos",
    icon: <Phone className="w-3 h-3" />,
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  sms: {
    label: "SMS",
    icon: <Smartphone className="w-3 h-3" />,
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  email: {
    label: "Email",
    icon: <Mail className="w-3 h-3" />,
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  },
  web_chat: {
    label: "Web",
    icon: <Globe className="w-3 h-3" />,
    color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: <MessageCircle className="w-3 h-3" />,
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  messenger: {
    label: "Messenger",
    icon: <Send className="w-3 h-3" />,
    color:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [unifiedMessages, setUnifiedMessages] = useState<UnifiedMessage[]>([]);
  const [channelCounts, setChannelCounts] = useState<Record<string, number>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"conversations" | "unified">("conversations");
  const [channelFilter, setChannelFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // --------------------------------------------------------------------------
  // DATA FETCHING
  // --------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      const [convoRes, unifiedRes] = await Promise.all([
        fetch("/api/conversations?limit=50"),
        fetch(
          `/api/unified-thread?limit=50${channelFilter !== "all" ? `&channel=${channelFilter}` : ""}`,
        ),
      ]);

      if (convoRes.ok) {
        const data = await convoRes.json();
        setConversations(data.conversations || []);
      }
      if (unifiedRes.ok) {
        const data = await unifiedRes.json();
        setUnifiedMessages(data.messages || []);
        setChannelCounts(data.channelCounts || {});
      }
    } catch (error) {
      console.error("[ConversationsPage] Fetch error:", {
        error: error instanceof Error ? error.message : error,
      });
    } finally {
      setLoading(false);
    }
  }, [channelFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchMessages = async (conversationId: string) => {
    if (expandedId === conversationId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(conversationId);
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("[ConversationsPage] Messages fetch error:", {
        error: error instanceof Error ? error.message : error,
      });
    } finally {
      setLoadingMessages(false);
    }
  };

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="w-7 h-7" />
          Rozmowy
        </h1>
        <p className="text-muted-foreground">
          Historia rozmow z IORS i wszystkie wiadomosci
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={tab === "conversations" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("conversations")}
        >
          Rozmowy z IORS ({conversations.length})
        </Button>
        <Button
          variant={tab === "unified" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("unified")}
        >
          Wszystkie wiadomosci ({unifiedMessages.length})
        </Button>
      </div>

      {/* Channel Filter (unified tab) */}
      {tab === "unified" && (
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Kanal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie kanaly</SelectItem>
            {Object.entries(channelCounts).map(([ch, count]) => (
              <SelectItem key={ch} value={ch}>
                {CHANNEL_CONFIG[ch]?.label || ch} ({count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* CONVERSATIONS TAB */}
      {tab === "conversations" && (
        <div className="space-y-2">
          {conversations.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Brak rozmow</h3>
                <p className="text-muted-foreground">
                  Rozmowy z IORS pojawia sie tutaj
                </p>
              </CardContent>
            </Card>
          ) : (
            conversations.map((convo) => (
              <Card
                key={convo.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
              >
                <CardContent className="p-4">
                  <div
                    className="flex items-center justify-between"
                    onClick={() => fetchMessages(convo.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm">
                          {new Date(convo.started_at).toLocaleDateString(
                            "pl-PL",
                            {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </h4>
                        <Badge variant="secondary" className="text-xs">
                          {convo.message_count} msg
                        </Badge>
                        {convo.duration_seconds && (
                          <span className="text-xs text-muted-foreground">
                            {Math.floor(convo.duration_seconds / 60)}min
                          </span>
                        )}
                      </div>
                      {convo.summary && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {convo.summary}
                        </p>
                      )}
                    </div>
                    {expandedId === convo.id ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>

                  {/* Expanded Messages */}
                  {expandedId === convo.id && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      {/* Insights */}
                      {convo.insights && convo.insights.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {convo.insights.map((ins, i) => (
                            <Badge
                              key={i}
                              variant="outline"
                              className="text-xs"
                            >
                              {ins}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {loadingMessages ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : messages.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Brak wiadomosci
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                          {messages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`p-3 rounded-lg text-sm ${
                                msg.role === "user"
                                  ? "bg-blue-50 dark:bg-blue-900/20 ml-8"
                                  : msg.role === "assistant"
                                    ? "bg-muted mr-8"
                                    : "bg-yellow-50 dark:bg-yellow-900/20 text-xs italic"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-xs">
                                  {msg.role === "user"
                                    ? "Ty"
                                    : msg.role === "assistant"
                                      ? "IORS"
                                      : "System"}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(msg.timestamp).toLocaleTimeString(
                                    "pl-PL",
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
                                </span>
                              </div>
                              <p>{msg.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* UNIFIED TAB */}
      {tab === "unified" && (
        <div className="space-y-2">
          {unifiedMessages.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Brak wiadomosci</h3>
                <p className="text-muted-foreground">
                  Wiadomosci ze wszystkich kanalow pojawia sie tutaj
                </p>
              </CardContent>
            </Card>
          ) : (
            unifiedMessages.map((msg) => {
              const chCfg = CHANNEL_CONFIG[msg.channel] || {
                label: msg.channel,
                icon: <MessageSquare className="w-3 h-3" />,
                color: "bg-gray-100 text-gray-800",
              };
              return (
                <Card key={msg.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant="outline"
                            className={`border-0 text-xs ${chCfg.color}`}
                          >
                            {chCfg.icon}
                            <span className="ml-1">{chCfg.label}</span>
                          </Badge>
                          <span className="text-xs font-medium">
                            {msg.role === "user" ? "Ty" : "IORS"}
                          </span>
                          {msg.direction && (
                            <span className="text-xs text-muted-foreground">
                              {msg.direction === "inbound"
                                ? "przychodzaca"
                                : "wychodzaca"}
                            </span>
                          )}
                        </div>
                        <p className="text-sm line-clamp-2">{msg.content}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(msg.created_at).toLocaleString("pl-PL", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
