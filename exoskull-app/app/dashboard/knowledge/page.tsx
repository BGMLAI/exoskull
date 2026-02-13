"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Knowledge components
import { KnowledgeHeader } from "@/components/knowledge/KnowledgeHeader";
import { HierarchyView } from "@/components/knowledge/HierarchyView";
import { NotesView } from "@/components/knowledge/NotesView";
import { FileUploadZone } from "@/components/knowledge/FileUploadZone";
import { DocumentsList } from "@/components/knowledge/DocumentsList";

// Form dialogs
import { LoopFormDialog } from "@/components/knowledge/LoopFormDialog";
import { CampaignFormDialog } from "@/components/knowledge/CampaignFormDialog";
import { QuestFormDialog } from "@/components/knowledge/QuestFormDialog";
import { OpFormDialog } from "@/components/knowledge/OpFormDialog";
import { NoteEditor, NoteEditorData } from "@/components/knowledge/NoteEditor";

// Types
import {
  Loop,
  Campaign,
  Quest,
  Op,
  Note,
  NoteType,
  CreateLoopInput,
  CreateCampaignInput,
  CreateQuestInput,
  CreateOpInput,
} from "@/lib/types/knowledge";

// API helpers
import {
  createLoop,
  updateLoop,
  deleteLoop,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  createQuest,
  updateQuest,
  deleteQuest,
  createOp,
  updateOp,
  deleteOp,
  toggleOpStatus,
  createNote,
  updateNote,
} from "@/lib/api/knowledge";

// ============================================================================
// TYPES
// ============================================================================

type TabType = "hierarchy" | "notes" | "documents";

interface Document {
  id: string;
  filename: string;
  original_name: string;
  file_type: string;
  file_size: number;
  category: string;
  status: string;
  created_at: string;
}

// ============================================================================
// PAGE
// ============================================================================

export default function KnowledgePage() {
  const supabase = createClient();

  // Auth state
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>("hierarchy");
  const [searchQuery, setSearchQuery] = useState("");

  // Hierarchy data
  const [loops, setLoops] = useState<Loop[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [ops, setOps] = useState<Op[]>([]);

  // Loading states
  const [loopsLoading, setLoopsLoading] = useState(true);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [questsLoading, setQuestsLoading] = useState(false);
  const [opsLoading, setOpsLoading] = useState(false);

  // Selection state
  const [selectedLoop, setSelectedLoop] = useState<Loop | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(
    null,
  );
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);

  // Notes state
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesTotal, setNotesTotal] = useState(0);
  const [noteTypeFilter, setNoteTypeFilter] = useState<NoteType | null>(null);

  // Documents state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);

  // Dialog state
  const [loopDialogOpen, setLoopDialogOpen] = useState(false);
  const [editingLoop, setEditingLoop] = useState<Loop | undefined>();
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<
    Campaign | undefined
  >();
  const [questDialogOpen, setQuestDialogOpen] = useState(false);
  const [editingQuest, setEditingQuest] = useState<Quest | undefined>();
  const [opDialogOpen, setOpDialogOpen] = useState(false);
  const [editingOp, setEditingOp] = useState<Op | undefined>();
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | undefined>();

  // ============================================================================
  // AUTH
  // ============================================================================

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setTenantId(user.id);
      }
    }
    loadUser();
  }, []);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const fetchLoops = useCallback(async () => {
    if (!tenantId) return;
    setLoopsLoading(true);
    try {
      const res = await fetch(
        `/api/knowledge/loops?tenantId=${tenantId}&withStats=true`,
      );
      if (!res.ok) throw new Error("Failed to fetch loops");
      const data = await res.json();
      setLoops(data.loops || []);
    } catch (error) {
      console.error("[Knowledge] Fetch loops error:", error);
      toast.error("Nie udalo sie zaladowac biegunow");
    } finally {
      setLoopsLoading(false);
    }
  }, [tenantId]);

  const fetchCampaigns = useCallback(
    async (loopSlug?: string) => {
      if (!tenantId) return;
      setCampaignsLoading(true);
      try {
        const params = new URLSearchParams({ tenantId });
        if (loopSlug) params.set("loopSlug", loopSlug);
        const res = await fetch(`/api/knowledge/campaigns?${params}`);
        if (!res.ok) throw new Error("Failed to fetch campaigns");
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      } catch (error) {
        console.error("[Knowledge] Fetch campaigns error:", error);
      } finally {
        setCampaignsLoading(false);
      }
    },
    [tenantId],
  );

  const fetchQuests = useCallback(
    async (campaignId?: string, loopSlug?: string) => {
      if (!tenantId) return;
      setQuestsLoading(true);
      try {
        const params = new URLSearchParams({ tenantId });
        if (campaignId) params.set("campaignId", campaignId);
        if (loopSlug) params.set("loopSlug", loopSlug);
        const res = await fetch(`/api/knowledge/quests?${params}`);
        if (!res.ok) throw new Error("Failed to fetch quests");
        const data = await res.json();
        setQuests(data.quests || []);
      } catch (error) {
        console.error("[Knowledge] Fetch quests error:", error);
      } finally {
        setQuestsLoading(false);
      }
    },
    [tenantId],
  );

  const fetchOps = useCallback(
    async (questId?: string, loopSlug?: string) => {
      if (!tenantId) return;
      setOpsLoading(true);
      try {
        const params = new URLSearchParams({ tenantId });
        if (questId) params.set("questId", questId);
        if (loopSlug) params.set("loopSlug", loopSlug);
        const res = await fetch(`/api/knowledge/ops?${params}`);
        if (!res.ok) throw new Error("Failed to fetch ops");
        const data = await res.json();
        setOps(data.ops || []);
      } catch (error) {
        console.error("[Knowledge] Fetch ops error:", error);
      } finally {
        setOpsLoading(false);
      }
    },
    [tenantId],
  );

  const fetchNotes = useCallback(
    async (type?: NoteType | null) => {
      if (!tenantId) return;
      setNotesLoading(true);
      try {
        const params = new URLSearchParams({ tenantId });
        if (type) params.set("type", type);
        const res = await fetch(`/api/knowledge/notes?${params}`);
        if (!res.ok) throw new Error("Failed to fetch notes");
        const data = await res.json();
        setNotes(data.notes || []);
        setNotesTotal(data.total || 0);
      } catch (error) {
        console.error("[Knowledge] Fetch notes error:", error);
        toast.error("Nie udalo sie zaladowac notatek");
      } finally {
        setNotesLoading(false);
      }
    },
    [tenantId],
  );

  const fetchDocuments = useCallback(async () => {
    if (!tenantId) return;
    setDocumentsLoading(true);
    try {
      const { data, error } = await supabase
        .from("exo_user_documents")
        .select(
          "id, filename, original_name, file_type, file_size, category, status, created_at",
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("[Knowledge] Fetch documents error:", error);
    } finally {
      setDocumentsLoading(false);
    }
  }, [tenantId]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Load initial data when tenantId is available
  useEffect(() => {
    if (!tenantId) return;
    fetchLoops();
    // Also init default loops if none exist
    fetch(`/api/knowledge/loops?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.loops || data.loops.length === 0) {
          // Create default loops
          fetch("/api/knowledge/loops", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId, initDefaults: true }),
          }).then(() => fetchLoops());
        }
      })
      .catch(() => {});
  }, [tenantId, fetchLoops]);

  // Load campaigns when loop selected
  useEffect(() => {
    if (selectedLoop) {
      fetchCampaigns(selectedLoop.slug);
    } else {
      setCampaigns([]);
      fetchCampaigns(); // Load all campaigns
    }
    setSelectedCampaign(null);
    setSelectedQuest(null);
    setQuests([]);
    setOps([]);
  }, [selectedLoop, fetchCampaigns]);

  // Load quests when campaign selected
  useEffect(() => {
    if (selectedCampaign) {
      fetchQuests(selectedCampaign.id);
    } else if (selectedLoop) {
      fetchQuests(undefined, selectedLoop.slug);
    } else {
      setQuests([]);
    }
    setSelectedQuest(null);
    setOps([]);
  }, [selectedCampaign, selectedLoop, fetchQuests]);

  // Load ops when quest selected
  useEffect(() => {
    if (selectedQuest) {
      fetchOps(selectedQuest.id);
    } else if (selectedLoop) {
      fetchOps(undefined, selectedLoop.slug);
    } else {
      setOps([]);
    }
  }, [selectedQuest, selectedLoop, fetchOps]);

  // Load notes when tab switches to notes
  useEffect(() => {
    if (activeTab === "notes") {
      fetchNotes(noteTypeFilter);
    }
  }, [activeTab, noteTypeFilter, fetchNotes]);

  // Load documents when tab switches to documents
  useEffect(() => {
    if (activeTab === "documents") {
      fetchDocuments();
    }
  }, [activeTab, fetchDocuments]);

  // ============================================================================
  // HANDLERS — CRUD
  // ============================================================================

  const handleSaveLoop = async (input: CreateLoopInput) => {
    if (!tenantId) return;
    if (editingLoop) {
      await updateLoop(tenantId, editingLoop.id, input);
      toast.success("Biegun zaktualizowany");
    } else {
      await createLoop(tenantId, input);
      toast.success("Biegun utworzony");
    }
    setEditingLoop(undefined);
    fetchLoops();
  };

  const handleSaveCampaign = async (input: CreateCampaignInput) => {
    if (!tenantId) return;
    if (editingCampaign) {
      await updateCampaign(tenantId, editingCampaign.id, input);
      toast.success("Kampania zaktualizowana");
    } else {
      await createCampaign(tenantId, input);
      toast.success("Kampania utworzona");
    }
    setEditingCampaign(undefined);
    fetchCampaigns(selectedLoop?.slug);
  };

  const handleSaveQuest = async (input: CreateQuestInput) => {
    if (!tenantId) return;
    if (editingQuest) {
      await updateQuest(tenantId, editingQuest.id, input);
      toast.success("Quest zaktualizowany");
    } else {
      await createQuest(tenantId, input);
      toast.success("Quest utworzony");
    }
    setEditingQuest(undefined);
    fetchQuests(selectedCampaign?.id, selectedLoop?.slug);
  };

  const handleSaveOp = async (input: CreateOpInput) => {
    if (!tenantId) return;
    if (editingOp) {
      await updateOp(tenantId, editingOp.id, input);
      toast.success("Op zaktualizowany");
    } else {
      await createOp(tenantId, input);
      toast.success("Op utworzony");
    }
    setEditingOp(undefined);
    fetchOps(selectedQuest?.id, selectedLoop?.slug);
  };

  const handleToggleOpStatus = async (op: Op) => {
    if (!tenantId) return;
    try {
      await toggleOpStatus(tenantId, op.id, op.status);
      fetchOps(selectedQuest?.id, selectedLoop?.slug);
    } catch (error) {
      console.error("[Knowledge] Toggle op status error:", error);
      toast.error("Nie udalo sie zmienic statusu");
    }
  };

  // ─── DELETE HANDLERS ───
  const handleDeleteLoop = async (loop: Loop) => {
    if (!tenantId) return;
    if (
      !confirm(
        `Usunąć biegun "${loop.name}"? Wszystkie kampanie, questy i opy w tym biegunie zostaną osierocone.`,
      )
    )
      return;
    try {
      await deleteLoop(tenantId, loop.id);
      toast.success(`Biegun "${loop.name}" usunięty`);
      if (selectedLoop?.id === loop.id) setSelectedLoop(null);
      fetchLoops();
    } catch (error) {
      console.error("[Knowledge] Delete loop error:", error);
      toast.error("Nie udało się usunąć bieguna");
    }
  };

  const handleDeleteCampaign = async (campaign: Campaign) => {
    if (!tenantId) return;
    if (!confirm(`Usunąć kampanię "${campaign.title}"?`)) return;
    try {
      await deleteCampaign(tenantId, campaign.id);
      toast.success(`Kampania "${campaign.title}" usunięta`);
      if (selectedCampaign?.id === campaign.id) setSelectedCampaign(null);
      fetchCampaigns(selectedLoop?.slug);
    } catch (error) {
      console.error("[Knowledge] Delete campaign error:", error);
      toast.error("Nie udało się usunąć kampanii");
    }
  };

  const handleDeleteQuest = async (quest: Quest) => {
    if (!tenantId) return;
    if (!confirm(`Usunąć quest "${quest.title}"?`)) return;
    try {
      await deleteQuest(tenantId, quest.id);
      toast.success(`Quest "${quest.title}" usunięty`);
      if (selectedQuest?.id === quest.id) setSelectedQuest(null);
      fetchQuests(selectedCampaign?.id, selectedLoop?.slug);
    } catch (error) {
      console.error("[Knowledge] Delete quest error:", error);
      toast.error("Nie udało się usunąć questu");
    }
  };

  const handleDeleteOp = async (op: Op) => {
    if (!tenantId) return;
    if (!confirm(`Usunąć op "${op.title}"?`)) return;
    try {
      await deleteOp(tenantId, op.id);
      toast.success(`Op "${op.title}" usunięty`);
      fetchOps(selectedQuest?.id, selectedLoop?.slug);
    } catch (error) {
      console.error("[Knowledge] Delete op error:", error);
      toast.error("Nie udało się usunąć opa");
    }
  };

  const handleSaveNote = async (data: NoteEditorData) => {
    if (!tenantId) return;
    try {
      if (editingNote) {
        await updateNote(tenantId, editingNote.id, {
          type: data.type,
          title: data.title || undefined,
          content: data.content || undefined,
          tags: data.tags,
          isResearch: data.isResearch,
          isExperience: data.isExperience,
          loopSlug: data.loopSlug || undefined,
          questId: data.questId || undefined,
          opId: data.opId || undefined,
        });
        toast.success("Notatka zaktualizowana");
      } else {
        await createNote(tenantId, {
          type: data.type,
          title: data.title || undefined,
          content: data.content || undefined,
          tags: data.tags,
          isResearch: data.isResearch,
          isExperience: data.isExperience,
          loopSlug: data.loopSlug || undefined,
          questId: data.questId || undefined,
          opId: data.opId || undefined,
        });
        toast.success("Notatka utworzona");
      }
      setNoteDialogOpen(false);
      setEditingNote(undefined);
      fetchNotes(noteTypeFilter);
    } catch (error) {
      console.error("[Knowledge] Save note error:", error);
      toast.error("Nie udalo sie zapisac notatki");
    }
  };

  // ============================================================================
  // DIALOG OPENERS
  // ============================================================================

  const openAddLoop = () => {
    setEditingLoop(undefined);
    setLoopDialogOpen(true);
  };

  const openEditLoop = (loop: Loop) => {
    setEditingLoop(loop);
    setLoopDialogOpen(true);
  };

  const openAddCampaign = () => {
    setEditingCampaign(undefined);
    setCampaignDialogOpen(true);
  };

  const openEditCampaign = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setCampaignDialogOpen(true);
  };

  const openAddQuest = () => {
    setEditingQuest(undefined);
    setQuestDialogOpen(true);
  };

  const openEditQuest = (quest: Quest) => {
    setEditingQuest(quest);
    setQuestDialogOpen(true);
  };

  const openAddOp = () => {
    setEditingOp(undefined);
    setOpDialogOpen(true);
  };

  const openEditOp = (op: Op) => {
    setEditingOp(op);
    setOpDialogOpen(true);
  };

  const openAddNote = () => {
    setEditingNote(undefined);
    setNoteDialogOpen(true);
  };

  const openEditNote = (note: Note) => {
    setEditingNote(note);
    setNoteDialogOpen(true);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!tenantId) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-muted-foreground">Ladowanie...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header with tabs */}
      <KnowledgeHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddLoop={openAddLoop}
        onAddCampaign={openAddCampaign}
        onAddQuest={openAddQuest}
        onAddOp={openAddOp}
        onAddNote={openAddNote}
      />

      {/* Tab content */}
      {activeTab === "hierarchy" && (
        <HierarchyView
          loops={loops}
          campaigns={campaigns}
          quests={quests}
          ops={ops}
          loopsLoading={loopsLoading}
          campaignsLoading={campaignsLoading}
          questsLoading={questsLoading}
          opsLoading={opsLoading}
          selectedLoop={selectedLoop}
          selectedCampaign={selectedCampaign}
          selectedQuest={selectedQuest}
          onSelectLoop={setSelectedLoop}
          onSelectCampaign={setSelectedCampaign}
          onSelectQuest={setSelectedQuest}
          onEditLoop={openEditLoop}
          onEditCampaign={openEditCampaign}
          onEditQuest={openEditQuest}
          onEditOp={openEditOp}
          onDeleteLoop={handleDeleteLoop}
          onDeleteCampaign={handleDeleteCampaign}
          onDeleteQuest={handleDeleteQuest}
          onDeleteOp={handleDeleteOp}
          onToggleOpStatus={handleToggleOpStatus}
          onAddLoop={openAddLoop}
          onAddCampaign={openAddCampaign}
          onAddQuest={openAddQuest}
          onAddOp={openAddOp}
        />
      )}

      {activeTab === "notes" && (
        <NotesView
          notes={notes}
          loading={notesLoading}
          total={notesTotal}
          typeFilter={noteTypeFilter}
          onTypeFilterChange={setNoteTypeFilter}
          onEditNote={openEditNote}
          onAddNote={openAddNote}
        />
      )}

      {activeTab === "documents" && (
        <div className="space-y-6">
          <FileUploadZone
            tenantId={tenantId}
            onUploadComplete={fetchDocuments}
          />
          <DocumentsList
            documents={documents}
            loading={documentsLoading}
            tenantId={tenantId}
            onRefresh={fetchDocuments}
          />
        </div>
      )}

      {/* ── Form Dialogs ── */}

      <LoopFormDialog
        open={loopDialogOpen}
        onOpenChange={(open) => {
          setLoopDialogOpen(open);
          if (!open) setEditingLoop(undefined);
        }}
        loop={editingLoop}
        onSave={handleSaveLoop}
      />

      <CampaignFormDialog
        open={campaignDialogOpen}
        onOpenChange={(open) => {
          setCampaignDialogOpen(open);
          if (!open) setEditingCampaign(undefined);
        }}
        campaign={editingCampaign}
        loops={loops}
        defaultLoopSlug={selectedLoop?.slug}
        onSave={handleSaveCampaign}
      />

      <QuestFormDialog
        open={questDialogOpen}
        onOpenChange={(open) => {
          setQuestDialogOpen(open);
          if (!open) setEditingQuest(undefined);
        }}
        quest={editingQuest}
        loops={loops}
        campaigns={campaigns}
        defaultCampaignId={selectedCampaign?.id}
        defaultLoopSlug={selectedLoop?.slug}
        onSave={handleSaveQuest}
      />

      <OpFormDialog
        open={opDialogOpen}
        onOpenChange={(open) => {
          setOpDialogOpen(open);
          if (!open) setEditingOp(undefined);
        }}
        op={editingOp}
        loops={loops}
        quests={quests}
        defaultQuestId={selectedQuest?.id}
        defaultLoopSlug={selectedLoop?.slug}
        onSave={handleSaveOp}
      />

      {/* Note editor in a dialog */}
      <Dialog
        open={noteDialogOpen}
        onOpenChange={(open) => {
          setNoteDialogOpen(open);
          if (!open) setEditingNote(undefined);
        }}
      >
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingNote ? "Edytuj notatke" : "Nowa notatka"}
            </DialogTitle>
          </DialogHeader>
          <NoteEditor
            loops={loops}
            quests={quests}
            ops={ops}
            initial={
              editingNote
                ? {
                    type: editingNote.type,
                    title: editingNote.title || "",
                    content: editingNote.content || "",
                    tags: editingNote.tags || [],
                    isResearch: editingNote.is_research,
                    isExperience: editingNote.is_experience,
                    loopSlug: editingNote.loop_slug,
                    questId: editingNote.quest_id,
                    opId: editingNote.op_id,
                  }
                : {
                    type: "text" as NoteType,
                    title: "",
                    content: "",
                    tags: [],
                    isResearch: false,
                    isExperience: false,
                    loopSlug: selectedLoop?.slug || null,
                    questId: selectedQuest?.id || null,
                    opId: null,
                  }
            }
            onSave={handleSaveNote}
            onCancel={() => {
              setNoteDialogOpen(false);
              setEditingNote(undefined);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
