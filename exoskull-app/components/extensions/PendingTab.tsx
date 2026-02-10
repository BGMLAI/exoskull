"use client";

import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import type { UnifiedExtension } from "@/lib/extensions/types";
import { ExtensionCard } from "./ExtensionCard";

interface PendingTabProps {
  extensions: UnifiedExtension[];
}

export function PendingTab({ extensions }: PendingTabProps) {
  if (extensions.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-medium mb-2">
            Nic nie czeka na zatwierdzenie
          </h3>
          <p className="text-muted-foreground">
            Wygenerowane skille i aplikacje pojawia sie tutaj do zatwierdzenia.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Kliknij na element aby przejsc do szczegolowej strony zatwierdzania.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {extensions.map((ext) => (
          <ExtensionCard key={`${ext.type}-${ext.id}`} extension={ext} />
        ))}
      </div>
    </div>
  );
}
