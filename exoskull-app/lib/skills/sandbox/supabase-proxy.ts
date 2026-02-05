// =====================================================
// SUPABASE PROXY - Restricted Supabase client for sandbox
// Only allows whitelisted methods, auto-injects tenant_id
// =====================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Methods allowed on the query builder
const ALLOWED_QUERY_METHODS = new Set([
  "select",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "order",
  "limit",
  "single",
  "maybeSingle",
  "range",
  "textSearch",
  "filter",
  "not",
  "or",
  "match",
]);

const ALLOWED_WRITE_METHODS = new Set(["insert", "update", "upsert"]);

// Methods explicitly blocked
const BLOCKED_METHODS = new Set(["delete", "rpc"]);

// Properties blocked on the client
const BLOCKED_PROPERTIES = new Set([
  "auth",
  "storage",
  "functions",
  "realtime",
  "channel",
]);

export interface ProxyCallLog {
  method: string;
  table?: string;
  args?: unknown[];
  timestamp: number;
}

/**
 * Creates a restricted Supabase client proxy for sandbox execution.
 * - Only allows specific query/write methods
 * - Blocks auth, storage, functions, delete, rpc
 * - Auto-injects tenant_id on every query
 * - Logs all calls for audit trail
 */
export function createSupabaseProxy(
  tenantId: string,
  callLog: ProxyCallLog[] = [],
): Record<string, unknown> {
  const realClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Create the main proxy object that mimics the Supabase client
  const proxy = {
    from: (table: string) => {
      callLog.push({ method: "from", table, timestamp: Date.now() });
      return createQueryProxy(realClient, table, tenantId, callLog);
    },
  };

  // Freeze to prevent modification
  return Object.freeze(proxy);
}

/**
 * Creates a proxied query builder that chains methods safely
 */
function createQueryProxy(
  client: SupabaseClient,
  table: string,
  tenantId: string,
  callLog: ProxyCallLog[],
): Record<string, unknown> {
  // Start with the real query builder
  let queryBuilder = client.from(table);

  // Automatically inject tenant_id filter for all read operations
  // Write operations will need tenant_id in the data
  let hasSelect = false;
  let hasWrite = false;

  const chainProxy: Record<string, unknown> = {};

  // Add allowed query methods
  for (const method of ALLOWED_QUERY_METHODS) {
    chainProxy[method] = (...args: unknown[]) => {
      callLog.push({ method, table, args, timestamp: Date.now() });

      if (method === "select") {
        hasSelect = true;
        // Auto-inject tenant_id filter for reads
        queryBuilder = (queryBuilder as any)
          .select(...args)
          .eq("tenant_id", tenantId);
      } else {
        queryBuilder = (queryBuilder as any)[method](...args);
      }

      return chainProxy;
    };
  }

  // Add write methods with tenant_id injection
  for (const method of ALLOWED_WRITE_METHODS) {
    chainProxy[method] = (
      data: Record<string, unknown> | Record<string, unknown>[],
    ) => {
      callLog.push({ method, table, timestamp: Date.now() });
      hasWrite = true;

      // Inject tenant_id into write data
      const withTenantId = Array.isArray(data)
        ? data.map((row) => ({ ...row, tenant_id: tenantId }))
        : { ...data, tenant_id: tenantId };

      queryBuilder = (queryBuilder as any)[method](withTenantId);
      return chainProxy;
    };
  }

  // Block dangerous methods
  for (const method of BLOCKED_METHODS) {
    chainProxy[method] = () => {
      throw new Error(
        `[Sandbox] Method "${method}" is blocked for security reasons`,
      );
    };
  }

  // Add then() to make it awaitable (returns the query result)
  chainProxy["then"] = (
    resolve: (value: unknown) => void,
    reject: (reason: unknown) => void,
  ) => {
    // If it was a write without select, add tenant_id filter
    if (hasWrite && !hasSelect) {
      // For writes, ensure we're only touching tenant's own data
      queryBuilder = (queryBuilder as any).eq("tenant_id", tenantId);
    }

    return (queryBuilder as any).then(resolve, reject);
  };

  // Freeze to prevent adding new properties
  return Object.freeze(chainProxy);
}

/**
 * Create a safe console proxy that captures output
 */
export function createConsoleProxy(): {
  proxy: Record<string, unknown>;
  logs: string[];
} {
  const logs: string[] = [];

  const proxy = Object.freeze({
    log: (...args: unknown[]) => {
      const msg = args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ");
      logs.push(`[LOG] ${msg}`);
    },
    error: (...args: unknown[]) => {
      const msg = args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ");
      logs.push(`[ERROR] ${msg}`);
    },
    warn: (...args: unknown[]) => {
      const msg = args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ");
      logs.push(`[WARN] ${msg}`);
    },
    info: (...args: unknown[]) => {
      const msg = args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ");
      logs.push(`[INFO] ${msg}`);
    },
  });

  return { proxy, logs };
}
