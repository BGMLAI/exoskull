/**
 * BYOK (Bring Your Own Key) — Tenant-level API key management.
 *
 * Allows tenants to provide their own API keys for any supported provider.
 * System has preset defaults (cheap models) but users can override per-tier.
 *
 * Keys stored in exo_tenants.iors_ai_config.providers (JSONB, encrypted at rest).
 */

import type { ModelId, ModelTier, ModelProvider } from "./types";
import { MODEL_CONFIGS, TIER_MODELS } from "./config";
import { logger } from "@/lib/logger";

export type BYOKProvider =
  | "anthropic"
  | "openai"
  | "gemini"
  | "deepseek"
  | "groq";

export interface TenantApiKeys {
  anthropic?: string;
  openai?: string;
  gemini?: string;
  deepseek?: string;
  groq?: string;
}

export interface TenantTierOverride {
  modelId: ModelId;
}

export interface TenantAIConfig {
  keys: TenantApiKeys;
  tierOverrides: Partial<Record<ModelTier, TenantTierOverride>>;
}

// Cache tenant config for 5 minutes
const configCache = new Map<
  string,
  { config: TenantAIConfig; expiresAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// All supported BYOK providers
export const BYOK_PROVIDERS: {
  id: BYOKProvider;
  label: string;
  description: string;
  keyPrefix?: string;
  envVar: string;
}[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "V3 (tani, szybki) + R1 (deep reasoning) — domyslny Tier 1-4",
    keyPrefix: "sk-",
    envVar: "DEEPSEEK_API_KEY",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Flash (Tier 1) + Pro (Tier 2-3) — duzy context window",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
  },
  {
    id: "groq",
    label: "Groq",
    description: "Llama 3.3 70B — darmowy, szybki, limit 30 RPM",
    keyPrefix: "gsk_",
    envVar: "GROQ_API_KEY",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    description: "Haiku (Tier 2) / Sonnet (Tier 3) / Opus (Tier 4) — premium",
    keyPrefix: "sk-ant-",
    envVar: "ANTHROPIC_API_KEY",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Codex 5.2 (code gen) + GPT-4o — fallback",
    keyPrefix: "sk-",
    envVar: "OPENAI_API_KEY",
  },
];

/**
 * Get the effective API key for a provider — tenant BYOK key > system env key.
 */
export async function getEffectiveApiKey(
  tenantId: string,
  provider: BYOKProvider,
): Promise<string | null> {
  const config = await getTenantAIConfig(tenantId);
  const tenantKey = config.keys[provider];
  if (tenantKey) return tenantKey;

  // Fall back to system env var
  const providerInfo = BYOK_PROVIDERS.find((p) => p.id === provider);
  return providerInfo ? process.env[providerInfo.envVar] || null : null;
}

/**
 * Get full tenant AI config (keys + tier overrides), cached.
 */
export async function getTenantAIConfig(
  tenantId: string,
): Promise<TenantAIConfig> {
  const cached = configCache.get(tenantId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.config;
  }

  try {
    const { getServiceSupabase } = await import("@/lib/supabase/service");
    const db = getServiceSupabase();

    const { data } = await db
      .from("exo_tenants")
      .select("iors_ai_config")
      .eq("id", tenantId)
      .single();

    const raw = (data?.iors_ai_config as Record<string, unknown>) || {};
    const providers =
      (raw.providers as Record<string, { api_key?: string }>) || {};

    // Extract keys from provider configs
    const keys: TenantApiKeys = {};
    for (const [name, cfg] of Object.entries(providers)) {
      if (cfg?.api_key) {
        keys[name as BYOKProvider] = cfg.api_key;
      }
    }

    // Extract tier overrides
    const tierOverrides: Partial<Record<ModelTier, TenantTierOverride>> = {};
    const rawOverrides = raw.tier_overrides as
      | Record<string, { modelId?: string }>
      | undefined;
    if (rawOverrides) {
      for (const [tier, override] of Object.entries(rawOverrides)) {
        if (override?.modelId) {
          tierOverrides[Number(tier) as ModelTier] = {
            modelId: override.modelId as ModelId,
          };
        }
      }
    }

    const config: TenantAIConfig = { keys, tierOverrides };

    configCache.set(tenantId, {
      config,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return config;
  } catch (err) {
    logger.warn("[BYOK] Failed to fetch tenant AI config:", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { keys: {}, tierOverrides: {} };
  }
}

/**
 * Get the model list for a tier, respecting tenant BYOK keys and overrides.
 *
 * Priority:
 * 1. Tenant tier override (explicit model choice)
 * 2. BYOK-unlocked models (e.g., Claude if tenant has Anthropic key)
 * 3. System defaults (TIER_MODELS from config)
 */
export function getModelsForTierWithBYOK(
  tier: ModelTier,
  tenantConfig: TenantAIConfig,
): ModelId[] {
  // 1. Explicit tier override
  const override = tenantConfig.tierOverrides[tier];
  if (override) {
    // Put override first, keep defaults as fallback
    const defaults = TIER_MODELS[tier].filter((m) => m !== override.modelId);
    return [override.modelId, ...defaults];
  }

  // 2. Build model list based on available keys
  const defaults = [...TIER_MODELS[tier]];
  const available: ModelId[] = [];

  // Add BYOK-unlocked models that aren't in defaults
  const byokModels = getBYOKUnlockedModels(tier, tenantConfig.keys);
  for (const model of byokModels) {
    if (!defaults.includes(model)) {
      available.push(model);
    }
  }

  // BYOK models first (user paid for them), then defaults
  return [...available, ...defaults];
}

/**
 * Get models unlocked by tenant BYOK keys for a given tier.
 */
function getBYOKUnlockedModels(
  tier: ModelTier,
  keys: TenantApiKeys,
): ModelId[] {
  const unlocked: ModelId[] = [];

  if (keys.anthropic) {
    const claudeByTier: Partial<Record<ModelTier, ModelId>> = {
      2: "claude-3-5-haiku",
      3: "claude-sonnet-4-5",
      4: "claude-opus-4-6",
    };
    const model = claudeByTier[tier];
    if (model) unlocked.push(model);
  }

  if (keys.openai) {
    if (tier === 3) unlocked.push("codex-5-2");
  }

  if (keys.deepseek) {
    if (tier <= 2) unlocked.push("deepseek-v3");
    if (tier >= 3) unlocked.push("deepseek-r1");
  }

  return unlocked;
}

/**
 * Check if a specific model is available given tenant keys + system keys.
 */
export function isModelAvailable(
  modelId: ModelId,
  tenantKeys: TenantApiKeys,
): boolean {
  const config = MODEL_CONFIGS[modelId];
  if (!config) return false;

  const provider = config.provider as BYOKProvider;

  // Check tenant BYOK key
  if (tenantKeys[provider]) return true;

  // Check system env var
  const providerInfo = BYOK_PROVIDERS.find((p) => p.id === provider);
  if (providerInfo && process.env[providerInfo.envVar]) return true;

  // Self-hosted is always available if configured
  if (config.provider === "selfhosted" && process.env.SELFHOSTED_API_URL)
    return true;

  return false;
}

/**
 * Invalidate cached config for a tenant (call after settings update).
 */
export function invalidateConfigCache(tenantId: string): void {
  configCache.delete(tenantId);
}
