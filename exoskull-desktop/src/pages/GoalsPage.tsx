import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Target, Plus, Loader2 } from "lucide-react";

interface Goal {
  id: string;
  name: string;
  category?: string;
  description?: string;
  current_value?: number;
  target_value?: number;
  is_active?: boolean;
  created_at?: string;
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const loadGoals = async () => {
    try {
      const data = await invoke<Goal[]>("get_goals");
      setGoals(data || []);
    } catch (err) {
      console.error("Failed to load goals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGoals();
  }, []);

  const createGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await invoke("create_goal", {
        name: newTitle,
        description: newDesc || null,
      });
      setNewTitle("");
      setNewDesc("");
      setShowForm(false);
      loadGoals();
    } catch (err) {
      console.error("Failed to create goal:", err);
    } finally {
      setCreating(false);
    }
  };

  const statusInfo = (goal: Goal) => {
    if (goal.is_active === false) {
      return { label: "inactive", classes: "bg-muted text-muted-foreground" };
    }
    if (goal.target_value && goal.current_value && goal.current_value >= goal.target_value) {
      return { label: "completed", classes: "bg-blue-500/10 text-blue-500" };
    }
    return { label: "active", classes: "bg-green-500/10 text-green-500" };
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Goals</h1>
            <p className="text-sm text-muted-foreground">
              Track your objectives
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Goal
          </button>
        </div>
      </div>

      <div className="p-6">
        {showForm && (
          <form
            onSubmit={createGoal}
            className="mb-6 rounded-lg border border-border bg-card p-4"
          >
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Goal title..."
              className="mb-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)..."
              className="mb-3 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              rows={2}
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Goal"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Target className="mb-2 h-12 w-12" />
            <p>No goals yet. Create your first goal!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {goals.map((goal) => (
              <div
                key={goal.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium">{goal.name}</h3>
                    {goal.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {goal.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`ml-3 rounded-full px-2 py-1 text-xs font-medium ${statusInfo(goal).classes}`}
                  >
                    {statusInfo(goal).label}
                  </span>
                </div>
                {goal.category && (
                  <span className="mt-1 inline-block rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {goal.category}
                  </span>
                )}
                {goal.target_value != null && (
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(100, ((goal.current_value || 0) / goal.target_value) * 100)}%` }}
                      />
                    </div>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {goal.current_value || 0} / {goal.target_value}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
