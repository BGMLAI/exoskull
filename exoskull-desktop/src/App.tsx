import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import DashboardLayout from "./layouts/DashboardLayout";
import ChatPage from "./pages/ChatPage";
import GoalsPage from "./pages/GoalsPage";
import TasksPage from "./pages/TasksPage";
import KnowledgePage from "./pages/KnowledgePage";
import RecallPage from "./pages/RecallPage";
import AppsPage from "./pages/AppsPage";
import SettingsPage from "./pages/SettingsPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import LoginPage from "./pages/LoginPage";

interface AuthState {
  token: string | null;
  tenant_id: string | null;
  user_email: string | null;
  is_authenticated: boolean;
}

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<AuthState>("get_auth_status")
      .then(setAuth)
      .catch(() =>
        setAuth({
          token: null,
          tenant_id: null,
          user_email: null,
          is_authenticated: false,
        })
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-lg text-muted-foreground">
          Loading ExoSkull...
        </div>
      </div>
    );
  }

  if (!auth?.is_authenticated) {
    return <LoginPage onLogin={setAuth} />;
  }

  return (
    <DashboardLayout userEmail={auth.user_email || ""}>
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        <Route path="/recall" element={<RecallPage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
      </Routes>
    </DashboardLayout>
  );
}
