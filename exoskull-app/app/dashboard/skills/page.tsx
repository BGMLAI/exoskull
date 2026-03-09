import type { Metadata } from "next";
import { ChatView } from "@/components/stream/ChatView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Umiejętności" };

/**
 * K224: Skills page — chat-driven.
 * AI uses get_capabilities/self_extend_tool to manage skills.
 */
export default function SkillsPage() {
  return (
    <ChatView initialMessage="Pokaż moje aktywne umiejętności i co potrafisz." />
  );
}
