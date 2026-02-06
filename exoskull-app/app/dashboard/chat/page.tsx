import type { Metadata } from "next";
import { ConversationPanel } from "@/components/dashboard/ConversationPanel";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <div className="h-[calc(100vh-4rem)]">
      <ConversationPanel />
    </div>
  );
}
