// =====================================================
// TOOL RIG HELPERS - Resolve connected providers
// =====================================================

import { createClient } from '@supabase/supabase-js';
import { RigConnection } from '@/lib/rigs/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type ToolProvider = 'google' | 'google-workspace' | 'microsoft-365';

const DEFAULT_PROVIDER_ORDER: ToolProvider[] = ['google', 'google-workspace', 'microsoft-365'];

const PROVIDER_ALIASES: Record<string, ToolProvider> = {
  google: 'google',
  'google-workspace': 'google-workspace',
  workspace: 'google-workspace',
  gmail: 'google',
  'microsoft-365': 'microsoft-365',
  microsoft: 'microsoft-365',
  outlook: 'microsoft-365',
};

export function normalizeProvider(value?: string | null): ToolProvider | null {
  if (!value) return null;
  const key = value.toLowerCase().trim();
  return PROVIDER_ALIASES[key] || null;
}

export async function getRigConnection(
  tenantId: string,
  rigSlug: ToolProvider
): Promise<RigConnection | null> {
  try {
    const { data, error } = await supabase
      .from('exo_rig_connections')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('rig_slug', rigSlug)
      .eq('sync_status', 'success')
      .single();

    if (error || !data) return null;
    if (!data.access_token) return null;
    return data as RigConnection;
  } catch (error) {
    console.error('[ToolRigs] Failed to load rig connection:', error);
    return null;
  }
}

export async function resolveProvider(
  tenantId: string,
  preferred?: string | null,
  allowedProviders: ToolProvider[] = DEFAULT_PROVIDER_ORDER
): Promise<{ provider: ToolProvider; connection: RigConnection } | null> {
  const preferredProvider = normalizeProvider(preferred);

  if (preferredProvider && allowedProviders.includes(preferredProvider)) {
    const connection = await getRigConnection(tenantId, preferredProvider);
    if (connection) {
      return { provider: preferredProvider, connection };
    }
  }

  for (const provider of allowedProviders) {
    const connection = await getRigConnection(tenantId, provider);
    if (connection) {
      return { provider, connection };
    }
  }

  return null;
}
