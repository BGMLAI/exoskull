import { redirect } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Clock,
  Brain,
  Users,
  TrendingUp,
  Shield,
  Database,
  FileText,
  ArrowLeft,
  Lightbulb,
} from "lucide-react";
import { verifyAdmin } from "@/lib/admin/auth";
import { AdminSidebarClient } from "@/components/admin/admin-sidebar-client";

const ADMIN_NAV = [
  { href: "/admin", label: "Command Center", icon: LayoutDashboard },
  { href: "/admin/cron", label: "Cron Jobs", icon: Clock },
  { href: "/admin/ai", label: "AI Router", icon: Brain },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/business", label: "Business KPIs", icon: TrendingUp },
  { href: "/admin/autonomy", label: "Autonomy", icon: Shield },
  { href: "/admin/data-pipeline", label: "Data Pipeline", icon: Database },
  { href: "/admin/insights", label: "Self-Optimize", icon: Lightbulb },
  { href: "/admin/logs", label: "Logs", icon: FileText },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await verifyAdmin();

  if (!admin) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-60 bg-sidebar-bg text-sidebar-text flex flex-col border-r border-sidebar-border">
        {/* Logo */}
        <div className="p-4 border-b border-sidebar-border">
          <Link href="/admin" className="flex items-center gap-2.5">
            <AdminSidebarClient type="logo" />
            <div>
              <h1 className="text-base font-heading font-bold">ExoSkull</h1>
              <p className="text-[10px] text-sidebar-muted tracking-wide uppercase">
                Admin Panel
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-muted hover:text-foreground transition-colors"
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Bottom: Theme switcher + Back link */}
        <div className="p-3 space-y-3 border-t border-sidebar-border">
          <AdminSidebarClient type="theme-switcher" />
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-muted hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-screen overflow-auto">{children}</main>
    </div>
  );
}
