/**
 * Mobile Delta Sync API
 *
 * GET /api/mobile/sync?tables=exo_tasks,messages&since=ISO_TIMESTAMP
 *
 * Returns records modified after `since` for the authenticated user.
 * Bearer JWT auth (Supabase). Max 500 records/request with cursor pagination.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Tables allowed for mobile sync (whitelist)
const SYNCABLE_TABLES: Record<
  string,
  { timestampCol: string; tenantCol: string }
> = {
  user_ops: { timestampCol: "updated_at", tenantCol: "user_id" },
  user_quests: { timestampCol: "updated_at", tenantCol: "user_id" },
  user_campaigns: { timestampCol: "updated_at", tenantCol: "user_id" },
  user_notes: { timestampCol: "updated_at", tenantCol: "user_id" },
  user_loops: { timestampCol: "updated_at", tenantCol: "user_id" },
  exo_conversations: { timestampCol: "updated_at", tenantCol: "tenant_id" },
  exo_messages: { timestampCol: "created_at", tenantCol: "tenant_id" },
  exo_documents: { timestampCol: "updated_at", tenantCol: "tenant_id" },
  exo_generated_apps: { timestampCol: "updated_at", tenantCol: "tenant_id" },
  exo_analyzed_emails: { timestampCol: "updated_at", tenantCol: "tenant_id" },
};

const MAX_RECORDS = 500;

async function authenticateRequest(
  req: NextRequest,
): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  return { userId: user.id };
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tablesParam = searchParams.get("tables");
  const since = searchParams.get("since");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(
    parseInt(searchParams.get("limit") || "500", 10),
    MAX_RECORDS,
  );

  if (!tablesParam) {
    return NextResponse.json(
      { error: "Missing 'tables' parameter" },
      { status: 400 },
    );
  }

  const requestedTables = tablesParam.split(",").map((t) => t.trim());
  const invalidTables = requestedTables.filter((t) => !SYNCABLE_TABLES[t]);

  if (invalidTables.length > 0) {
    return NextResponse.json(
      {
        error: `Invalid tables: ${invalidTables.join(", ")}`,
        allowed: Object.keys(SYNCABLE_TABLES),
      },
      { status: 400 },
    );
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const results: Record<
      string,
      { data: any[]; count: number; hasMore: boolean; nextCursor?: string }
    > = {};

    for (const table of requestedTables) {
      const config = SYNCABLE_TABLES[table];

      let query = supabase
        .from(table)
        .select("*", { count: "exact" })
        .eq(config.tenantCol, auth.userId)
        .order(config.timestampCol, { ascending: true })
        .limit(limit);

      if (since) {
        query = query.gte(config.timestampCol, since);
      }

      if (cursor) {
        query = query.gt(config.timestampCol, cursor);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error(`[MobileSync] Error querying ${table}:`, error);
        results[table] = { data: [], count: 0, hasMore: false };
        continue;
      }

      const records = data || [];
      const hasMore = (count || 0) > records.length;
      const nextCursor =
        hasMore && records.length > 0
          ? records[records.length - 1][config.timestampCol]
          : undefined;

      results[table] = {
        data: records,
        count: records.length,
        hasMore,
        nextCursor,
      };
    }

    return NextResponse.json({
      syncedAt: new Date().toISOString(),
      tables: results,
    });
  } catch (error) {
    console.error("[MobileSync] Sync failed:", {
      error: error instanceof Error ? error.message : error,
      userId: auth.userId,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
