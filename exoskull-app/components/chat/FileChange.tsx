"use client";

import { Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileChangeProps {
  path: string;
  action: "created" | "modified" | "deleted";
}

const actionConfig = {
  created: {
    icon: Plus,
    label: "Created",
    textColor: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
    iconBg: "bg-green-500/15",
  },
  modified: {
    icon: Pencil,
    label: "Modified",
    textColor: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    iconBg: "bg-amber-500/15",
  },
  deleted: {
    icon: Trash2,
    label: "Deleted",
    textColor: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
    iconBg: "bg-red-500/15",
  },
};

export function FileChange({ path, action }: FileChangeProps) {
  const config = actionConfig[action];
  const Icon = config.icon;

  const handleClick = () => {
    // TODO: Open code sidebar with this file
    console.log(`[FileChange] Open file: ${path} (${action})`);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "my-1 flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs w-full text-left",
        "hover:brightness-110 transition-all cursor-pointer",
        config.bgColor,
        config.borderColor,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center w-5 h-5 rounded shrink-0",
          config.iconBg,
        )}
      >
        <Icon className={cn("w-3 h-3", config.textColor)} />
      </div>
      <span className={cn("font-mono truncate", config.textColor)}>{path}</span>
      <span className="text-zinc-500 ml-auto shrink-0">{config.label}</span>
    </button>
  );
}
