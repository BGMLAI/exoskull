import type { Metadata } from "next";
import { UnifiedStream } from "@/components/stream/UnifiedStream";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <div className="h-[calc(100vh-4rem)]">
      <UnifiedStream />
    </div>
  );
}
