"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Campaign, CAMPAIGN_STATUS_LABELS, Loop } from "@/lib/types/knowledge";
import { Calendar, Target, ChevronRight, MoreHorizontal } from "lucide-react";

interface CampaignCardProps {
  campaign: Campaign;
  loop?: Loop;
  isSelected?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  className?: string;
}

export function CampaignCard({
  campaign,
  loop,
  isSelected,
  onClick,
  onEdit,
  className,
}: CampaignCardProps) {
  const statusInfo = CAMPAIGN_STATUS_LABELS[campaign.status];
  const progress =
    campaign.total_quests > 0
      ? Math.round((campaign.completed_quests / campaign.total_quests) * 100)
      : 0;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
        isSelected && "border-primary ring-2 ring-primary/20",
        className,
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            {loop && <span className="text-lg">{loop.icon}</span>}
            {campaign.title}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Badge className={cn("text-xs text-white", statusInfo.color)}>
              {statusInfo.label}
            </Badge>
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                aria-label="Edytuj kampanie"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {campaign.vision && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {campaign.vision}
          </p>
        )}

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Postep</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              <span>
                {campaign.completed_quests}/{campaign.total_quests} quests
              </span>
            </div>
            {campaign.target_date && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>
                  {new Date(campaign.target_date).toLocaleDateString("pl-PL")}
                </span>
              </div>
            )}
          </div>
          <ChevronRight className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}
