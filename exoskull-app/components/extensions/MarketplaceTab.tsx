"use client";

import { useState } from "react";
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
import { Download, CheckCircle2, Loader2, Puzzle } from "lucide-react";
import type { ModTemplate } from "@/lib/extensions/hooks";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/extensions/types";

interface MarketplaceTabProps {
  templates: ModTemplate[];
  onInstall: (slug: string) => Promise<boolean>;
}

export function MarketplaceTab({ templates, onInstall }: MarketplaceTabProps) {
  const [installing, setInstalling] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const categories = [
    ...new Set(templates.map((t) => t.category).filter(Boolean)),
  ] as string[];

  const filtered =
    categoryFilter === "all"
      ? templates
      : templates.filter((t) => t.category === categoryFilter);

  async function handleInstall(slug: string) {
    setInstalling(slug);
    try {
      await onInstall(slug);
    } finally {
      setInstalling(null);
    }
  }

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-medium mb-2">Wszystko zainstalowane!</h3>
          <p className="text-muted-foreground">
            Masz juz wszystkie dostepne mody. Mozesz wygenerowac wlasny skill w
            zakladce &ldquo;Generuj AI&rdquo;.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category filter */}
      {categories.length > 1 && (
        <div className="flex items-center gap-4">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Kategoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie kategorie</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {CATEGORY_LABELS[cat] || cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {filtered.length} dostepnych
          </span>
        </div>
      )}

      {/* Template grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((template) => (
          <Card key={template.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{template.icon || "📦"}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium">{template.name}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    {template.category && (
                      <Badge
                        variant="outline"
                        className={`border-0 text-xs ${CATEGORY_COLORS[template.category] || ""}`}
                      >
                        {CATEGORY_LABELS[template.category] ||
                          template.category}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                className="w-full mt-3"
                disabled={installing === template.slug}
                onClick={() => handleInstall(template.slug)}
              >
                {installing === template.slug ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Instalowanie...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Zainstaluj
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
