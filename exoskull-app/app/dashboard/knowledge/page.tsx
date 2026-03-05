import type { Metadata } from "next";
import { ChatView } from "@/components/stream/ChatView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wiedza" };

/**
 * K224: Knowledge page — chat-driven.
 * AI uses list_knowledge/search_brain/import_url tools.
 */
export default function KnowledgePage() {
  return (
    <ChatView initialMessage="Pokaż moją bazę wiedzy — jakie dokumenty mam zapisane?" />
  );
}
