"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: number;
  trendLabel?: string;
  negative?: boolean;
}

export function StatCard({
  title,
  value,
  description,
  icon,
  trend,
  trendLabel,
  negative,
}: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold ${negative ? "text-destructive" : ""}`}
        >
          {value}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend !== undefined && (
          <p
            className={`text-xs mt-1 flex items-center gap-1 ${
              trend >= 0 ? "text-green-500" : "text-red-500"
            }`}
          >
            {trend >= 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {trend >= 0 ? "+" : ""}
            {typeof trend === "number" && trend % 1 !== 0
              ? trend.toFixed(1)
              : trend}
            {trendLabel ? ` ${trendLabel}` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
