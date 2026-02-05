"use client";

/**
 * Admin Autonomy — Full L16 Control Center
 *
 * Uses the same 5-tab control center from dashboard/autonomy,
 * now moved here as an admin-only tool.
 */

import { useState } from "react";
import { Shield, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAutonomyData } from "@/components/dashboard/autonomy/useAutonomyData";
import { OverviewTab } from "@/components/dashboard/autonomy/OverviewTab";
import { PermissionsTab } from "@/components/dashboard/autonomy/PermissionsTab";
import { InterventionsTab } from "@/components/dashboard/autonomy/InterventionsTab";
import { GuardianTab } from "@/components/dashboard/autonomy/GuardianTab";
import { ActivityLogTab } from "@/components/dashboard/autonomy/ActivityLogTab";

export default function AdminAutonomyPage() {
  const data = useAutonomyData();
  const [activeTab, setActiveTab] = useState("overview");

  if (data.loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-7 h-7" />
          Centrum Autonomii
        </h1>
        <p className="text-muted-foreground">
          Kontroluj co ExoSkull moze robic samodzielnie
        </p>
      </div>

      {/* Error Banner */}
      {data.error && (
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg text-sm">
          {data.error}
        </div>
      )}

      {/* Tabs — L16 Control Center */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Przeglad</TabsTrigger>
          <TabsTrigger value="permissions">Uprawnienia</TabsTrigger>
          <TabsTrigger value="interventions" className="relative">
            Interwencje
            {(data.interventions?.filter((i: any) => i.status === "pending")
              .length ?? 0) > 0 && (
              <Badge
                variant="destructive"
                className="ml-1 h-5 w-5 p-0 text-[10px] flex items-center justify-center"
              >
                {
                  data.interventions?.filter((i: any) => i.status === "pending")
                    .length
                }
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="guardian">Guardian</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab data={data} />
        </TabsContent>
        <TabsContent value="permissions">
          <PermissionsTab data={data} />
        </TabsContent>
        <TabsContent value="interventions">
          <InterventionsTab data={data} />
        </TabsContent>
        <TabsContent value="guardian">
          <GuardianTab data={data} />
        </TabsContent>
        <TabsContent value="log">
          <ActivityLogTab data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
