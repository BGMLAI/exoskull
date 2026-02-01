import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { queryDatabase } from '@/lib/db-direct'

export const dynamic = 'force-dynamic'

// Fallback agents during PostgREST maintenance
const FALLBACK_AGENTS = [
  { id: '1', name: 'System Coordinator', type: 'core', tier: 1, description: 'Routes requests', system_prompt: 'You coordinate agents. Polish.', capabilities: ['routing'], is_global: true },
  { id: '2', name: 'Executive Assistant', type: 'core', tier: 1, description: 'Manages time', system_prompt: 'You manage calendar. Polish.', capabilities: ['calendar'], is_global: true },
  { id: '3', name: 'Task Manager', type: 'core', tier: 1, description: 'Tracks tasks', system_prompt: 'You track tasks. Polish.', capabilities: ['tasks'], is_global: true },
  { id: '4', name: 'Pattern Detective', type: 'core', tier: 2, description: 'Learns patterns', system_prompt: 'You find patterns. Polish.', capabilities: ['patterns'], is_global: true },
  { id: '5', name: 'Gap Finder', type: 'core', tier: 2, description: 'Finds gaps', system_prompt: 'You find gaps. Polish.', capabilities: ['gaps'], is_global: true },
]

export default async function AgentsPage() {
  let agents: any[] = []
  let error: any = null
  let usingFallback = false

  try {
    agents = await queryDatabase('exo_agents', {
      filter: { is_global: true },
      order: { column: 'tier', ascending: true }
    })
  } catch (e: any) {
    error = e
    console.error('Database query error:', e)

    // Use fallback during maintenance
    if (e.message?.includes('schema cache')) {
      agents = FALLBACK_AGENTS
      usingFallback = true
      error = null
    }
  }

  const needsSetup = error && !usingFallback

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Agenci AI</h1>
        <p className="text-muted-foreground">
          Twoi asystenci gotowi do pomocy
        </p>
      </div>

      {usingFallback && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <p className="text-sm text-blue-800">
              ℹ️ Supabase jest w trakcie konserwacji. Pokazuję agentów z pamięci cache. Wszystko będzie działać normalnie po zakończeniu maintenance (jutro, 2 lutego).
            </p>
          </CardContent>
        </Card>
      )}

      {needsSetup ? (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle>Konfiguracja wymagana</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Tabele bazy danych nie są jeszcze skonfigurowane. Skopiuj SQL poniżej i uruchom w Supabase:
            </p>
            <div className="bg-gray-900 text-gray-100 p-4 rounded text-xs font-mono overflow-x-auto">
              {`-- Skopiuj to całość i wklej w SQL Editor
CREATE TABLE IF NOT EXISTS public.exo_tenants (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE public.exo_tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_policy" ON public.exo_tenants FOR ALL USING (auth.uid() = id);

CREATE TABLE IF NOT EXISTS public.exo_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'core',
  tier INTEGER DEFAULT 2,
  description TEXT,
  system_prompt TEXT NOT NULL,
  capabilities TEXT[],
  is_global BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE public.exo_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_policy" ON public.exo_agents FOR SELECT USING (is_global = true);

INSERT INTO public.exo_agents (name, type, tier, description, system_prompt, capabilities, is_global)
VALUES
('System Coordinator', 'core', 1, 'Routes requests', 'You coordinate agents. Polish.', ARRAY['routing'], true),
('Executive Assistant', 'core', 1, 'Manages time', 'You manage calendar. Polish.', ARRAY['calendar'], true),
('Task Manager', 'core', 1, 'Tracks tasks', 'You track tasks. Polish.', ARRAY['tasks'], true),
('Pattern Detective', 'core', 2, 'Learns patterns', 'You find patterns. Polish.', ARRAY['patterns'], true),
('Gap Finder', 'core', 2, 'Finds gaps', 'You find gaps. Polish.', ARRAY['gaps'], true)
ON CONFLICT DO NOTHING;`}
            </div>
            <a
              href="https://supabase.com/dashboard/project/ocixoxjozzldqldadrip/sql/new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium"
            >
              Otwórz Supabase SQL Editor →
            </a>
            <p className="text-xs text-muted-foreground">
              Po uruchomieniu SQL, odśwież tę stronę.
            </p>
          </CardContent>
        </Card>
      ) : !agents || agents.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              Brak agentów w bazie danych.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <Card key={agent.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{agent.name}</CardTitle>
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                    Tier {agent.tier}
                  </span>
                </div>
                <CardDescription>{agent.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium">Typ:</p>
                    <p className="text-sm text-muted-foreground">{agent.type}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Umiejętności:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {agent.capabilities?.map((cap: string) => (
                        <span
                          key={cap}
                          className="text-xs px-2 py-0.5 bg-gray-100 rounded"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
