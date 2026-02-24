import { NavLink } from "react-router-dom";
import {
  MessageSquare,
  Target,
  CheckSquare,
  BookOpen,
  Eye,
  Grid3X3,
  Settings,
  Plug,
  LogOut,
  Skull,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

const navItems = [
  { to: "/chat", icon: MessageSquare, label: "Chat" },
  { to: "/goals", icon: Target, label: "Goals" },
  { to: "/tasks", icon: CheckSquare, label: "Tasks" },
  { to: "/knowledge", icon: BookOpen, label: "Knowledge" },
  { to: "/recall", icon: Eye, label: "Recall" },
  { to: "/apps", icon: Grid3X3, label: "Apps" },
  { to: "/integrations", icon: Plug, label: "Integrations" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

interface Props {
  children: React.ReactNode;
  userEmail: string;
}

export default function DashboardLayout({ children, userEmail }: Props) {
  const handleLogout = async () => {
    await invoke("logout");
    window.location.reload();
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-16 flex-col items-center border-r border-border bg-card py-4 lg:w-56">
        {/* Logo */}
        <div className="mb-6 flex items-center gap-2 px-3">
          <Skull className="h-7 w-7 text-primary" />
          <span className="hidden text-lg font-bold lg:block">ExoSkull</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-1 px-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="mt-auto border-t border-border px-2 pt-4">
          <div className="hidden truncate px-3 text-xs text-muted-foreground lg:block">
            {userEmail}
          </div>
          <button
            onClick={handleLogout}
            className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="hidden lg:block">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
