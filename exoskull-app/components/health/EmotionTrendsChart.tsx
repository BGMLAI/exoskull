"use client";

import { useEffect, useState } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Brain, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface EmotionTrendPoint {
  date: string;
  avg_valence: number;
  avg_arousal: number;
  avg_intensity: number;
  dominant_emotion: string;
  crisis_count: number;
  entry_count: number;
  label?: string;
}

const EMOTION_PL: Record<string, string> = {
  happy: "Radosc",
  sad: "Smutek",
  angry: "Zlosc",
  fearful: "Lek",
  disgusted: "Odraza",
  surprised: "Zaskoczenie",
  neutral: "Neutralny",
};

export function EmotionTrendsChart({ days = 7 }: { days?: 7 | 14 | 30 }) {
  const [data, setData] = useState<EmotionTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(`/api/emotion/trends?days=${days}`);
        if (!res.ok) throw new Error("Failed to fetch emotion trends");
        const result = await res.json();

        const chartData = (result.data || []).map((p: EmotionTrendPoint) => ({
          ...p,
          label: formatDateLabel(p.date),
        }));

        setData(chartData);
        setError(null);
      } catch (err) {
        console.error("[EmotionTrendsChart] Error:", err);
        setError("Nie udalo sie zaladowac danych");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [days]);

  const hasData = data.some((d) => d.entry_count > 0);

  // Trend: compare last 3 days valence vs previous 3 days
  const recent = data.slice(-3).filter((d) => d.entry_count > 0);
  const previous = data.slice(-6, -3).filter((d) => d.entry_count > 0);
  const recentAvg =
    recent.length > 0
      ? recent.reduce((s, d) => s + d.avg_valence, 0) / recent.length
      : 0;
  const previousAvg =
    previous.length > 0
      ? previous.reduce((s, d) => s + d.avg_valence, 0) / previous.length
      : 0;
  const trend =
    recentAvg > previousAvg + 0.1
      ? "up"
      : recentAvg < previousAvg - 0.1
        ? "down"
        : "stable";

  const hasCrisis = data.some((d) => d.crisis_count > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-pink-500" />
            <CardTitle className="text-lg">Emocje</CardTitle>
          </div>
          {hasData && (
            <div className="flex items-center gap-1 text-sm">
              {trend === "up" && (
                <TrendingUp className="h-4 w-4 text-green-500" />
              )}
              {trend === "down" && (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              {trend === "stable" && (
                <Minus className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-muted-foreground">
                {trend === "up"
                  ? "poprawa"
                  : trend === "down"
                    ? "spadek"
                    : "stabilnie"}
              </span>
            </div>
          )}
        </div>
        <CardDescription>
          Walencja i pobudzenie — ostatnie {days} dni
          {hasCrisis && (
            <span className="ml-2 text-red-500 font-medium">
              (wykryto sygnaly kryzysowe)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[180px] text-muted-foreground">
            Ladowanie...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-[180px] text-red-500 text-sm">
            {error}
          </div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">
            Brak danych emocjonalnych
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart
              data={data}
              margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
            >
              <defs>
                <linearGradient
                  id="valenceGradientPos"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient
                  id="valenceGradientNeg"
                  x1="0"
                  y1="1"
                  x2="0"
                  y2="0"
                >
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#333"
                opacity={0.3}
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "#888" }}
              />
              <YAxis
                yAxisId="valence"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "#888" }}
                width={30}
                domain={[-1, 1]}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <YAxis
                yAxisId="arousal"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "#888" }}
                width={30}
                domain={[0, 1]}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <ReferenceLine
                yAxisId="valence"
                y={0}
                stroke="#666"
                strokeDasharray="3 3"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const p = payload[0].payload as EmotionTrendPoint;
                    return (
                      <div className="bg-popover border rounded-lg shadow-lg px-3 py-2 text-sm">
                        <p className="font-medium text-pink-400">
                          {EMOTION_PL[p.dominant_emotion] || p.dominant_emotion}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Walencja: {Number(p.avg_valence).toFixed(2)} |
                          Pobudzenie: {Number(p.avg_arousal).toFixed(2)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Intensywnosc: {Math.round(p.avg_intensity)} | Wpisy:{" "}
                          {p.entry_count}
                        </p>
                        {p.crisis_count > 0 && (
                          <p className="text-red-500 text-xs font-medium">
                            Sygnaly kryzysowe: {p.crisis_count}
                          </p>
                        )}
                        <p className="text-muted-foreground text-xs mt-1">
                          {p.date}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                yAxisId="valence"
                type="monotone"
                dataKey="avg_valence"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#valenceGradientPos)"
                name="Walencja"
              />
              <Line
                yAxisId="arousal"
                type="monotone"
                dataKey="avg_arousal"
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                name="Pobudzenie"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate();
  const month = date.toLocaleDateString("pl-PL", { month: "short" });
  return `${day} ${month}`;
}
