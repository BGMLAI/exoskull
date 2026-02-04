"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  MessageSquare,
  Phone,
  MessageCircle,
  PlusCircle,
  Calendar,
  Tag,
  User,
  Clock,
  CheckSquare,
  FolderOpen,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { UnifiedMessage } from "./InboxSidebar";

interface Project {
  id: string;
  name: string;
  color?: string;
}

interface MessageDetailsProps {
  message?: UnifiedMessage | null;
  className?: string;
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  voice: <Phone className="h-4 w-4" />,
  web_chat: <MessageCircle className="h-4 w-4" />,
};

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  voice: "Telefon",
  web_chat: "Chat",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
};

function parseFromField(from: string): { name: string; email: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, "").trim(), email: match[2] };
  }
  return { name: from, email: from };
}

export function MessageDetails({ message, className }: MessageDetailsProps) {
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskCreated, setTaskCreated] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Reset task created state when message changes
  useEffect(() => {
    setTaskCreated(false);
    setSelectedProject("");
  }, [message?.id]);

  // Fetch projects on mount
  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch("/api/projects");
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error("[MessageDetails] Failed to fetch projects:", error);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (!message) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Szczegoly
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground py-8">
          <p className="text-sm">Wybierz wiadomosc</p>
        </CardContent>
      </Card>
    );
  }

  const fromParsed = message.metadata?.from
    ? parseFromField(message.metadata.from as string)
    : { name: "Nieznany", email: "" };

  const handleCreateTask = async () => {
    setCreatingTask(true);
    try {
      const response = await fetch(`/api/messages/${message.id}/to-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: message.metadata?.subject || message.content.slice(0, 100),
          project_id:
            selectedProject && selectedProject !== "none"
              ? selectedProject
              : undefined,
        }),
      });

      if (response.ok) {
        setTaskCreated(true);
      } else {
        const err = await response.json();
        console.error("[MessageDetails] Create task error:", err);
        // If already linked, also show success
        if (err.task_id) {
          setTaskCreated(true);
        }
      }
    } catch (error) {
      console.error("[MessageDetails] Create task error:", error);
    } finally {
      setCreatingTask(false);
    }
  };

  return (
    <Card className={cn("h-full overflow-auto", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {CHANNEL_ICONS[message.channel]}
          {CHANNEL_LABELS[message.channel] || message.channel}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* From */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            Od
          </div>
          <p className="text-sm font-medium">
            {fromParsed.name || fromParsed.email}
          </p>
          {fromParsed.email && fromParsed.name && (
            <p className="text-xs text-muted-foreground">{fromParsed.email}</p>
          )}
        </div>

        {/* Subject (for emails) */}
        {message.metadata?.subject && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" />
              Temat
            </div>
            <p className="text-sm">{message.metadata.subject as string}</p>
          </div>
        )}

        {/* Date */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Data
          </div>
          <p className="text-sm">
            {new Date(
              (message.metadata?.date as string) || message.created_at,
            ).toLocaleString("pl-PL")}
          </p>
        </div>

        {/* Direction */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Kierunek
          </div>
          <p className="text-sm">
            {message.direction === "outbound" ? "Wychodzaca" : "Przychodzaca"}
          </p>
        </div>

        {/* Status (unread) */}
        {message.metadata?.isUnread !== undefined && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckSquare className="h-3 w-3" />
              Status
            </div>
            <p className="text-sm">
              {message.metadata.isUnread ? "Nieprzeczytana" : "Przeczytana"}
            </p>
          </div>
        )}

        {/* Divider */}
        <div className="border-t pt-4">
          <h4 className="text-xs font-medium text-muted-foreground mb-3">
            Akcje
          </h4>

          {/* Create Task */}
          <div className="space-y-2">
            {taskCreated ? (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-md">
                <CheckCircle2 className="h-4 w-4" />
                Task utworzony
              </div>
            ) : (
              <>
                {/* Project selector */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <FolderOpen className="h-3 w-3" />
                    Przypisz do projektu
                  </label>
                  <Select
                    value={selectedProject}
                    onValueChange={setSelectedProject}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Wybierz projekt" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Bez projektu</SelectItem>
                      {loadingProjects ? (
                        <SelectItem value="loading" disabled>
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          Ladowanie...
                        </SelectItem>
                      ) : (
                        projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            <span
                              className="inline-block w-2 h-2 rounded-full mr-2"
                              style={{
                                backgroundColor: project.color || "#6366f1",
                              }}
                            />
                            {project.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={handleCreateTask}
                  disabled={creatingTask}
                >
                  {creatingTask ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <PlusCircle className="h-4 w-4 mr-2" />
                  )}
                  {creatingTask ? "Tworzenie..." : "Utwórz task"}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
