"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle2,
  Circle,
  ExternalLink,
  RefreshCw,
  Plug,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface RigInfo {
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  connected: boolean;
  sync_status: string | null;
  last_sync_at: string | null;
  connected_at: string | null;
  has_oauth: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_LABELS: Record<string, string> = {
  health: "Zdrowie",
  productivity: "Produktywnosc",
  finance: "Finanse",
  social: "Social",
  smart_home: "Smart Home",
};

const CATEGORY_ORDER = [
  "health",
  "productivity",
  "finance",
  "social",
  "smart_home",
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function IntegrationsPage() {
  const [rigs, setRigs] = useState<RigInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  const fetchRigs = useCallback(async () => {
    try {
      const res = await fetch("/api/rigs");
      const data = await res.json();
      setRigs(data.rigs || []);
    } catch (error) {
      console.error("[Integrations] Fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRigs();
  }, [fetchRigs]);

  const handleConnect = async (slug: string) => {
    setConnecting(slug);
    // Redirect to OAuth flow
    window.location.href = `/api/rigs/${slug}/connect`;
  };

  const connectedRigs = rigs.filter((r) => r.connected);
  const availableRigs = rigs.filter((r) => !r.connected);

  // Group by category
  const groupedAvailable = CATEGORY_ORDER.reduce(
    (acc, cat) => {
      const items = availableRigs.filter((r) => r.category === cat);
      if (items.length > 0) acc[cat] = items;
      return acc;
    },
    {} as Record<string, RigInfo[]>,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Integracje</h1>
        <p className="text-muted-foreground">
          Polacz zewnetrzne serwisy z ExoSkull
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{connectedRigs.length}</p>
                <p className="text-sm text-muted-foreground">Polaczone</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Plug className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{rigs.length}</p>
                <p className="text-sm text-muted-foreground">Dostepne</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connected */}
      {connectedRigs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Polaczone</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connectedRigs.map((rig) => (
              <Card key={rig.slug}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{rig.icon}</span>
                      <div>
                        <h3 className="font-medium">{rig.name}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {rig.description}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0 shrink-0"
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      On
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {rig.last_sync_at
                        ? `Sync: ${new Date(rig.last_sync_at).toLocaleDateString("pl-PL")}`
                        : "Brak sync"}
                    </span>
                    <Badge variant="outline" className="text-xs border-0">
                      {CATEGORY_LABELS[rig.category] || rig.category}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Available by category */}
      {Object.entries(groupedAvailable).map(([category, categoryRigs]) => (
        <div key={category} className="space-y-3">
          <h2 className="text-lg font-semibold">
            {CATEGORY_LABELS[category] || category}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryRigs.map((rig) => (
              <Card key={rig.slug}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{rig.icon}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium">{rig.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {rig.description}
                      </p>
                    </div>
                  </div>
                  {rig.has_oauth ? (
                    <Button
                      size="sm"
                      className="w-full mt-3"
                      disabled={connecting === rig.slug}
                      onClick={() => handleConnect(rig.slug)}
                    >
                      {connecting === rig.slug ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Laczenie...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Polacz
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-3"
                      disabled
                    >
                      <Circle className="w-4 h-4 mr-2" />
                      Wkrotce
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* Empty */}
      {rigs.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Plug className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Brak integracji</h3>
            <p className="text-muted-foreground">
              Integracje pojawia sie wkrotce.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
