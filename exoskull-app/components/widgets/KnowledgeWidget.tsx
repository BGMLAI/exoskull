"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Target } from "lucide-react";
import Link from "next/link";
import { KnowledgeSummary } from "@/lib/dashboard/types";

interface KnowledgeWidgetProps {
  summary: KnowledgeSummary;
}

export function KnowledgeWidget({ summary }: KnowledgeWidgetProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-indigo-500" />
            Wiedza
          </span>
          <Link
            href="/dashboard/memory"
            className="text-sm font-normal text-muted-foreground hover:text-foreground"
          >
            Zobacz baze
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-muted-foreground">Pętle</p>
            <p className="text-2xl font-semibold">{summary.loopsTotal}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-muted-foreground">Kampanie</p>
            <p className="text-2xl font-semibold">{summary.activeCampaigns}</p>
          </div>
        </div>

        {summary.topLoop && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
            <span className="text-2xl">{summary.topLoop.icon || "📌"}</span>
            <div>
              <p className="text-sm font-medium">{summary.topLoop.name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Target className="h-3 w-3" />
                Priorytet: {summary.topLoop.attentionScore ?? 0}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
