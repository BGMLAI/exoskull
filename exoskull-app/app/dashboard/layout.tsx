import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Home, CheckSquare, Brain, Settings, Mic, Clock, FileText, Menu } from 'lucide-react'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/dashboard/tasks', label: 'Zadania', icon: CheckSquare },
  { href: '/dashboard/agents', label: 'Agenci', icon: Brain },
  { href: '/dashboard/voice', label: 'Rozmowa', icon: Mic },
  { href: '/dashboard/schedule', label: 'Harmonogram', icon: Clock },
  { href: '/dashboard/knowledge', label: 'Wiedza', icon: FileText },
]

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
      <aside className="hidden md:flex w-64 bg-card border-r flex-col">
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Exoskull</h1>
            <p className="text-sm text-muted-foreground">Life OS</p>
          </div>
          <ThemeToggle />
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-accent transition-colors"
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          ))}
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

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-card">
          <div>
            <p className="text-base font-semibold">Exoskull</p>
            <p className="text-xs text-muted-foreground">Life OS</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {user.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {NAV_ITEMS.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    <span>Ustawienia</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <form action="/api/auth/signout" method="post" className="w-full">
                  <DropdownMenuItem asChild>
                    <button className="w-full text-left">Wyloguj</button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <DashboardShell tenantId={user.id}>
            {children}
          </DashboardShell>
        </main>
      </div>
    </div>
  )
}
