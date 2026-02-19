"use client";

import { useState, useEffect } from "react";
import { AppCard } from "./AppCard";
import { Search, Loader2 } from "lucide-react";

interface AppMod {
  id: string;
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  installed: boolean;
}

/**
 * AppGallery — Grid of installed and available apps/mods.
 * Fetches from /api/apps or /api/mods.
 */
export function AppGallery() {
  const [apps, setApps] = useState<AppMod[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadApps() {
      try {
        // Try /api/mods first (mod registry), fallback to /api/apps
        const res = await fetch("/api/mods");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const list = data.mods || data.apps || data || [];
        setApps(
          list.map((a: Record<string, unknown>) => ({
            id: (a.id as string) || (a.slug as string),
            slug: (a.slug as string) || (a.id as string),
            name: a.name as string,
            description: a.description as string | undefined,
            icon: a.icon as string | undefined,
            category: a.category as string | undefined,
            installed:
              (a.installed as boolean) ?? (a.is_active as boolean) ?? false,
          })),
        );
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadApps();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = search
    ? apps.filter(
        (a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.description?.toLowerCase().includes(search.toLowerCase()),
      )
    : apps;

  const installed = filtered.filter((a) => a.installed);
  const available = filtered.filter((a) => !a.installed);

  return (
    <div className="p-4 md:p-8 space-y-6 overflow-y-auto h-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Aplikacje</h1>
          <p className="text-sm text-muted-foreground">
            Zainstalowane i dostepne aplikacje ExoSkull
          </p>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj aplikacji..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : apps.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">Brak zainstalowanych aplikacji</p>
          <p className="text-sm">
            Powiedz &quot;Zbuduj aplikacje do sledzenia snu&quot; aby utworzyc
            nowa.
          </p>
        </div>
      ) : (
        <>
          {installed.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                Zainstalowane ({installed.length})
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {installed.map((app) => (
                  <AppCard
                    key={app.id}
                    name={app.name}
                    description={app.description}
                    icon={app.icon}
                    installed
                    onOpen={() =>
                      window.location.assign(`/dashboard/mods/${app.slug}`)
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {available.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                Dostepne ({available.length})
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {available.map((app) => (
                  <AppCard
                    key={app.id}
                    name={app.name}
                    description={app.description}
                    icon={app.icon}
                    installed={false}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
