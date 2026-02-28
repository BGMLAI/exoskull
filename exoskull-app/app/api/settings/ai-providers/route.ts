/**
 * AI Providers Settings API
 *
 * GET: Returns provider config with masked keys and status
 * PATCH: Updates provider settings (keys, enabled, default_provider, model)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import {
  BYOK_PROVIDERS,
  invalidateConfigCache,
  type BYOKProvider,
} from "@/lib/ai/byok";
import { MODEL_CONFIGS, TIER_MODELS } from "@/lib/ai/config";
import type { ModelId, ModelTier } from "@/lib/ai/types";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

type ProviderName = BYOKProvider;

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
  const info = BYOK_PROVIDERS.find((p) => p.id === provider);
  if (!info) return false;
  if (!info.keyPrefix) return key.length > 10; // Generic check
  return key.startsWith(info.keyPrefix);
}

const PROVIDER_NAMES: ProviderName[] = BYOK_PROVIDERS.map((p) => p.id);

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
      (aiConfig.default_provider as ProviderName) ?? "deepseek";
    const tierOverrides =
      (aiConfig.tier_overrides as Record<string, { modelId?: string }>) ?? {};

    // Build response with masked keys and status
    const result: Record<string, unknown> = {};

    for (const providerInfo of BYOK_PROVIDERS) {
      const name = providerInfo.id;
      const cfg = providers[name] ?? {};
      const hasKey = !!cfg.api_key;
      const hasSystemKey = !!process.env[providerInfo.envVar];

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

    // Build available models list for tier override UI
    const availableModels = Object.values(MODEL_CONFIGS).map((m) => ({
      id: m.id,
      displayName: m.displayName,
      tier: m.tier,
      provider: m.provider,
      costInfo: `$${m.inputCostPer1M}/$${m.outputCostPer1M} per 1M tok`,
    }));

    return NextResponse.json({
      default_provider: defaultProvider,
      providers: result,
      tier_overrides: tierOverrides,
      available_models: availableModels,
      tier_defaults: TIER_MODELS,
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
      if (PROVIDER_NAMES.includes(body.default_provider)) {
        updated.default_provider = body.default_provider;
      }
    }

    // Update per-provider settings
    if (body.providers && typeof body.providers === "object") {
      const currentProviders =
        (current.providers as Record<string, ProviderConfig>) ?? {};
      const newProviders = { ...currentProviders };

      for (const name of PROVIDER_NAMES) {
        const patch = body.providers[name];
        if (!patch || typeof patch !== "object") continue;

        const currentCfg = currentProviders[name] ?? {};
        const newCfg = { ...currentCfg };

        // API key update
        if ("api_key" in patch) {
          const key = patch.api_key as string;
          if (!key || !key.trim()) {
            delete newCfg.api_key;
          } else {
            if (!validateKeyFormat(name, key)) {
              return NextResponse.json(
                { error: `Nieprawidlowy format klucza dla ${name}` },
                { status: 400 },
              );
            }
            newCfg.api_key = key;
          }
        }

        if ("enabled" in patch) {
          newCfg.enabled = !!patch.enabled;
        }

        if ("model" in patch) {
          newCfg.model = patch.model as string;
        }

        newProviders[name] = newCfg;
      }

      updated.providers = newProviders;
    }

    // Update tier overrides
    if (body.tier_overrides && typeof body.tier_overrides === "object") {
      updated.tier_overrides = body.tier_overrides;
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

    // Invalidate BYOK cache for this tenant
    invalidateConfigCache(tenantId);

    // Return updated state
    const updatedProviders =
      (updated.providers as Record<string, ProviderConfig>) ?? {};
    const result: Record<string, unknown> = {};

    for (const providerInfo of BYOK_PROVIDERS) {
      const name = providerInfo.id;
      const cfg = updatedProviders[name] ?? {};
      const hasKey = !!cfg.api_key;
      const hasSystemKey = !!process.env[providerInfo.envVar];

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
      default_provider: updated.default_provider ?? "deepseek",
      providers: result,
      tier_overrides: updated.tier_overrides ?? {},
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
