"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Brain,
  Search,
  Calendar,
  MessageSquare,
  Loader2,
  ChevronDown,
  ChevronUp,
  Star,
  Target,
  Lightbulb,
  Heart,
  Users,
  TrendingUp,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface TimelineSummary {
  date: string;
  summary: string;
  mood_score: number | null;
  energy_score: number | null;
  message_count: number;
  reviewed: boolean;
  key_events?: Array<{
    event: string;
    sentiment: string;
    importance: number;
  }>;
  key_topics?: string[];
  tasks_created?: number;
  tasks_completed?: number;
}

interface SearchResultItem {
  type: "message" | "summary" | "highlight";
  content: string;
  score: number;
  date: string;
  metadata?: {
    channel?: string;
    role?: string;
    category?: string;
    mood_score?: number;
  };
}

interface Highlight {
  id: string;
  category: string;
  content: string;
  importance: number;
  source: string;
  created_at: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MOOD_EMOJI: Record<number, string> = {
  1: "😢",
  2: "😞",
  3: "😕",
  4: "😐",
  5: "🙂",
  6: "😊",
  7: "😄",
  8: "😁",
  9: "🤩",
  10: "🥳",
};

const HIGHLIGHT_ICONS: Record<string, React.ReactNode> = {
  preference: <Star className="w-4 h-4 text-yellow-500" />,
  pattern: <TrendingUp className="w-4 h-4 text-blue-500" />,
  goal: <Target className="w-4 h-4 text-green-500" />,
  insight: <Lightbulb className="w-4 h-4 text-purple-500" />,
  relationship: <Users className="w-4 h-4 text-pink-500" />,
};

const HIGHLIGHT_LABELS: Record<string, string> = {
  preference: "Preferencja",
  pattern: "Wzorzec",
  goal: "Cel",
  insight: "Insight",
  relationship: "Relacja",
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function MemoryPage() {
  const [summaries, setSummaries] = useState<TimelineSummary[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalSummaries, setTotalSummaries] = useState(0);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "timeline" | "search" | "highlights"
  >("timeline");

  const PAGE_SIZE = 10;

  // --------------------------------------------------------------------------
  // DATA FETCHING
  // --------------------------------------------------------------------------

  const fetchTimeline = useCallback(async (pageNum: number) => {
    try {
      const res = await fetch(
        `/api/memory?type=timeline&page=${pageNum}&pageSize=${PAGE_SIZE}`,
      );
      if (res.ok) {
        const data = await res.json();
        setSummaries(data.summaries || []);
        setTotalSummaries(data.total || 0);
      }
    } catch (error) {
      console.error("[MemoryPage] Timeline fetch error:", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }, []);

  const fetchHighlights = useCallback(async () => {
    try {
      const res = await fetch(`/api/memory?type=highlights&limit=30`);
      if (res.ok) {
        const data = await res.json();
        setHighlights(data.highlights || []);
      }
    } catch (error) {
      console.error("[MemoryPage] Highlights fetch error:", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchTimeline(1), fetchHighlights()]).finally(() =>
      setLoading(false),
    );
  }, [fetchTimeline, fetchHighlights]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setActiveTab("search");
    try {
      const res = await fetch(
        `/api/memory?type=search&q=${encodeURIComponent(searchQuery)}&limit=20`,
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (error) {
      console.error("[MemoryPage] Search error:", {
        error: error instanceof Error ? error.message : error,
      });
    } finally {
      setSearching(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchTimeline(newPage);
  };

  // --------------------------------------------------------------------------
  // RENDER HELPERS
  // --------------------------------------------------------------------------

  const getMoodEmoji = (score: number | null) => {
    if (!score) return "➖";
    const rounded = Math.round(Math.max(1, Math.min(10, score)));
    return MOOD_EMOJI[rounded] || "🙂";
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Dzisiaj";
    if (d.toDateString() === yesterday.toDateString()) return "Wczoraj";
    return d.toLocaleDateString("pl-PL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  const totalPages = Math.ceil(totalSummaries / PAGE_SIZE);

  // Highlights grouped by category
  const groupedHighlights = highlights.reduce(
    (acc, h) => {
      const cat = h.category || "insight";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(h);
      return acc;
    },
    {} as Record<string, Highlight[]>,
  );

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
          <Brain className="w-7 h-7" />
          Total Recall
        </h1>
        <p className="text-muted-foreground">
          Pelna pamiec — podsumowania, wyszukiwanie, kluczowe fakty
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Szukaj we wspomnieniach..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-10"
          />
        </div>
        <Button onClick={handleSearch} disabled={searching}>
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Szukaj"}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === "timeline" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("timeline")}
        >
          <Calendar className="w-4 h-4 mr-2" />
          Timeline ({totalSummaries})
        </Button>
        <Button
          variant={activeTab === "search" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("search")}
        >
          <Search className="w-4 h-4 mr-2" />
          Wyniki ({searchResults.length})
        </Button>
        <Button
          variant={activeTab === "highlights" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("highlights")}
        >
          <Star className="w-4 h-4 mr-2" />
          Highlights ({highlights.length})
        </Button>
      </div>

      {/* TIMELINE TAB */}
      {activeTab === "timeline" && (
        <div className="space-y-3">
          {summaries.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Brain className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">
                  Brak podsumowania dla tego okresu
                </h3>
                <p className="text-muted-foreground">
                  Podsumowania generuja sie automatycznie codziennie o 21:00
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {summaries.map((s) => {
                const isExpanded = expandedDate === s.date;
                return (
                  <Card
                    key={s.date}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setExpandedDate(isExpanded ? null : s.date)}
                  >
                    <CardContent className="p-4">
                      {/* Summary Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">
                            {getMoodEmoji(s.mood_score)}
                          </span>
                          <div>
                            <h3 className="font-medium">
                              {formatDate(s.date)}
                            </h3>
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {s.summary}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right text-sm hidden md:block">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <MessageSquare className="w-3 h-3" />
                              {s.message_count}
                            </div>
                          </div>
                          {s.reviewed ? (
                            <Badge
                              variant="outline"
                              className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs"
                            >
                              Reviewed
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-0 text-xs"
                            >
                              Draft
                            </Badge>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t space-y-4">
                          {/* Full Summary */}
                          <p className="text-sm leading-relaxed">{s.summary}</p>

                          {/* Scores */}
                          <div className="flex gap-4">
                            {s.mood_score && (
                              <div className="text-sm">
                                <span className="text-muted-foreground">
                                  Nastroj:{" "}
                                </span>
                                <span className="font-medium">
                                  {s.mood_score}/10
                                </span>
                              </div>
                            )}
                            {s.energy_score && (
                              <div className="text-sm">
                                <span className="text-muted-foreground">
                                  Energia:{" "}
                                </span>
                                <span className="font-medium">
                                  {s.energy_score}/10
                                </span>
                              </div>
                            )}
                            <div className="text-sm">
                              <span className="text-muted-foreground">
                                Wiadomosci:{" "}
                              </span>
                              <span className="font-medium">
                                {s.message_count}
                              </span>
                            </div>
                          </div>

                          {/* Key Topics */}
                          {s.key_topics && s.key_topics.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">
                                Tematy:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {s.key_topics.map((t, i) => (
                                  <Badge
                                    key={i}
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Key Events */}
                          {s.key_events && s.key_events.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">
                                Kluczowe wydarzenia:
                              </p>
                              <ul className="space-y-1">
                                {s.key_events.map((ev, i) => (
                                  <li
                                    key={i}
                                    className="text-sm flex items-center gap-2"
                                  >
                                    <span>
                                      {ev.sentiment === "positive"
                                        ? "🟢"
                                        : ev.sentiment === "negative"
                                          ? "🔴"
                                          : "🟡"}
                                    </span>
                                    {ev.event}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Tasks */}
                          {(s.tasks_created || s.tasks_completed) && (
                            <div className="flex gap-4 text-sm">
                              {s.tasks_created ? (
                                <span>
                                  Zadania utworzone:{" "}
                                  <strong>{s.tasks_created}</strong>
                                </span>
                              ) : null}
                              {s.tasks_completed ? (
                                <span>
                                  Zadania ukonczone:{" "}
                                  <strong>{s.tasks_completed}</strong>
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => handlePageChange(page - 1)}
                  >
                    Poprzednia
                  </Button>
                  <span className="flex items-center text-sm text-muted-foreground px-4">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => handlePageChange(page + 1)}
                  >
                    Nastepna
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* SEARCH TAB */}
      {activeTab === "search" && (
        <div className="space-y-3">
          {searchResults.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Brak wynikow</h3>
                <p className="text-muted-foreground">
                  {searchQuery
                    ? `Nie znaleziono wynikow dla "${searchQuery}"`
                    : "Wpisz zapytanie i kliknij Szukaj"}
                </p>
              </CardContent>
            </Card>
          ) : (
            searchResults.map((r, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-xs">
                          {r.type === "message"
                            ? "Wiadomosc"
                            : r.type === "summary"
                              ? "Podsumowanie"
                              : "Highlight"}
                        </Badge>
                        {r.metadata?.channel && (
                          <Badge variant="outline" className="text-xs">
                            {r.metadata.channel}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm">{r.content}</p>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.date).toLocaleDateString("pl-PL")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        score: {r.score.toFixed(1)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* HIGHLIGHTS TAB */}
      {activeTab === "highlights" && (
        <div className="space-y-6">
          {Object.keys(groupedHighlights).length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Star className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Brak highlights</h3>
                <p className="text-muted-foreground">
                  Highlights sa automatycznie wyodrebniane z rozmow
                </p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(groupedHighlights).map(([category, items]) => (
              <div key={category} className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                  {HIGHLIGHT_ICONS[category] || <Star className="w-4 h-4" />}
                  {HIGHLIGHT_LABELS[category] || category} ({items.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {items.map((h) => (
                    <Card key={h.id}>
                      <CardContent className="p-3">
                        <p className="text-sm">{h.content}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {"★".repeat(
                              Math.min(5, Math.ceil(h.importance / 2)),
                            )}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {h.source === "conversation"
                              ? "z rozmowy"
                              : h.source === "analysis"
                                ? "z analizy"
                                : "recznie"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
