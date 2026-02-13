import { redirect } from "next/navigation";

/**
 * Chat page — redirects to main dashboard.
 * Chat River is now the primary interface on /dashboard.
 */
export default function ChatPage() {
  redirect("/dashboard");
}
