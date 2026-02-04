"use client";

import { useState } from "react";
import {
  InboxSidebar,
  ConversationCenter,
  MessageDetails,
  type UnifiedMessage,
} from "@/components/inbox";
import { AcceptanceThread } from "./AcceptanceThread";

interface DashboardInboxViewProps {
  tenantId: string;
  assistantName?: string;
}

export function DashboardInboxView({
  tenantId,
  assistantName = "IORS",
}: DashboardInboxViewProps) {
  const [selectedMessage, setSelectedMessage] = useState<UnifiedMessage | null>(
    null,
  );

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[280px_1fr_320px]">
      {/* LEFT: Inbox Sidebar - hidden on mobile */}
      <div className="hidden lg:block h-full overflow-hidden">
        <InboxSidebar
          selectedId={selectedMessage?.id}
          onSelectMessage={setSelectedMessage}
        />
      </div>

      {/* CENTER: Conversation */}
      <div className="h-full overflow-hidden border-x">
        <ConversationCenter
          selectedMessage={selectedMessage}
          className="h-full"
        />
      </div>

      {/* RIGHT: Acceptance + Details */}
      <div className="hidden lg:flex flex-col h-full overflow-hidden">
        {/* Acceptance Thread - top half */}
        <div className="flex-1 min-h-0 overflow-y-auto border-b">
          <AcceptanceThread tenantId={tenantId} compact />
        </div>

        {/* Message Details - bottom half */}
        <div className="h-[300px] overflow-y-auto">
          <MessageDetails message={selectedMessage} />
        </div>
      </div>

      {/* Mobile: Bottom drawer for message selection */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-background border-t p-2">
        <button
          className="w-full py-2 text-sm text-muted-foreground"
          onClick={() => {
            // Could open a drawer/modal with InboxSidebar
          }}
        >
          Wybierz wiadomosc ({selectedMessage ? "1 wybrana" : "brak"})
        </button>
      </div>
    </div>
  );
}
