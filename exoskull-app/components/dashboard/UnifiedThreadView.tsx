"use client";

import { useState } from "react";
import { MessageSquare, Activity, Bell } from "lucide-react";
import { ConversationPanel } from "./ConversationPanel";
import { SystemActivityPanel } from "./SystemActivityPanel";
import { AcceptanceThread, useUnreadCount } from "./AcceptanceThread";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

type LeftTab = "conversation" | "system";
type MobileTab = "conversation" | "acceptance";

interface UnifiedThreadViewProps {
  tenantId: string;
  assistantName?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function UnifiedThreadView({
  tenantId,
  assistantName = "IORS",
}: UnifiedThreadViewProps) {
  const [leftTab, setLeftTab] = useState<LeftTab>("conversation");
  const [mobileTab, setMobileTab] = useState<MobileTab>("conversation");
  const unreadCount = useUnreadCount(tenantId);

  return (
    <div className="h-full flex flex-col">
      {/* Mobile tab switcher */}
      <div className="md:hidden flex border-b bg-card">
        <button
          onClick={() => setMobileTab("conversation")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2",
            mobileTab === "conversation"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground",
          )}
        >
          <MessageSquare className="h-4 w-4" />
          Rozmowa
        </button>
        <button
          onClick={() => setMobileTab("acceptance")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 relative",
            mobileTab === "acceptance"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground",
          )}
        >
          <Bell className="h-4 w-4" />
          Akceptacje
          {unreadCount > 0 && (
            <span className="absolute top-2 right-[calc(50%-40px)] px-1.5 py-0.5 bg-destructive text-destructive-foreground rounded-full text-[10px] font-bold min-w-[18px] text-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Desktop: split panel / Mobile: single panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel (conversation + system activity) */}
        <div
          className={cn(
            "flex flex-col border-r",
            // Desktop: always visible, takes ~60%
            "hidden md:flex md:flex-1",
            // Mobile: shown when conversation tab active
            mobileTab === "conversation" && "flex flex-1 md:flex",
          )}
        >
          {/* Left panel tabs (desktop only) */}
          <div className="hidden md:flex border-b bg-card/50">
            <button
              onClick={() => setLeftTab("conversation")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2",
                leftTab === "conversation"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Rozmowa
            </button>
            <button
              onClick={() => setLeftTab("system")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2",
                leftTab === "system"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Activity className="h-3.5 w-3.5" />
              System
            </button>
          </div>

          {/* Left panel content */}
          <div className="flex-1 overflow-hidden">
            {leftTab === "conversation" ? (
              <ConversationPanel compact />
            ) : (
              <SystemActivityPanel tenantId={tenantId} />
            )}
          </div>
        </div>

        {/* Right panel (acceptance thread) */}
        <div
          className={cn(
            "bg-card/30",
            // Desktop: always visible, fixed width
            "hidden md:flex md:w-[380px] lg:w-[420px]",
            // Mobile: shown when acceptance tab active
            mobileTab === "acceptance" &&
              "flex flex-1 md:w-[380px] lg:w-[420px]",
          )}
        >
          <AcceptanceThread tenantId={tenantId} className="w-full" />
        </div>
      </div>
    </div>
  );
}
