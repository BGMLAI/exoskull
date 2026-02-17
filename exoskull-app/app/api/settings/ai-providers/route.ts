/**
 * AI Providers Settings API
 *
 * GET: Returns provider config with masked keys and status
 * PATCH: Updates provider settings (keys, enabled, default_provider, model)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

type ProviderName = "anthropic" | "openai" | "gemini";

interface ProviderConfig {
  api_key?: string;
  enabled?: boolean;
  model?: string;
}

/** Mask an API key: show first 7 + last 4 chars */
function maskKey(key: string): string {
  if (!key || key.length < 12) return "***";
  return key.slice(0, 7) + "***" + key.slice(-4);
}

/** Quick validation: check key format (not full API call) */
function validateKeyFormat(provider: ProviderName, key: string): boolean {
  if (!key || !key.trim()) return true; // Empty = removing key
  switch (provider) {
    case "anthropic":
      return key.startsWith("sk-ant-");
    case "openai":
      return key.startsWith("sk-");
    case "gemini":
      return key.length > 20; // Gemini keys don't have a strict prefix
    default:
      return false;
  }
}

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("*")
      .eq("id", tenantId)
      .single();

    const t = tenant as Record<string, unknown> | null;
    const aiConfig = (t?.iors_ai_config as Record<string, unknown>) ?? {};
    const providers =
      (aiConfig.providers as Record<string, ProviderConfig>) ?? {};
    const defaultProvider =
      (aiConfig.default_provider as ProviderName) ?? "anthropic";

    // Build response with masked keys and status
    const providerNames: ProviderName[] = ["anthropic", "openai", "gemini"];
    const result: Record<string, unknown> = {};

    for (const name of providerNames) {
      const cfg = providers[name] ?? {};
      const hasKey = !!cfg.api_key;
      const hasSystemKey =
        name === "anthropic"
          ? !!process.env.ANTHROPIC_API_KEY
          : name === "openai"
            ? !!process.env.OPENAI_API_KEY
            : name === "gemini"
              ? !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
              : false;

      let status: string = "no_key";
      let statusMessage: string | undefined;

      if (hasKey) {
        status = "ok";
        statusMessage = "Wlasny klucz API ustawiony";
      } else if (hasSystemKey) {
        status = "ok";
        statusMessage = "Klucz systemowy (domyslny)";
      }

      result[name] = {
        enabled: cfg.enabled !== false,
        has_key: hasKey,
        key_masked: hasKey
          ? maskKey(cfg.api_key!)
          : hasSystemKey
            ? "Systemowy (domyslny)"
            : null,
        model: cfg.model ?? undefined,
        status,
        status_message: statusMessage,
      };
    }

    return NextResponse.json({
      default_provider: defaultProvider,
      providers: result,
    });
  } catch (error) {
    logger.error("[AIProvidersAPI] GET Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});

export const PATCH = withApiLog(async function PATCH(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const body = await req.json();

    // Load current config
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("*")
      .eq("id", tenantId)
      .single();

    const t = tenant as Record<string, unknown> | null;
    const current = (t?.iors_ai_config as Record<string, unknown>) ?? {};
    const updated = { ...current };

    // Update default_provider
    if (body.default_provider) {
      const valid: ProviderName[] = ["anthropic", "openai", "gemini"];
      if (valid.includes(body.default_provider)) {
        updated.default_provider = body.default_provider;
      }
    }

    // Update per-provider settings
    if (body.providers && typeof body.providers === "object") {
      const currentProviders =
        (current.providers as Record<string, ProviderConfig>) ?? {};
      const newProviders = { ...currentProviders };

      const providerNames: ProviderName[] = ["anthropic", "openai", "gemini"];
      for (const name of providerNames) {
        const patch = body.providers[name];
        if (!patch || typeof patch !== "object") continue;

        const currentCfg = currentProviders[name] ?? {};
        const newCfg = { ...currentCfg };

        // API key update
        if ("api_key" in patch) {
          const key = patch.api_key as string;
          if (!key || !key.trim()) {
            // Remove key
            delete newCfg.api_key;
          } else {
            // Validate format
            if (!validateKeyFormat(name, key)) {
              return NextResponse.json(
                { error: `Nieprawidlowy format klucza dla ${name}` },
                { status: 400 },
              );
            }
            newCfg.api_key = key;
          }
        }

        // Enabled toggle
        if ("enabled" in patch) {
          newCfg.enabled = !!patch.enabled;
        }

        // Model selection
        if ("model" in patch) {
          newCfg.model = patch.model as string;
        }

        newProviders[name] = newCfg;
      }

      updated.providers = newProviders;
    }

    const { error } = await supabase
      .from("exo_tenants")
      .update({
        iors_ai_config: updated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    if (error) {
      logger.error("[AIProvidersAPI] PATCH failed:", {
        userId: tenantId,
        error: error.message,
      });
      return NextResponse.json(
        { error: "Nie udalo sie zapisac konfiguracji" },
        { status: 500 },
      );
    }

    // Return updated state (re-read for consistency)
    const providerNames: ProviderName[] = ["anthropic", "openai", "gemini"];
    const updatedProviders =
      (updated.providers as Record<string, ProviderConfig>) ?? {};
    const result: Record<string, unknown> = {};

    for (const name of providerNames) {
      const cfg = updatedProviders[name] ?? {};
      const hasKey = !!cfg.api_key;
      const hasSystemKey =
        name === "anthropic"
          ? !!process.env.ANTHROPIC_API_KEY
          : name === "openai"
            ? !!process.env.OPENAI_API_KEY
            : name === "gemini"
              ? !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
              : false;

      let status: string = "no_key";
      let statusMessage: string | undefined;

      if (hasKey) {
        status = "ok";
        statusMessage = "Wlasny klucz API ustawiony";
      } else if (hasSystemKey) {
        status = "ok";
        statusMessage = "Klucz systemowy (domyslny)";
      }

      result[name] = {
        enabled: cfg.enabled !== false,
        has_key: hasKey,
        key_masked: hasKey
          ? maskKey(cfg.api_key!)
          : hasSystemKey
            ? "Systemowy (domyslny)"
            : null,
        model: cfg.model ?? undefined,
        status,
        status_message: statusMessage,
      };
    }

    return NextResponse.json({
      default_provider: updated.default_provider ?? "anthropic",
      providers: result,
    });
  } catch (error) {
    logger.error("[AIProvidersAPI] PATCH Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
