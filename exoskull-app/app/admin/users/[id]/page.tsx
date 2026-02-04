"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge, getStatusType } from "@/components/admin/status-badge";

interface UserDetail {
  user: any;
  conversations: any[];
  engagement: any;
  installations: any[];
  mits: any[];
  patterns: any[];
  aiSummary: { totalRequests: number; totalCost: number; totalTokens: number };
  interventions: any[];
}

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${id}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("[AdminUserDetail] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!data?.user) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">User not found.</p>
      </div>
    );
  }

  const u = data.user;
  const eng = data.engagement;

  return (
    <div className="p-6 space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Users
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{u.name || u.email || u.phone}</h1>
        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
          {u.email && <span>{u.email}</span>}
          {u.phone && <span>{u.phone}</span>}
          <span className="capitalize bg-muted px-2 py-0.5 rounded text-xs">
            {u.subscription_tier || "free"}
          </span>
          <span>{u.timezone || "UTC"}</span>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Conversations (30d)"
          value={data.conversations.length}
        />
        <StatCard
          title="AI Cost (30d)"
          value={`$${data.aiSummary.totalCost.toFixed(4)}`}
        />
        <StatCard
          title="Engagement"
          value={eng?.engagement_level?.replace("_", " ") || "N/A"}
        />
        <StatCard
          title="Churn Risk"
          value={eng ? `${(eng.churn_risk * 100).toFixed(0)}%` : "N/A"}
          negative={eng?.churn_risk > 0.5}
        />
        <StatCard
          title="Total Paid"
          value={`${(u.total_paid_pln || 0).toLocaleString("pl-PL")} PLN`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MITs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Most Important Things (MITs)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.mits.length > 0 ? (
              <div className="space-y-3">
                {data.mits.map((mit: any) => (
                  <div key={mit.id} className="border-b border-border/50 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-muted-foreground">
                        #{mit.rank}
                      </span>
                      <span className="font-medium">{mit.objective}</span>
                    </div>
                    {mit.reasoning && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {mit.reasoning}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No MITs detected yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Active Installations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Mods & Rigs</CardTitle>
          </CardHeader>
          <CardContent>
            {data.installations.length > 0 ? (
              <div className="space-y-2">
                {data.installations.map((inst: any) => (
                  <div
                    key={inst.id}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <div className="flex items-center gap-2">
                      <span>{inst.registry?.icon || "📦"}</span>
                      <span>{inst.registry?.name || inst.id}</span>
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">
                      {inst.registry?.type || "mod"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active installations.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Patterns */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detected Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            {data.patterns.length > 0 ? (
              <div className="space-y-2">
                {data.patterns.map((p: any) => (
                  <div
                    key={p.id}
                    className="text-sm border-b border-border/50 pb-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="capitalize text-xs bg-muted px-2 py-0.5 rounded">
                        {p.pattern_type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(p.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                    <p className="text-xs mt-1">{p.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No patterns detected yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Interventions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Interventions</CardTitle>
          </CardHeader>
          <CardContent>
            {data.interventions.length > 0 ? (
              <div className="space-y-2">
                {data.interventions.map((i: any) => (
                  <div
                    key={i.id}
                    className="flex items-center justify-between text-sm py-1 border-b border-border/50"
                  >
                    <div>
                      <span className="capitalize text-xs">
                        {i.intervention_type}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {i.priority}
                      </span>
                    </div>
                    <StatusBadge
                      status={getStatusType(i.guardian_verdict || "unknown")}
                      label={i.guardian_verdict || "pending"}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No interventions yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Conversations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Recent Conversations (30d)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.conversations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="pb-2 font-medium">Channel</th>
                    <th className="pb-2 font-medium">Model</th>
                    <th className="pb-2 font-medium">Tokens</th>
                    <th className="pb-2 font-medium">Duration</th>
                    <th className="pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.conversations.map((c: any) => (
                    <tr key={c.id} className="border-b border-border/50">
                      <td className="py-2 capitalize text-xs">{c.channel}</td>
                      <td className="py-2 font-mono text-xs">
                        {c.model_used || "—"}
                      </td>
                      <td className="py-2 text-xs">{c.tokens_used || 0}</td>
                      <td className="py-2 text-xs">
                        {c.duration_seconds
                          ? `${Math.round(c.duration_seconds)}s`
                          : "—"}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleString("en-GB")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No conversations in the last 30 days.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
