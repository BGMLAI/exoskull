"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AddWidgetButtonProps {
  onClick: () => void;
}

export function AddWidgetButton({ onClick }: AddWidgetButtonProps) {
  return (
    <div className="flex justify-center py-4">
      <Button variant="outline" size="sm" onClick={onClick} className="gap-2">
        <Plus className="h-4 w-4" />
        Dodaj widget
      </Button>
    </div>
  );
}
