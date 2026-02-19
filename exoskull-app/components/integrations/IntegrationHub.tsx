"use client";

import { useState, useEffect } from "react";
import { RIG_DEFINITIONS } from "@/lib/rigs/index";
import { IntegrationCard } from "./IntegrationCard";
import { ChannelManager } from "./ChannelManager";
import { Loader2 } from "lucide-react";

interface RigStatus {
  slug: string;
  connected: boolean;
  last_sync?: string;
}

/**
 * IntegrationHub — Grid layout: Connected rigs, Available rigs, Channel toggles.
 * Reads rig definitions from RIG_DEFINITIONS and status from API.
 */
export function IntegrationHub() {
  const [statuses, setStatuses] = useState<Record<string, RigStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadStatuses() {
      try {
        const res = await fetch("/api/integrations/status");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const map: Record<string, RigStatus> = {};
        for (const s of data.integrations || data || []) {
          map[s.slug] = s;
        }
        setStatuses(map);
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadStatuses();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnect = (slug: string) => {
    // Navigate to OAuth connect endpoint
    window.location.href = `/api/rigs/${slug}/connect`;
  };

  const rigs = Object.entries(RIG_DEFINITIONS).map(([key, def]) => ({
    slug: key,
    name: def.name,
    description: def.description,
    icon: def.icon,
    category: def.category,
    hasOAuth: !!def.oauth,
    connected: statuses[key]?.connected || false,
  }));

  const connected = rigs.filter((r) => r.connected);
  const available = rigs.filter((r) => !r.connected);

  return (
    <div className="p-4 md:p-8 space-y-8 overflow-y-auto h-full">
      <div>
        <h1 className="text-2xl font-bold">Integracje</h1>
        <p className="text-sm text-muted-foreground">
          Polacz serwisy zewnetrzne i zarzadzaj kanalami komunikacji
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Connected */}
          {connected.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                Polaczone ({connected.length})
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {connected.map((rig) => (
                  <IntegrationCard
                    key={rig.slug}
                    {...rig}
                    onConnect={handleConnect}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Available */}
          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
              Dostepne ({available.length})
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {available.map((rig) => (
                <IntegrationCard
                  key={rig.slug}
                  {...rig}
                  onConnect={handleConnect}
                />
              ))}
            </div>
          </section>

          {/* Channels */}
          <section className="border-t pt-6">
            <ChannelManager />
          </section>
        </>
      )}
    </div>
  );
}
