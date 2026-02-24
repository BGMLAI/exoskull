import { Plug } from "lucide-react";

const integrations = [
  { name: "Google Calendar", status: "available", icon: "📅" },
  { name: "Todoist", status: "available", icon: "✅" },
  { name: "Notion", status: "available", icon: "📝" },
  { name: "Slack", status: "available", icon: "💬" },
  { name: "GitHub", status: "available", icon: "🐙" },
  { name: "Stripe", status: "available", icon: "💳" },
];

export default function IntegrationsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect external services
        </p>
      </div>

      <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <div
            key={integration.name}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{integration.icon}</span>
              <div>
                <h3 className="font-medium">{integration.name}</h3>
                <span className="text-xs text-muted-foreground">
                  Not connected
                </span>
              </div>
            </div>
            <button className="mt-3 w-full rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
              Connect
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
