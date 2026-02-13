"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoopCard } from "./LoopCard";
import { CampaignCard } from "./CampaignCard";
import { QuestCard } from "./QuestCard";
import { OpCard } from "./OpCard";
import { Loop, Campaign, Quest, Op } from "@/lib/types/knowledge";
import { Plus, ChevronLeft } from "lucide-react";

interface HierarchyViewProps {
  // Data
  loops: Loop[];
  campaigns: Campaign[];
  quests: Quest[];
  ops: Op[];
  // Loading states
  loopsLoading: boolean;
  campaignsLoading: boolean;
  questsLoading: boolean;
  opsLoading: boolean;
  // Selection
  selectedLoop: Loop | null;
  selectedCampaign: Campaign | null;
  selectedQuest: Quest | null;
  // Handlers
  onSelectLoop: (loop: Loop | null) => void;
  onSelectCampaign: (campaign: Campaign | null) => void;
  onSelectQuest: (quest: Quest | null) => void;
  onEditLoop: (loop: Loop) => void;
  onEditCampaign: (campaign: Campaign) => void;
  onEditQuest: (quest: Quest) => void;
  onEditOp: (op: Op) => void;
  onDeleteLoop?: (loop: Loop) => void;
  onDeleteCampaign?: (campaign: Campaign) => void;
  onDeleteQuest?: (quest: Quest) => void;
  onDeleteOp?: (op: Op) => void;
  onToggleOpStatus: (op: Op) => void;
  onAddLoop: () => void;
  onAddCampaign: () => void;
  onAddQuest: () => void;
  onAddOp: () => void;
}

function ColumnSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function EmptyState({
  message,
  onAdd,
}: {
  message: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      <Button variant="outline" size="sm" onClick={onAdd}>
        <Plus className="h-4 w-4 mr-2" />
        Dodaj
      </Button>
    </div>
  );
}

export function HierarchyView({
  loops,
  campaigns,
  quests,
  ops,
  loopsLoading,
  campaignsLoading,
  questsLoading,
  opsLoading,
  selectedLoop,
  selectedCampaign,
  selectedQuest,
  onSelectLoop,
  onSelectCampaign,
  onSelectQuest,
  onEditLoop,
  onEditCampaign,
  onEditQuest,
  onEditOp,
  onDeleteLoop,
  onDeleteCampaign,
  onDeleteQuest,
  onDeleteOp,
  onToggleOpStatus,
  onAddLoop,
  onAddCampaign,
  onAddQuest,
  onAddOp,
}: HierarchyViewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Column 1: Loops */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Loopy</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onAddLoop}
              aria-label="Dodaj loop"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto">
          {loopsLoading ? (
            <ColumnSkeleton />
          ) : loops.length === 0 ? (
            <EmptyState message="Brak loopow" onAdd={onAddLoop} />
          ) : (
            loops.map((loop) => (
              <LoopCard
                key={loop.id}
                loop={loop}
                isSelected={selectedLoop?.id === loop.id}
                onClick={() =>
                  onSelectLoop(selectedLoop?.id === loop.id ? null : loop)
                }
                onEdit={() => onEditLoop(loop)}
                onDelete={onDeleteLoop ? () => onDeleteLoop(loop) : undefined}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Column 2: Campaigns */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedLoop && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onSelectLoop(null)}
                  aria-label="Wroc"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <CardTitle className="text-sm font-medium">
                Kampanie{" "}
                {selectedLoop && `(${selectedLoop.icon} ${selectedLoop.name})`}
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onAddCampaign}
              aria-label="Dodaj kampanie"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto">
          {campaignsLoading ? (
            <ColumnSkeleton />
          ) : campaigns.length === 0 ? (
            <EmptyState
              message={
                selectedLoop
                  ? "Brak kampanii w tym loopie"
                  : "Wybierz loop lub dodaj kampanie"
              }
              onAdd={onAddCampaign}
            />
          ) : (
            campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                loop={loops.find((l) => l.slug === campaign.loop_slug)}
                isSelected={selectedCampaign?.id === campaign.id}
                onClick={() =>
                  onSelectCampaign(
                    selectedCampaign?.id === campaign.id ? null : campaign,
                  )
                }
                onEdit={() => onEditCampaign(campaign)}
                onDelete={
                  onDeleteCampaign
                    ? () => onDeleteCampaign(campaign)
                    : undefined
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Column 3: Quests */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedCampaign && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onSelectCampaign(null)}
                  aria-label="Wroc"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <CardTitle className="text-sm font-medium">
                Questy{" "}
                {selectedCampaign &&
                  `(${selectedCampaign.title.slice(0, 15)}...)`}
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onAddQuest}
              aria-label="Dodaj quest"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto">
          {questsLoading ? (
            <ColumnSkeleton />
          ) : quests.length === 0 ? (
            <EmptyState
              message={
                selectedCampaign
                  ? "Brak questow w tej kampanii"
                  : "Wybierz kampanie lub dodaj quest"
              }
              onAdd={onAddQuest}
            />
          ) : (
            quests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                loop={loops.find((l) => l.slug === quest.loop_slug)}
                isSelected={selectedQuest?.id === quest.id}
                onClick={() =>
                  onSelectQuest(selectedQuest?.id === quest.id ? null : quest)
                }
                onEdit={() => onEditQuest(quest)}
                onDelete={
                  onDeleteQuest ? () => onDeleteQuest(quest) : undefined
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Column 4: Ops */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedQuest && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onSelectQuest(null)}
                  aria-label="Wroc"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <CardTitle className="text-sm font-medium">
                Opy{" "}
                {selectedQuest && `(${selectedQuest.title.slice(0, 15)}...)`}
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onAddOp}
              aria-label="Dodaj op"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto">
          {opsLoading ? (
            <ColumnSkeleton />
          ) : ops.length === 0 ? (
            <EmptyState
              message={
                selectedQuest
                  ? "Brak opow w tym quescie"
                  : "Wybierz quest lub dodaj op"
              }
              onAdd={onAddOp}
            />
          ) : (
            ops.map((op) => (
              <OpCard
                key={op.id}
                op={op}
                loop={loops.find((l) => l.slug === op.loop_slug)}
                onEdit={() => onEditOp(op)}
                onDelete={onDeleteOp ? () => onDeleteOp(op) : undefined}
                onToggleStatus={() => onToggleOpStatus(op)}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
