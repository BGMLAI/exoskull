"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  Loop,
  Campaign,
  Quest,
  Op,
  Note,
  NoteType,
  NOTE_TYPE_LABELS,
} from "@/lib/types/knowledge";
import { LoopCard } from "@/components/knowledge/LoopCard";
import { CampaignCard } from "@/components/knowledge/CampaignCard";
import { QuestCard } from "@/components/knowledge/QuestCard";
import { OpCard } from "@/components/knowledge/OpCard";
import { NoteEditor, NoteEditorData } from "@/components/knowledge/NoteEditor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

type KnowledgeDocument = {
  id: string;
  tenant_id: string;
  filename: string;
  original_name: string;
  file_type: string | null;
  file_size: number | null;
  storage_path: string;
  category: string | null;
  status: string | null;
  created_at: string;
};

const DOCUMENT_CATEGORIES = [
  { value: "chat", label: "Chat" },
  { value: "health", label: "Zdrowie" },
  { value: "productivity", label: "Produktywność" },
  { value: "finance", label: "Finanse" },
  { value: "personal", label: "Personalne" },
  { value: "other", label: "Inne" },
];

function formatFileSize(size?: number | null) {
  if (!size) return "-";
  const mb = size / (1024 * 1024);
  if (mb < 1) return `${Math.round(size / 1024)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9\\s-]/g, "")
    .replace(/\\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function KnowledgePage() {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);

  const [loops, setLoops] = useState<Loop[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [ops, setOps] = useState<Op[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);

  const [treeSearch, setTreeSearch] = useState("");
  const [notesSearch, setNotesSearch] = useState("");

  const [selectedLoopSlug, setSelectedLoopSlug] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null,
  );
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);

  const [expandedLoops, setExpandedLoops] = useState<string[]>([]);
  const [expandedCampaigns, setExpandedCampaigns] = useState<string[]>([]);
  const [expandedQuests, setExpandedQuests] = useState<string[]>([]);

  const [uploadCategory, setUploadCategory] = useState("other");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadStatuses, setUploadStatuses] = useState<
    Record<
      string,
      { status: "pending" | "uploading" | "success" | "error"; error?: string }
    >
  >({});

  const [loopDialogOpen, setLoopDialogOpen] = useState(false);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [questDialogOpen, setQuestDialogOpen] = useState(false);
  const [opDialogOpen, setOpDialogOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);

  const [editingLoop, setEditingLoop] = useState<Loop | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
  const [editingOp, setEditingOp] = useState<Op | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const [loopSlugEdited, setLoopSlugEdited] = useState(false);
  const [loopForm, setLoopForm] = useState({
    name: "",
    slug: "",
    description: "",
    icon: "📁",
    color: "#3B82F6",
    priority: 5,
  });

  const [campaignForm, setCampaignForm] = useState({
    title: "",
    vision: "",
    loopSlug: "",
    startDate: "",
    targetDate: "",
    status: "active",
  });

  const [questForm, setQuestForm] = useState({
    title: "",
    description: "",
    campaignId: "",
    loopSlug: "",
    targetOps: "",
    startDate: "",
    deadline: "",
    tags: "",
    status: "active",
  });

  const [opForm, setOpForm] = useState({
    title: "",
    description: "",
    questId: "",
    loopSlug: "",
    priority: "5",
    dueDate: "",
    scheduledFor: "",
    estimatedEffort: "",
    tags: "",
    status: "pending",
  });

  useEffect(() => {
    const init = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setAuthChecked(true);
          setLoading(false);
          return;
        }

        setTenantId(user.id);
        await ensureTenantExists(user.id, user.email || undefined);
        await loadAll(user.id);
      } catch (error) {
        console.error("[Knowledge] init error:", error);
      } finally {
        setAuthChecked(true);
        setLoading(false);
      }
    };

    init();
  }, []);

  useEffect(() => {
    if (!tenantId) return;

    const handle = setTimeout(() => {
      loadNotes(tenantId);
    }, 300);

    return () => clearTimeout(handle);
  }, [
    tenantId,
    notesSearch,
    selectedLoopSlug,
    selectedCampaignId,
    selectedQuestId,
    selectedOpId,
  ]);

  async function ensureTenantExists(tenant_id: string, email?: string) {
    try {
      const { data: existing } = await supabase
        .from("exo_tenants")
        .select("id")
        .eq("id", tenant_id)
        .single();

      if (!existing) {
        const { error } = await supabase.from("exo_tenants").insert({
          id: tenant_id,
          name: email?.split("@")[0] || "User",
          email: email || null,
          created_at: new Date().toISOString(),
        });

        if (error) {
          console.error("[Knowledge] Failed to create tenant:", error);
        }
      }
    } catch (error) {
      console.error("[Knowledge] ensureTenantExists error:", error);
    }
  }

  async function loadAll(tenant_id: string) {
    await Promise.all([
      loadLoops(tenant_id),
      loadCampaigns(tenant_id),
      loadQuests(tenant_id),
      loadOps(tenant_id),
      loadDocuments(tenant_id),
    ]);
    await loadNotes(tenant_id);
  }

  async function loadLoops(tenant_id: string) {
    const res = await fetch(
      `/api/knowledge/loops?tenantId=${tenant_id}&withStats=true`,
    );
    if (!res.ok) {
      console.error("[Knowledge] Failed to load loops");
      return;
    }
    const data = await res.json();
    if ((data.loops || []).length === 0) {
      await fetch("/api/knowledge/loops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant_id, initDefaults: true }),
      });
      const retry = await fetch(
        `/api/knowledge/loops?tenantId=${tenant_id}&withStats=true`,
      );
      const retryData = await retry.json();
      setLoops(retryData.loops || []);
      return;
    }
    setLoops(data.loops || []);
  }

  async function loadCampaigns(tenant_id: string) {
    const res = await fetch(
      `/api/knowledge/campaigns?tenantId=${tenant_id}&limit=200&offset=0`,
    );
    if (!res.ok) return;
    const data = await res.json();
    setCampaigns(data.campaigns || []);
  }

  async function loadQuests(tenant_id: string) {
    const res = await fetch(
      `/api/knowledge/quests?tenantId=${tenant_id}&limit=200&offset=0`,
    );
    if (!res.ok) return;
    const data = await res.json();
    setQuests(data.quests || []);
  }

  async function loadOps(tenant_id: string) {
    const res = await fetch(
      `/api/knowledge/ops?tenantId=${tenant_id}&limit=200&offset=0`,
    );
    if (!res.ok) return;
    const data = await res.json();
    setOps(data.ops || []);
  }

  async function loadNotes(tenant_id: string) {
    const params = new URLSearchParams();
    params.set("tenantId", tenant_id);
    params.set("limit", "50");
    params.set("offset", "0");
    if (notesSearch.trim()) params.set("search", notesSearch.trim());

    const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);
    const selectedQuest = quests.find((q) => q.id === selectedQuestId);
    const selectedOp = ops.find((o) => o.id === selectedOpId);

    if (selectedOp?.id) {
      params.set("opId", selectedOp.id);
    } else if (selectedQuest?.id) {
      params.set("questId", selectedQuest.id);
    } else {
      const loopFilter =
        selectedLoopSlug ||
        selectedQuest?.loop_slug ||
        selectedCampaign?.loop_slug ||
        null;
      if (loopFilter) params.set("loop", loopFilter);
    }

    const res = await fetch(`/api/knowledge/notes?${params.toString()}`);
    if (!res.ok) return;
    const data = await res.json();
    setNotes(data.notes || []);
  }

  async function loadDocuments(tenant_id: string) {
    const res = await fetch(`/api/knowledge?tenant_id=${tenant_id}`);
    if (!res.ok) return;
    const data = await res.json();
    setDocuments(data.documents || []);
  }

  const filteredLoops = useMemo(() => {
    if (!treeSearch.trim()) return loops;
    const q = treeSearch.toLowerCase();
    return loops.filter((loop) =>
      [loop.name, loop.description, loop.slug].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [loops, treeSearch]);

  const selectedLoop =
    loops.find((loop) => loop.slug === selectedLoopSlug) || null;
  const selectedCampaign =
    campaigns.find((c) => c.id === selectedCampaignId) || null;
  const selectedQuest = quests.find((q) => q.id === selectedQuestId) || null;
  const selectedOp = ops.find((o) => o.id === selectedOpId) || null;

  function toggleExpanded(
    list: string[],
    id: string,
    setList: (value: string[]) => void,
  ) {
    setList(list.includes(id) ? list.filter((i) => i !== id) : [...list, id]);
  }

  function openCreateLoop() {
    setEditingLoop(null);
    setLoopForm({
      name: "",
      slug: "",
      description: "",
      icon: "📁",
      color: "#3B82F6",
      priority: 5,
    });
    setLoopSlugEdited(false);
    setLoopDialogOpen(true);
  }

  function openEditLoop(loop: Loop) {
    setEditingLoop(loop);
    setLoopForm({
      name: loop.name,
      slug: loop.slug,
      description: loop.description || "",
      icon: loop.icon || "📁",
      color: loop.color || "#3B82F6",
      priority: loop.priority || 5,
    });
    setLoopSlugEdited(true);
    setLoopDialogOpen(true);
  }

  function openCreateCampaign() {
    setEditingCampaign(null);
    setCampaignForm({
      title: "",
      vision: "",
      loopSlug: selectedLoopSlug || "",
      startDate: "",
      targetDate: "",
      status: "active",
    });
    setCampaignDialogOpen(true);
  }

  function openEditCampaign(campaign: Campaign) {
    setEditingCampaign(campaign);
    setCampaignForm({
      title: campaign.title,
      vision: campaign.vision || "",
      loopSlug: campaign.loop_slug || "",
      startDate: campaign.start_date || "",
      targetDate: campaign.target_date || "",
      status: campaign.status,
    });
    setCampaignDialogOpen(true);
  }

  function openCreateQuest() {
    setEditingQuest(null);
    setQuestForm({
      title: "",
      description: "",
      campaignId: selectedCampaignId || "",
      loopSlug: selectedLoopSlug || selectedCampaign?.loop_slug || "",
      targetOps: "",
      startDate: "",
      deadline: "",
      tags: "",
      status: "active",
    });
    setQuestDialogOpen(true);
  }

  function openEditQuest(quest: Quest) {
    setEditingQuest(quest);
    setQuestForm({
      title: quest.title,
      description: quest.description || "",
      campaignId: quest.campaign_id || "",
      loopSlug: quest.loop_slug || "",
      targetOps: quest.target_ops?.toString() || "",
      startDate: quest.start_date || "",
      deadline: quest.deadline ? quest.deadline.slice(0, 10) : "",
      tags: quest.tags?.join(", ") || "",
      status: quest.status,
    });
    setQuestDialogOpen(true);
  }

  function openCreateOp() {
    setEditingOp(null);
    setOpForm({
      title: "",
      description: "",
      questId: selectedQuestId || "",
      loopSlug: selectedLoopSlug || selectedQuest?.loop_slug || "",
      priority: "5",
      dueDate: "",
      scheduledFor: "",
      estimatedEffort: "",
      tags: "",
      status: "pending",
    });
    setOpDialogOpen(true);
  }

  function openEditOp(op: Op) {
    setEditingOp(op);
    setOpForm({
      title: op.title,
      description: op.description || "",
      questId: op.quest_id || "",
      loopSlug: op.loop_slug || "",
      priority: op.priority.toString(),
      dueDate: op.due_date ? op.due_date.slice(0, 10) : "",
      scheduledFor: op.scheduled_for ? op.scheduled_for.slice(0, 16) : "",
      estimatedEffort: op.estimated_effort?.toString() || "",
      tags: op.tags?.join(", ") || "",
      status: op.status,
    });
    setOpDialogOpen(true);
  }

  function openCreateNote() {
    setEditingNote(null);
    setNoteDialogOpen(true);
  }

  function openEditNote(note: Note) {
    setEditingNote(note);
    setNoteDialogOpen(true);
  }

  async function handleSaveLoop() {
    if (!tenantId) return;
    if (!loopForm.name.trim() || !loopForm.slug.trim()) {
      toast.error("Podaj nazwę i slug");
      return;
    }

    const payload = {
      tenantId,
      slug: loopForm.slug.trim(),
      name: loopForm.name.trim(),
      description: loopForm.description.trim() || null,
      icon: loopForm.icon,
      color: loopForm.color,
      priority: loopForm.priority,
    };

    if (editingLoop) {
      await fetch("/api/knowledge/loops", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loopId: editingLoop.id, ...payload }),
      });
    } else {
      await fetch("/api/knowledge/loops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    await loadLoops(tenantId);
    setLoopDialogOpen(false);
  }

  async function handleDeleteLoop(loop: Loop) {
    if (!tenantId) return;
    if (!confirm(`Usunąć loop "${loop.name}"?`)) return;
    await fetch(`/api/knowledge/loops?loopId=${loop.id}&tenantId=${tenantId}`, {
      method: "DELETE",
    });
    await loadLoops(tenantId);
  }

  async function handleSaveCampaign() {
    if (!tenantId) return;
    if (!campaignForm.title.trim()) {
      toast.error("Podaj tytuł");
      return;
    }

    const payload = {
      tenantId,
      title: campaignForm.title.trim(),
      vision: campaignForm.vision.trim() || null,
      loopSlug: campaignForm.loopSlug || null,
      startDate: campaignForm.startDate || null,
      targetDate: campaignForm.targetDate || null,
    };

    if (editingCampaign) {
      await fetch("/api/knowledge/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: editingCampaign.id,
          ...payload,
          status: campaignForm.status,
        }),
      });
    } else {
      await fetch("/api/knowledge/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    await loadCampaigns(tenantId);
    setCampaignDialogOpen(false);
  }

  async function handleDeleteCampaign(campaign: Campaign) {
    if (!tenantId) return;
    if (!confirm(`Usunąć kampanię "${campaign.title}"?`)) return;
    await fetch(
      `/api/knowledge/campaigns?campaignId=${campaign.id}&tenantId=${tenantId}`,
      {
        method: "DELETE",
      },
    );
    await loadCampaigns(tenantId);
  }

  async function handleSaveQuest() {
    if (!tenantId) return;
    if (!questForm.title.trim()) {
      toast.error("Podaj tytuł");
      return;
    }

    const payload = {
      tenantId,
      title: questForm.title.trim(),
      description: questForm.description.trim() || null,
      campaignId: questForm.campaignId || null,
      loopSlug: questForm.loopSlug || null,
      targetOps: questForm.targetOps ? parseInt(questForm.targetOps, 10) : null,
      startDate: questForm.startDate || null,
      deadline: questForm.deadline || null,
      tags: questForm.tags
        ? questForm.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    };

    if (editingQuest) {
      await fetch("/api/knowledge/quests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questId: editingQuest.id,
          ...payload,
          status: questForm.status,
        }),
      });
    } else {
      await fetch("/api/knowledge/quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    await loadQuests(tenantId);
    setQuestDialogOpen(false);
  }

  async function handleDeleteQuest(quest: Quest) {
    if (!tenantId) return;
    if (!confirm(`Usunąć quest "${quest.title}"?`)) return;
    await fetch(
      `/api/knowledge/quests?questId=${quest.id}&tenantId=${tenantId}`,
      {
        method: "DELETE",
      },
    );
    await loadQuests(tenantId);
  }

  async function handleSaveOp() {
    if (!tenantId) return;
    if (!opForm.title.trim()) {
      toast.error("Podaj tytuł");
      return;
    }

    const payload = {
      tenantId,
      title: opForm.title.trim(),
      description: opForm.description.trim() || null,
      questId: opForm.questId || null,
      loopSlug: opForm.loopSlug || null,
      priority: opForm.priority ? parseInt(opForm.priority, 10) : 5,
      dueDate: opForm.dueDate || null,
      scheduledFor: opForm.scheduledFor || null,
      estimatedEffort: opForm.estimatedEffort
        ? parseInt(opForm.estimatedEffort, 10)
        : null,
      tags: opForm.tags
        ? opForm.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    };

    if (editingOp) {
      await fetch("/api/knowledge/ops", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opId: editingOp.id,
          ...payload,
          status: opForm.status,
        }),
      });
    } else {
      await fetch("/api/knowledge/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    await loadOps(tenantId);
    setOpDialogOpen(false);
  }

  async function handleDeleteOp(op: Op) {
    if (!tenantId) return;
    if (!confirm(`Usunąć op "${op.title}"?`)) return;
    await fetch(`/api/knowledge/ops?opId=${op.id}&tenantId=${tenantId}`, {
      method: "DELETE",
    });
    await loadOps(tenantId);
  }

  async function handleSaveNote(data: NoteEditorData) {
    if (!tenantId) return;

    const payload = {
      tenantId,
      type: data.type,
      title: data.title,
      content: data.content,
      tags: data.tags,
      isResearch: data.isResearch,
      isExperience: data.isExperience,
      loopSlug: data.loopSlug || null,
      questId: data.questId || null,
      opId: data.opId || null,
    };

    if (editingNote) {
      await fetch("/api/knowledge/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: editingNote.id, ...payload }),
      });
    } else {
      await fetch("/api/knowledge/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    await loadNotes(tenantId);
    setNoteDialogOpen(false);
  }

  async function handleDeleteNote(note: Note) {
    if (!tenantId) return;
    if (!confirm("Usunąć notatkę?")) return;
    await fetch(`/api/knowledge/notes?noteId=${note.id}&tenantId=${tenantId}`, {
      method: "DELETE",
    });
    await loadNotes(tenantId);
  }

  async function handleDocumentDelete(document: KnowledgeDocument) {
    if (!tenantId) return;
    if (!confirm(`Usunąć dokument "${document.original_name}"?`)) return;
    await fetch("/api/knowledge", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId, document_id: document.id }),
    });
    await loadDocuments(tenantId);
  }

  async function handleUpload() {
    if (!tenantId || selectedFiles.length === 0) return;
    const nextStatuses: typeof uploadStatuses = { ...uploadStatuses };

    for (const file of selectedFiles) {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      nextStatuses[key] = { status: "uploading" };
      setUploadStatuses({ ...nextStatuses });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("tenant_id", tenantId);
      formData.append("category", uploadCategory);

      try {
        const res = await fetch("/api/knowledge/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          nextStatuses[key] = {
            status: "error",
            error: errorData?.error || "Upload error",
          };
        } else {
          nextStatuses[key] = { status: "success" };
        }
      } catch (error) {
        nextStatuses[key] = { status: "error", error: "Upload error" };
      }

      setUploadStatuses({ ...nextStatuses });
    }

    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await loadDocuments(tenantId);
  }

  if (!authChecked) {
    return (
      <div className="p-8">
        <p>Ładowanie...</p>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">
          Zaloguj się, aby zobaczyć Knowledge
        </h1>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Wiedza (Tyrolka)</h1>
        <p className="text-muted-foreground">
          Zarządzaj wiedzą, dokumentami i kontekstem dla AI.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload dokumentów wiedzy
          </CardTitle>
          <CardDescription>
            PDF, DOCX, CSV, TXT, JSON, obrazy i wideo. Limit 1GB na plik.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-end">
            <div className="flex-1 space-y-2">
              <Label>Pliki</Label>
              <Input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.md,.json,.csv,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setSelectedFiles(files);
                }}
              />
            </div>
            <div className="w-full lg:w-64 space-y-2">
              <Label>Kategoria</Label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz kategorię" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleUpload}
              disabled={selectedFiles.length === 0}
            >
              Wyślij
            </Button>
          </div>

          {selectedFiles.length > 0 && (
            <div className="space-y-2 text-sm text-muted-foreground">
              {selectedFiles.map((file) => {
                const key = `${file.name}-${file.size}-${file.lastModified}`;
                const status = uploadStatuses[key]?.status || "pending";
                const error = uploadStatuses[key]?.error;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>
                      {file.name} ({formatFileSize(file.size)})
                    </span>
                    <span
                      className={cn(
                        status === "success" && "text-green-600",
                        status === "error" && "text-red-600",
                        status === "uploading" && "text-blue-600",
                      )}
                    >
                      {status}
                      {error ? ` • ${error}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Dokumenty wiedzy</CardTitle>
          <CardDescription>Lista przesłanych dokumentów</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {documents.length === 0 && (
            <p className="text-sm text-muted-foreground">Brak dokumentów</p>
          )}
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-start justify-between gap-4 border rounded-md p-3"
            >
              <div className="space-y-1">
                <div className="font-medium">{doc.original_name}</div>
                <div className="text-xs text-muted-foreground">
                  {doc.file_type || "unknown"} • {formatFileSize(doc.file_size)}{" "}
                  • {new Date(doc.created_at).toLocaleDateString("pl-PL")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{doc.category || "other"}</Badge>
                <Badge variant="secondary">{doc.status || "uploaded"}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDocumentDelete(doc)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex flex-col xl:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Knowledge Tree</h2>
              <p className="text-sm text-muted-foreground">
                Loops → Campaigns → Quests → Ops
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={openCreateLoop}>
                <Plus className="h-4 w-4 mr-1" />
                Loop
              </Button>
              <Button size="sm" variant="outline" onClick={openCreateCampaign}>
                <Plus className="h-4 w-4 mr-1" />
                Campaign
              </Button>
              <Button size="sm" variant="outline" onClick={openCreateQuest}>
                <Plus className="h-4 w-4 mr-1" />
                Quest
              </Button>
              <Button size="sm" variant="outline" onClick={openCreateOp}>
                <Plus className="h-4 w-4 mr-1" />
                Op
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Szukaj w drzewie..."
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
            />
          </div>

          {loading && (
            <p className="text-sm text-muted-foreground">Ładowanie...</p>
          )}

          <div className="space-y-4">
            {filteredLoops.map((loop) => {
              const loopCampaigns = campaigns.filter(
                (c) => c.loop_slug === loop.slug,
              );
              const loopQuests = quests.filter(
                (q) => q.loop_slug === loop.slug && !q.campaign_id,
              );
              const loopOps = ops.filter(
                (o) => o.loop_slug === loop.slug && !o.quest_id,
              );

              const isLoopExpanded = expandedLoops.includes(loop.id);

              return (
                <div key={loop.id} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <button
                      className="mt-2"
                      onClick={() =>
                        toggleExpanded(expandedLoops, loop.id, setExpandedLoops)
                      }
                    >
                      {isLoopExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <div className="flex-1">
                      <LoopCard
                        loop={loop}
                        isSelected={selectedLoopSlug === loop.slug}
                        onClick={() => {
                          setSelectedLoopSlug(loop.slug);
                          setSelectedCampaignId(null);
                          setSelectedQuestId(null);
                          setSelectedOpId(null);
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditLoop(loop)}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteLoop(loop)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {isLoopExpanded && (
                    <div className="space-y-3 ml-8">
                      {loopCampaigns.map((campaign) => {
                        const campaignQuests = quests.filter(
                          (q) => q.campaign_id === campaign.id,
                        );
                        const isCampaignExpanded = expandedCampaigns.includes(
                          campaign.id,
                        );

                        return (
                          <div key={campaign.id} className="space-y-2">
                            <div className="flex items-start gap-2">
                              <button
                                className="mt-2"
                                onClick={() =>
                                  toggleExpanded(
                                    expandedCampaigns,
                                    campaign.id,
                                    setExpandedCampaigns,
                                  )
                                }
                              >
                                {isCampaignExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                              <div className="flex-1">
                                <CampaignCard
                                  campaign={campaign}
                                  loop={loop}
                                  isSelected={
                                    selectedCampaignId === campaign.id
                                  }
                                  onClick={() => {
                                    setSelectedCampaignId(campaign.id);
                                    setSelectedLoopSlug(loop.slug);
                                    setSelectedQuestId(null);
                                    setSelectedOpId(null);
                                  }}
                                  onEdit={() => openEditCampaign(campaign)}
                                />
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteCampaign(campaign)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                            {isCampaignExpanded && (
                              <div className="space-y-2 ml-8">
                                {campaignQuests.map((quest) => {
                                  const questOps = ops.filter(
                                    (o) => o.quest_id === quest.id,
                                  );
                                  const isQuestExpanded =
                                    expandedQuests.includes(quest.id);

                                  return (
                                    <div key={quest.id} className="space-y-2">
                                      <div className="flex items-start gap-2">
                                        <button
                                          className="mt-2"
                                          onClick={() =>
                                            toggleExpanded(
                                              expandedQuests,
                                              quest.id,
                                              setExpandedQuests,
                                            )
                                          }
                                        >
                                          {isQuestExpanded ? (
                                            <ChevronDown className="h-4 w-4" />
                                          ) : (
                                            <ChevronRight className="h-4 w-4" />
                                          )}
                                        </button>
                                        <div className="flex-1">
                                          <QuestCard
                                            quest={quest}
                                            loop={loop}
                                            isSelected={
                                              selectedQuestId === quest.id
                                            }
                                            onClick={() => {
                                              setSelectedQuestId(quest.id);
                                              setSelectedCampaignId(
                                                campaign.id,
                                              );
                                              setSelectedLoopSlug(loop.slug);
                                              setSelectedOpId(null);
                                            }}
                                            onEdit={() => openEditQuest(quest)}
                                          />
                                        </div>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          onClick={() =>
                                            handleDeleteQuest(quest)
                                          }
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>

                                      {isQuestExpanded && (
                                        <div className="space-y-2 ml-8">
                                          {questOps.map((op) => (
                                            <div
                                              key={op.id}
                                              className="flex items-start gap-2"
                                            >
                                              <div className="flex-1">
                                                <OpCard
                                                  op={op}
                                                  loop={loop}
                                                  isSelected={
                                                    selectedOpId === op.id
                                                  }
                                                  onClick={() => {
                                                    setSelectedOpId(op.id);
                                                    setSelectedQuestId(
                                                      quest.id,
                                                    );
                                                    setSelectedCampaignId(
                                                      campaign.id,
                                                    );
                                                    setSelectedLoopSlug(
                                                      loop.slug,
                                                    );
                                                  }}
                                                  onEdit={() => openEditOp(op)}
                                                />
                                              </div>
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() =>
                                                  handleDeleteOp(op)
                                                }
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          ))}
                                          {questOps.length === 0 && (
                                            <p className="text-xs text-muted-foreground">
                                              Brak ops
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {campaignQuests.length === 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Brak questów
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {loopQuests.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Questy bez kampanii
                          </p>
                          {loopQuests.map((quest) => (
                            <div
                              key={quest.id}
                              className="flex items-start gap-2"
                            >
                              <div className="flex-1">
                                <QuestCard
                                  quest={quest}
                                  loop={loop}
                                  isSelected={selectedQuestId === quest.id}
                                  onClick={() => {
                                    setSelectedQuestId(quest.id);
                                    setSelectedCampaignId(null);
                                    setSelectedLoopSlug(loop.slug);
                                    setSelectedOpId(null);
                                  }}
                                  onEdit={() => openEditQuest(quest)}
                                />
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteQuest(quest)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {loopOps.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Ops bez questu
                          </p>
                          {loopOps.map((op) => (
                            <div key={op.id} className="flex items-start gap-2">
                              <div className="flex-1">
                                <OpCard
                                  op={op}
                                  loop={loop}
                                  isSelected={selectedOpId === op.id}
                                  onClick={() => {
                                    setSelectedOpId(op.id);
                                    setSelectedQuestId(null);
                                    setSelectedCampaignId(null);
                                    setSelectedLoopSlug(loop.slug);
                                  }}
                                  onEdit={() => openEditOp(op)}
                                />
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteOp(op)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredLoops.length === 0 && (
              <p className="text-sm text-muted-foreground">Brak loopów</p>
            )}
          </div>
        </div>
        <div className="w-full xl:w-1/3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Notes
                <Button size="sm" onClick={openCreateNote}>
                  <Plus className="h-4 w-4 mr-1" />
                  Note
                </Button>
              </CardTitle>
              <CardDescription>Notatki kontekstowe dla AI</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Szukaj w notes..."
                  value={notesSearch}
                  onChange={(e) => setNotesSearch(e.target.value)}
                />
              </div>

              <div className="space-y-3 max-h-[600px] overflow-auto pr-1">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="border rounded-md p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span>{NOTE_TYPE_LABELS[note.type].icon}</span>
                          <span className="font-medium">
                            {note.title || "Bez tytułu"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {note.content || note.ai_summary || ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditNote(note)}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteNote(note)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {note.tags?.slice(0, 4).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {note.tags && note.tags.length > 4 && (
                        <Badge variant="outline" className="text-xs">
                          +{note.tags.length - 4}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                {notes.length === 0 && (
                  <p className="text-sm text-muted-foreground">Brak notatek</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={loopDialogOpen} onOpenChange={setLoopDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLoop ? "Edytuj Loop" : "Nowy Loop"}
            </DialogTitle>
            <DialogDescription>
              Loop to główna kategoria życia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nazwa</Label>
              <Input
                value={loopForm.name}
                onChange={(e) => {
                  const value = e.target.value;
                  setLoopForm((prev) => ({
                    ...prev,
                    name: value,
                    slug: loopSlugEdited ? prev.slug : slugify(value),
                  }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={loopForm.slug}
                onChange={(e) => {
                  setLoopSlugEdited(true);
                  setLoopForm((prev) => ({ ...prev, slug: e.target.value }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Opis</Label>
              <Textarea
                value={loopForm.description}
                onChange={(e) =>
                  setLoopForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </div>
            <div className="flex gap-3">
              <div className="space-y-2 flex-1">
                <Label>Ikona</Label>
                <Input
                  value={loopForm.icon}
                  onChange={(e) =>
                    setLoopForm((prev) => ({ ...prev, icon: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 flex-1">
                <Label>Kolor</Label>
                <Input
                  type="color"
                  value={loopForm.color}
                  onChange={(e) =>
                    setLoopForm((prev) => ({ ...prev, color: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Priorytet (1-10)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={loopForm.priority}
                onChange={(e) =>
                  setLoopForm((prev) => ({
                    ...prev,
                    priority: parseInt(e.target.value, 10),
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoopDialogOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={handleSaveLoop}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={campaignDialogOpen} onOpenChange={setCampaignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCampaign ? "Edytuj Campaign" : "Nowa Campaign"}
            </DialogTitle>
            <DialogDescription>
              Campaign to inicjatywa w obrębie loopa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Tytuł</Label>
              <Input
                value={campaignForm.title}
                onChange={(e) =>
                  setCampaignForm((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Wizja</Label>
              <Textarea
                value={campaignForm.vision}
                onChange={(e) =>
                  setCampaignForm((prev) => ({
                    ...prev,
                    vision: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Loop</Label>
              <Select
                value={campaignForm.loopSlug || "none"}
                onValueChange={(value) =>
                  setCampaignForm((prev) => ({
                    ...prev,
                    loopSlug: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz loop" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Brak</SelectItem>
                  {loops.map((loop) => (
                    <SelectItem key={loop.slug} value={loop.slug}>
                      {loop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <div className="space-y-2 flex-1">
                <Label>Start</Label>
                <Input
                  type="date"
                  value={campaignForm.startDate}
                  onChange={(e) =>
                    setCampaignForm((prev) => ({
                      ...prev,
                      startDate: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2 flex-1">
                <Label>Target</Label>
                <Input
                  type="date"
                  value={campaignForm.targetDate}
                  onChange={(e) =>
                    setCampaignForm((prev) => ({
                      ...prev,
                      targetDate: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            {editingCampaign && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={campaignForm.status}
                  onValueChange={(value) =>
                    setCampaignForm((prev) => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Szkic</SelectItem>
                    <SelectItem value="active">Aktywna</SelectItem>
                    <SelectItem value="paused">Wstrzymana</SelectItem>
                    <SelectItem value="completed">Zakończona</SelectItem>
                    <SelectItem value="archived">Zarchiwizowana</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCampaignDialogOpen(false)}
            >
              Anuluj
            </Button>
            <Button onClick={handleSaveCampaign}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={questDialogOpen} onOpenChange={setQuestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingQuest ? "Edytuj Quest" : "Nowy Quest"}
            </DialogTitle>
            <DialogDescription>
              Quest to projekt w ramach kampanii.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Tytuł</Label>
              <Input
                value={questForm.title}
                onChange={(e) =>
                  setQuestForm((prev) => ({ ...prev, title: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Opis</Label>
              <Textarea
                value={questForm.description}
                onChange={(e) =>
                  setQuestForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Campaign</Label>
              <Select
                value={questForm.campaignId || "none"}
                onValueChange={(value) =>
                  setQuestForm((prev) => ({
                    ...prev,
                    campaignId: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz kampanię" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Brak</SelectItem>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Loop</Label>
              <Select
                value={questForm.loopSlug || "none"}
                onValueChange={(value) =>
                  setQuestForm((prev) => ({
                    ...prev,
                    loopSlug: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz loop" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Brak</SelectItem>
                  {loops.map((loop) => (
                    <SelectItem key={loop.slug} value={loop.slug}>
                      {loop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <div className="space-y-2 flex-1">
                <Label>Target ops</Label>
                <Input
                  type="number"
                  value={questForm.targetOps}
                  onChange={(e) =>
                    setQuestForm((prev) => ({
                      ...prev,
                      targetOps: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2 flex-1">
                <Label>Deadline</Label>
                <Input
                  type="date"
                  value={questForm.deadline}
                  onChange={(e) =>
                    setQuestForm((prev) => ({
                      ...prev,
                      deadline: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tagi (oddzielone przecinkami)</Label>
              <Input
                value={questForm.tags}
                onChange={(e) =>
                  setQuestForm((prev) => ({ ...prev, tags: e.target.value }))
                }
              />
            </div>
            {editingQuest && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={questForm.status}
                  onValueChange={(value) =>
                    setQuestForm((prev) => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Szkic</SelectItem>
                    <SelectItem value="active">Aktywny</SelectItem>
                    <SelectItem value="paused">Wstrzymany</SelectItem>
                    <SelectItem value="completed">Zakończony</SelectItem>
                    <SelectItem value="archived">Zarchiwizowany</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuestDialogOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={handleSaveQuest}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={opDialogOpen} onOpenChange={setOpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOp ? "Edytuj Op" : "Nowy Op"}</DialogTitle>
            <DialogDescription>
              Op to konkretne zadanie w ramach questu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Tytuł</Label>
              <Input
                value={opForm.title}
                onChange={(e) =>
                  setOpForm((prev) => ({ ...prev, title: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Opis</Label>
              <Textarea
                value={opForm.description}
                onChange={(e) =>
                  setOpForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Quest</Label>
              <Select
                value={opForm.questId || "none"}
                onValueChange={(value) =>
                  setOpForm((prev) => ({
                    ...prev,
                    questId: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz quest" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Brak</SelectItem>
                  {quests.map((quest) => (
                    <SelectItem key={quest.id} value={quest.id}>
                      {quest.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Loop</Label>
              <Select
                value={opForm.loopSlug || "none"}
                onValueChange={(value) =>
                  setOpForm((prev) => ({
                    ...prev,
                    loopSlug: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz loop" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Brak</SelectItem>
                  {loops.map((loop) => (
                    <SelectItem key={loop.slug} value={loop.slug}>
                      {loop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <div className="space-y-2 flex-1">
                <Label>Priorytet</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={opForm.priority}
                  onChange={(e) =>
                    setOpForm((prev) => ({ ...prev, priority: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 flex-1">
                <Label>Due date</Label>
                <Input
                  type="date"
                  value={opForm.dueDate}
                  onChange={(e) =>
                    setOpForm((prev) => ({ ...prev, dueDate: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Zaplanowane na</Label>
              <Input
                type="datetime-local"
                value={opForm.scheduledFor}
                onChange={(e) =>
                  setOpForm((prev) => ({
                    ...prev,
                    scheduledFor: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Szacowany wysiłek (min)</Label>
              <Input
                type="number"
                value={opForm.estimatedEffort}
                onChange={(e) =>
                  setOpForm((prev) => ({
                    ...prev,
                    estimatedEffort: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Tagi (oddzielone przecinkami)</Label>
              <Input
                value={opForm.tags}
                onChange={(e) =>
                  setOpForm((prev) => ({ ...prev, tags: e.target.value }))
                }
              />
            </div>
            {editingOp && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={opForm.status}
                  onValueChange={(value) =>
                    setOpForm((prev) => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Do zrobienia</SelectItem>
                    <SelectItem value="active">W trakcie</SelectItem>
                    <SelectItem value="completed">Ukończone</SelectItem>
                    <SelectItem value="dropped">Porzucone</SelectItem>
                    <SelectItem value="blocked">Zablokowane</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpDialogOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={handleSaveOp}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingNote ? "Edytuj Note" : "Nowa Note"}
            </DialogTitle>
            <DialogDescription>
              Twórz notatki i przypisuj kontekst.
            </DialogDescription>
          </DialogHeader>
          <NoteEditor
            key={editingNote?.id || "new"}
            loops={loops}
            quests={quests}
            ops={ops}
            initial={{
              type: editingNote?.type || "text",
              title: editingNote?.title || "",
              content: editingNote?.content || "",
              tags: editingNote?.tags || [],
              isResearch: editingNote?.is_research || false,
              isExperience: editingNote?.is_experience || false,
              loopSlug:
                editingNote?.loop_slug ||
                selectedLoopSlug ||
                selectedQuest?.loop_slug ||
                selectedCampaign?.loop_slug ||
                null,
              questId: editingNote?.quest_id || selectedQuestId || null,
              opId: editingNote?.op_id || selectedOpId || null,
            }}
            onSave={handleSaveNote}
            onCancel={() => setNoteDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
