"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Package, Sparkles, LayoutGrid, Layers } from "lucide-react";

interface ExtensionStatsProps {
  totalActive: number;
  modCount: number;
  skillCount: number;
  appCount: number;
}

const STAT_ITEMS = [
  {
    key: "total",
    label: "Aktywne",
    icon: Layers,
    bgColor: "bg-green-100 dark:bg-green-900/30",
    iconColor: "text-green-600 dark:text-green-400",
    field: "totalActive" as const,
  },
  {
    key: "mods",
    label: "Mody",
    icon: Package,
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
    field: "modCount" as const,
  },
  {
    key: "skills",
    label: "Skille",
    icon: Sparkles,
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    iconColor: "text-purple-600 dark:text-purple-400",
    field: "skillCount" as const,
  },
  {
    key: "apps",
    label: "Aplikacje",
    icon: LayoutGrid,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    field: "appCount" as const,
  },
];

export function ExtensionStats(props: ExtensionStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {STAT_ITEMS.map((item) => (
        <Card key={item.key}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${item.bgColor}`}>
                <item.icon className={`w-5 h-5 ${item.iconColor}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{props[item.field]}</p>
                <p className="text-sm text-muted-foreground">{item.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
