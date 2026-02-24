import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckSquare, Loader2, Circle, CheckCircle2 } from "lucide-react";

interface Task {
  id: string;
  title: string;
  status: string;
  priority?: string;
  due_date?: string;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<Task[]>("get_tasks")
      .then((data) => setTasks(data || []))
      .catch((err) => console.error("Failed to load tasks:", err))
      .finally(() => setLoading(false));
  }, []);

  const priorityColor = (priority?: string) => {
    switch (priority) {
      case "high":
        return "text-red-500";
      case "medium":
        return "text-yellow-500";
      case "low":
        return "text-green-500";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Tasks</h1>
        <p className="text-sm text-muted-foreground">Your action items</p>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CheckSquare className="mb-2 h-12 w-12" />
            <p>No tasks yet. Tasks will appear from your goals.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                {task.status === "completed" ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <div className="flex-1">
                  <span
                    className={
                      task.status === "completed"
                        ? "text-muted-foreground line-through"
                        : ""
                    }
                  >
                    {task.title}
                  </span>
                  {task.due_date && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Due: {task.due_date}
                    </span>
                  )}
                </div>
                {task.priority && (
                  <span
                    className={`text-xs font-medium ${priorityColor(task.priority)}`}
                  >
                    {task.priority}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
