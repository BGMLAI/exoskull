"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/admin/status-badge";

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  subscription_tier: string;
  timezone: string;
  created_at: string;
  total_paid_pln: number;
  engagement: {
    engagement_level: string;
    overall_score: number;
    churn_risk: number;
    last_active_at: string;
  } | null;
}

const ENGAGEMENT_STATUS: Record<
  string,
  "success" | "warning" | "error" | "info" | "neutral"
> = {
  power_user: "info",
  high: "success",
  medium: "warning",
  low: "error",
  dormant: "error",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const limit = 30;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sort: "created_at",
        order: "desc",
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("[AdminUsers] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground">{total} total users</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground text-left">
              <th className="pb-3 font-medium">User</th>
              <th className="pb-3 font-medium">Tier</th>
              <th className="pb-3 font-medium">Engagement</th>
              <th className="pb-3 font-medium">Churn Risk</th>
              <th className="pb-3 font-medium">Total Paid</th>
              <th className="pb-3 font-medium">Last Active</th>
              <th className="pb-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0
              ? [...Array(5)].map((_, i) => (
                  <tr
                    key={i}
                    className="border-b border-border/50 animate-pulse"
                  >
                    <td className="py-3">
                      <div className="h-4 w-32 bg-muted rounded" />
                    </td>
                    <td className="py-3">
                      <div className="h-4 w-16 bg-muted rounded" />
                    </td>
                    <td className="py-3">
                      <div className="h-4 w-20 bg-muted rounded" />
                    </td>
                    <td className="py-3">
                      <div className="h-4 w-12 bg-muted rounded" />
                    </td>
                    <td className="py-3">
                      <div className="h-4 w-16 bg-muted rounded" />
                    </td>
                    <td className="py-3">
                      <div className="h-4 w-24 bg-muted rounded" />
                    </td>
                    <td className="py-3">
                      <div className="h-4 w-20 bg-muted rounded" />
                    </td>
                  </tr>
                ))
              : users.map((user) => {
                  const eng = user.engagement;
                  return (
                    <tr
                      key={user.id}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
                      <td className="py-3">
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="hover:underline"
                        >
                          <div>
                            <span className="font-medium">
                              {user.name || "—"}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              {user.email || user.phone || "—"}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="py-3">
                        <span className="capitalize text-xs bg-muted px-2 py-0.5 rounded">
                          {user.subscription_tier || "free"}
                        </span>
                      </td>
                      <td className="py-3">
                        {eng ? (
                          <StatusBadge
                            status={
                              ENGAGEMENT_STATUS[eng.engagement_level] ||
                              "neutral"
                            }
                            label={
                              eng.engagement_level?.replace("_", " ") ||
                              "unknown"
                            }
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        {eng ? (
                          <span
                            className={`text-xs ${
                              eng.churn_risk > 0.7
                                ? "text-red-500 font-medium"
                                : eng.churn_risk > 0.4
                                  ? "text-yellow-500"
                                  : "text-green-500"
                            }`}
                          >
                            {(eng.churn_risk * 100).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-xs">
                        {(user.total_paid_pln || 0).toLocaleString("pl-PL")} PLN
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {eng?.last_active_at
                          ? new Date(eng.last_active_at).toLocaleDateString(
                              "en-GB",
                            )
                          : "—"}
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString("en-GB")}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
