import type { Metadata } from "next";
import { ChatLayout } from "@/components/stream/ChatLayout";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <div className="h-[calc(100vh-4rem)]">
      <ChatLayout />
    </div>
  );
}
