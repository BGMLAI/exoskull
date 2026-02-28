import type { Metadata } from "next";
import { ChatView } from "@/components/stream/ChatView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Czat" };

/**
 * Chat page — primary interface.
 */
export default function ChatPage() {
  return <ChatView />;
}
