import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Home, CheckSquare, Brain, Settings, Mic, Clock, FileText } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard/DashboardShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold">Exoskull</h1>
          <p className="text-sm text-muted-foreground">Life OS</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-accent transition-colors"
          >
            <Home className="w-5 h-5" />
            <span>Dashboard</span>
          </Link>

          <Link
            href="/dashboard/tasks"
            className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-accent transition-colors"
          >
            <CheckSquare className="w-5 h-5" />
            <span>Zadania</span>
          </Link>

          <Link
            href="/dashboard/agents"
            className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-accent transition-colors"
          >
            <Brain className="w-5 h-5" />
            <span>Agenci</span>
          </Link>

          <Link
            href="/dashboard/voice"
            className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-accent transition-colors"
          >
            <Mic className="w-5 h-5" />
            <span>Rozmowa</span>
          </Link>

          <Link
            href="/dashboard/schedule"
            className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-accent transition-colors"
          >
            <Clock className="w-5 h-5" />
            <span>Harmonogram</span>
          </Link>

          <Link
            href="/dashboard/knowledge"
            className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-accent transition-colors"
          >
            <FileText className="w-5 h-5" />
            <span>Wiedza</span>
          </Link>
        </nav>

        <div className="p-4 border-t">
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-accent transition-colors"
          >
            <Settings className="w-5 h-5" />
            <span>Ustawienia</span>
          </Link>

          <div className="mt-4 px-4">
            <p className="text-sm font-medium">{user.email}</p>
            <form action="/api/auth/signout" method="post">
              <button className="text-sm text-muted-foreground hover:text-foreground mt-1">
                Wyloguj
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <DashboardShell tenantId={user.id}>
          {children}
        </DashboardShell>
      </main>
    </div>
  )
}
