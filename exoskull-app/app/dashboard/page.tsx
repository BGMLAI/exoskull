import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { queryDatabase } from '@/lib/db-direct'
import { TasksWidget } from '@/components/widgets/TasksWidget'
import { ConversationsWidget } from '@/components/widgets/ConversationsWidget'
import { QuickActionsWidget } from '@/components/widgets/QuickActionsWidget'
import { IntegrationsWidget } from '@/components/widgets/IntegrationsWidget'
import { TaskStats, ConversationStats } from '@/lib/dashboard/types'
import { Zap, Brain, Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Get user data
  const { data: { user } } = await supabase.auth.getUser()

  // Get task stats
  let taskStats: TaskStats = { total: 0, pending: 0, in_progress: 0, done: 0, blocked: 0 }
  try {
    const tasks = await queryDatabase('exo_tasks', {
      filter: { tenant_id: user?.id }
    })

    if (tasks) {
      taskStats = {
        total: tasks.length,
        pending: tasks.filter((t: any) => t.status === 'pending').length,
        in_progress: tasks.filter((t: any) => t.status === 'in_progress').length,
        done: tasks.filter((t: any) => t.status === 'done').length,
        blocked: tasks.filter((t: any) => t.status === 'blocked').length
      }
    }
  } catch (e: any) {
    console.error('Failed to load tasks:', e)
  }

  // Get conversation stats
  let conversationStats: ConversationStats = { totalToday: 0, totalWeek: 0, avgDuration: 0 }
  try {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const startOfWeek = new Date(now.setDate(now.getDate() - 7)).toISOString()

    const conversations = await queryDatabase('exo_conversations', {
      filter: { tenant_id: user?.id }
    })

    if (conversations) {
      const todayConvs = conversations.filter((c: any) => c.started_at >= startOfDay)
      const weekConvs = conversations.filter((c: any) => c.started_at >= startOfWeek)
      const durations = conversations
        .filter((c: any) => c.duration_seconds)
        .map((c: any) => c.duration_seconds)

      conversationStats = {
        totalToday: todayConvs.length,
        totalWeek: weekConvs.length,
        avgDuration: durations.length > 0
          ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length)
          : 0
      }
    }
  } catch (e: any) {
    console.error('Failed to load conversations:', e)
  }

  // Get agents count
  let agentsCount = 0
  try {
    const agents = await queryDatabase('exo_agents', {
      filter: { is_global: true }
    })
    agentsCount = agents?.length || 0
  } catch (e: any) {
    console.error('Failed to load agents:', e)
    agentsCount = 5 // Fallback
  }

  // Get rig connections
  let rigConnections: any[] = []
  try {
    const connections = await queryDatabase('exo_rig_connections', {
      filter: { tenant_id: user?.id }
    })
    rigConnections = connections || []
  } catch (e: any) {
    console.error('Failed to load rig connections:', e)
  }

  // Get greeting based on time
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Dzien dobry' : hour < 18 ? 'Witaj' : 'Dobry wieczor'

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{greeting}!</h1>
        <p className="text-muted-foreground">Oto Twoj dzisiejszy przeglad</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <TasksWidget stats={taskStats} />
        <ConversationsWidget stats={conversationStats} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Agenci
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-2">
              {agentsCount}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                aktywnych
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Asystenci pracujacy w tle
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions & Integrations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <QuickActionsWidget />
        <IntegrationsWidget connections={rigConnections} />
      </div>

      {/* Check-ins */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Nastepne check-iny
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="font-medium text-sm">Poranny check-in</p>
                <p className="text-xs text-muted-foreground">Jak sie dzis czujesz?</p>
              </div>
              <a
                href="/dashboard/voice"
                className="text-sm text-primary hover:underline"
              >
                Rozpocznij
              </a>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="font-medium text-sm">Wieczorna refleksja</p>
                <p className="text-xs text-muted-foreground">Jak minal dzien?</p>
              </div>
              <a
                href="/dashboard/schedule"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Skonfiguruj
              </a>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info about dynamic widgets */}
      <Card className="border-dashed border-2 border-muted">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Twoj dashboard rosnie z Toba
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Dashboard bedzie automatycznie wyswietlac widgety oparte na tym, co sledzisz.
            Porozmawiaj z asystentem glosowym o swoich celach - system dostosuje sie do Ciebie.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-muted rounded text-xs">Energia</span>
            <span className="px-2 py-1 bg-muted rounded text-xs">Sen</span>
            <span className="px-2 py-1 bg-muted rounded text-xs">Nastroj</span>
            <span className="px-2 py-1 bg-muted rounded text-xs">Stres</span>
            <span className="px-2 py-1 bg-muted rounded text-xs">Produktywnosc</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
