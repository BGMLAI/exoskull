"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield } from "lucide-react";
import { useAutonomyData } from "@/components/dashboard/autonomy/useAutonomyData";
import { OverviewTab } from "@/components/dashboard/autonomy/OverviewTab";
import { PermissionsTab } from "@/components/dashboard/autonomy/PermissionsTab";
import { InterventionsTab } from "@/components/dashboard/autonomy/InterventionsTab";
import { GuardianTab } from "@/components/dashboard/autonomy/GuardianTab";
import { ActivityLogTab } from "@/components/dashboard/autonomy/ActivityLogTab";

export function AutonomySection() {
  const data = useAutonomyData();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Autonomia IORS
        </CardTitle>
        <CardDescription>
          Granty, interwencje i straznik wartosci
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="overview">
            <TabsList className="flex-wrap">
              <TabsTrigger value="overview">Przeglad</TabsTrigger>
              <TabsTrigger value="permissions">Uprawnienia</TabsTrigger>
              <TabsTrigger value="interventions" className="relative">
                Interwencje
                {data.pending.length > 0 && (
                  <Badge
                    variant="destructive"
                    className="ml-1 h-5 min-w-[1.25rem] px-1 text-xs"
                  >
                    {data.pending.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="guardian">Straznik</TabsTrigger>
              <TabsTrigger value="activity">Aktywnosc</TabsTrigger>
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
            <TabsContent value="activity">
              <ActivityLogTab data={data} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
