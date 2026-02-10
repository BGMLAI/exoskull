"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Layers } from "lucide-react";
import type { UnifiedExtension, ExtensionType } from "@/lib/extensions/types";
import { ExtensionCard } from "./ExtensionCard";

interface ActiveTabProps {
  extensions: UnifiedExtension[];
  onArchive?: (id: string) => void;
}

export function ActiveTab({ extensions, onArchive }: ActiveTabProps) {
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filtered =
    typeFilter === "all"
      ? extensions
      : extensions.filter((e) => e.type === typeFilter);

  if (extensions.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Layers className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">
            Brak aktywnych rozszerzen
          </h3>
          <p className="text-muted-foreground">
            Zainstaluj moda z Marketplace lub wygeneruj skill AI.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter by type */}
      <div className="flex items-center gap-4">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtruj po typie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie typy</SelectItem>
            <SelectItem value="mod">Mody</SelectItem>
            <SelectItem value="skill">Skille</SelectItem>
            <SelectItem value="app">Aplikacje</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {filtered.length} z {extensions.length}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((ext) => (
          <ExtensionCard
            key={`${ext.type}-${ext.id}`}
            extension={ext}
            onArchive={ext.type === "skill" ? onArchive : undefined}
          />
        ))}
      </div>
    </div>
  );
}
