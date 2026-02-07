"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, CheckSquare, Clock } from "lucide-react";
import Link from "next/link";
import { CalendarItem } from "@/lib/dashboard/types";

interface CalendarWidgetProps {
  items: CalendarItem[];
}

export function CalendarWidget({ items }: CalendarWidgetProps) {
  const upcomingItems = items.slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Kalendarz
          </span>
          <Link
            href="/dashboard"
            className="text-sm font-normal text-muted-foreground hover:text-foreground"
          >
            Widok canvas
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcomingItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak nadchodzacych wydarzen
          </p>
        ) : (
          upcomingItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
            >
              <div className="flex items-center gap-3">
                {item.type === "task" && (
                  <CheckSquare className="h-4 w-4 text-blue-500" />
                )}
                {item.type === "checkin" && (
                  <Clock className="h-4 w-4 text-amber-500" />
                )}
                {item.type === "custom" && (
                  <Calendar className="h-4 w-4 text-purple-500" />
                )}
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(item.date)}
                    {item.meta ? ` • ${item.meta}` : ""}
                  </p>
                </div>
              </div>
              <Link
                href={item.link}
                className="text-xs text-primary hover:underline"
              >
                Otworz
              </Link>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("pl-PL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
