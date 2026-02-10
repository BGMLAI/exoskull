"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, LayoutGrid } from "lucide-react";
import { GenerateSkillDialog } from "./GenerateSkillDialog";
import { GenerateAppDialog } from "./GenerateAppDialog";
import { SkillSuggestionsWidget } from "@/components/skills/SkillSuggestionsWidget";

interface GenerateTabProps {
  userId: string | null;
  onGenerated: () => void;
}

export function GenerateTab({ userId, onGenerated }: GenerateTabProps) {
  return (
    <div className="space-y-6">
      {/* Two generation cards side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Skill generation */}
        <Card className="border-purple-200 dark:border-purple-800/50">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-medium">Generuj Skill</h3>
                <p className="text-sm text-muted-foreground">
                  AI wygeneruje logike i automatyzacje
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Opisz co chcesz automatyzowac lub analizowac. AI stworzy kod ktory
              bedzie dzialal jako rozszerzenie ExoSkull. Wymaga zatwierdzenia
              przed aktywacja.
            </p>
            <GenerateSkillDialog onGenerated={onGenerated} />
          </CardContent>
        </Card>

        {/* App generation */}
        <Card className="border-amber-200 dark:border-amber-800/50">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <LayoutGrid className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-medium">Buduj Aplikacje</h3>
                <p className="text-sm text-muted-foreground">
                  AI stworzy formularz, tabele i wykresy
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Opisz co chcesz sledzic. AI stworzy aplikacje z widgetem na
              dashboardzie, formularzem do wprowadzania danych i wykresami.
            </p>
            <GenerateAppDialog onGenerated={onGenerated} />
          </CardContent>
        </Card>
      </div>

      {/* AI Suggestions */}
      {userId && (
        <SkillSuggestionsWidget
          userId={userId}
          onSuggestionAccepted={onGenerated}
        />
      )}
    </div>
  );
}
