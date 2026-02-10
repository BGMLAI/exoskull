"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useExtensions } from "@/lib/extensions/hooks";
import { ExtensionStats } from "@/components/extensions/ExtensionStats";
import { ActiveTab } from "@/components/extensions/ActiveTab";
import { MarketplaceTab } from "@/components/extensions/MarketplaceTab";
import { GenerateTab } from "@/components/extensions/GenerateTab";
import { PendingTab } from "@/components/extensions/PendingTab";

// ============================================================================
// INNER COMPONENT (needs useSearchParams inside Suspense)
// ============================================================================

function SkillsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") || "active";

  const {
    active,
    marketplace,
    pending,
    stats,
    loading,
    userId,
    refresh,
    installMod,
    archiveSkill,
  } = useExtensions();

  function handleTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`/dashboard/skills?${params.toString()}`, { scroll: false });
  }

  async function handleArchive(id: string) {
    if (!confirm("Czy na pewno chcesz zarchiwizowac ten skill?")) return;
    await archiveSkill(id);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Tabs
      defaultValue={initialTab}
      onValueChange={handleTabChange}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Skills</h1>
          <p className="text-muted-foreground">
            Mody, skille i aplikacje rozszerzajace ExoSkull
          </p>
        </div>
        <TabsList>
          <TabsTrigger value="active">Aktywne</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
          <TabsTrigger value="generate">Generuj AI</TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5">
            Oczekujace
            {stats.pendingCount > 0 && (
              <Badge variant="secondary" className="h-5 min-w-5 px-1 text-xs">
                {stats.pendingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Stats */}
      <ExtensionStats
        totalActive={stats.totalActive}
        modCount={stats.modCount}
        skillCount={stats.skillCount}
        appCount={stats.appCount}
      />

      {/* Tab content */}
      <TabsContent value="active">
        <ActiveTab extensions={active} onArchive={handleArchive} />
      </TabsContent>

      <TabsContent value="marketplace">
        <MarketplaceTab templates={marketplace} onInstall={installMod} />
      </TabsContent>

      <TabsContent value="generate">
        <GenerateTab userId={userId} onGenerated={refresh} />
      </TabsContent>

      <TabsContent value="pending">
        <PendingTab extensions={pending} />
      </TabsContent>
    </Tabs>
  );
}

// ============================================================================
// PAGE (Suspense boundary for useSearchParams)
// ============================================================================

export default function SkillsPage() {
  return (
    <div className="p-4 md:p-8 overflow-y-auto h-full">
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <SkillsPageInner />
      </Suspense>
    </div>
  );
}
