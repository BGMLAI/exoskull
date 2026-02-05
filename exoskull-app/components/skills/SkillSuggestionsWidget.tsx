"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sparkles, X, Loader2, Lightbulb, Search, Eye } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

type Suggestion = {
  id: string;
  source: "request_parse" | "pattern_match" | "gap_detection";
  description: string;
  suggested_slug?: string;
  life_area?: string;
  confidence: number;
  reasoning: string;
  created_at?: string;
};

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  request_parse: {
    label: "Twoje zapytanie",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  pattern_match: {
    label: "Wykryty wzorzec",
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  },
  gap_detection: {
    label: "Wykryta luka",
    color:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
};

const AREA_LABELS: Record<string, string> = {
  health: "Zdrowie",
  productivity: "Produktywnosc",
  finance: "Finanse",
  relationships: "Relacje",
  personal_growth: "Rozwoj",
  leisure: "Odpoczynek",
  spirituality: "Duchowość",
};

// ============================================================================
// COMPONENT
// ============================================================================

export function SkillSuggestionsWidget({
  userId,
  onSuggestionAccepted,
}: {
  userId: string;
  onSuggestionAccepted?: () => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadSuggestions();
  }, [userId]);

  async function loadSuggestions() {
    try {
      setLoading(true);
      const res = await fetch("/api/skills/suggestions", {
        headers: { "x-tenant-id": userId },
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error("[SuggestionsWidget] Load error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(id: string, action: "accept" | "dismiss") {
    setProcessingId(id);
    try {
      const res = await fetch("/api/skills/suggestions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": userId,
        },
        body: JSON.stringify({ id, action }),
      });

      if (res.ok) {
        // Remove from list optimistically
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
        if (action === "accept") {
          onSuggestionAccepted?.();
        }
      }
    } catch (error) {
      console.error("[SuggestionsWidget] Action error:", error);
    } finally {
      setProcessingId(null);
    }
  }

  // Don't render if loading or no suggestions
  if (loading) return null;
  if (suggestions.length === 0) return null;

  return (
    <Card className="border-dashed border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-yellow-500" />
          Sugestie nowych skilli
          <Badge variant="secondary" className="ml-auto text-xs">
            {suggestions.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestions.slice(0, 3).map((suggestion) => {
          const sourceConfig =
            SOURCE_LABELS[suggestion.source] || SOURCE_LABELS.pattern_match;
          const isProcessing = processingId === suggestion.id;
          const SourceIcon =
            suggestion.source === "request_parse"
              ? Sparkles
              : suggestion.source === "gap_detection"
                ? Eye
                : Search;

          return (
            <div
              key={suggestion.id}
              className="p-3 rounded-lg bg-muted/50 space-y-2"
            >
              {/* Description + source */}
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm flex-1">{suggestion.description}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 shrink-0"
                  onClick={() => handleAction(suggestion.id!, "dismiss")}
                  disabled={isProcessing}
                  title="Odrzuc"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              {/* Metadata row */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`text-xs ${sourceConfig.color}`}>
                  <SourceIcon className="h-3 w-3 mr-1" />
                  {sourceConfig.label}
                </Badge>
                {suggestion.life_area && (
                  <Badge variant="outline" className="text-xs">
                    {AREA_LABELS[suggestion.life_area] || suggestion.life_area}
                  </Badge>
                )}
              </div>

              {/* Confidence + action */}
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center gap-2">
                  <Progress
                    value={suggestion.confidence * 100}
                    className="h-1.5 flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-8">
                    {Math.round(suggestion.confidence * 100)}%
                  </span>
                </div>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleAction(suggestion.id!, "accept")}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Generowanie...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3 mr-1" />
                      Generuj
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
