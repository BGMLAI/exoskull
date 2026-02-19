"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
// TTS state/logic managed by UnifiedStream, VoiceInputBar receives controlled props
import {
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Paperclip,
  Hammer,
  Search,
  Mail,
  Phone,
  Activity,
  AlertTriangle,
  Settings,
  Heart,
  Swords,
  Sparkles,
  AudioWaveform,
  Globe,
  FileText,
  Cpu,
} from "lucide-react";
import { useDictation } from "@/lib/hooks/useDictation";
import { ChannelSelector } from "@/components/conversation/ChannelSelector";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Slash command definitions — categorized
// ---------------------------------------------------------------------------

interface SlashCommand {
  command: string;
  label: string;
  description: string;
  icon: React.ElementType;
  /** Prefix to prepend when the user selects this command */
  prefix: string;
  /** Category for grouped display */
  category: "core" | "communication" | "creation" | "system";
}

const SLASH_COMMANDS: SlashCommand[] = [
  // ── Core ──
  {
    command: "/build",
    label: "Build",
    description: "Zbuduj nowa aplikacje lub funkcjonalnosc",
    icon: Hammer,
    prefix: "Zbuduj aplikacje: ",
    category: "core",
  },
  {
    command: "/search",
    label: "Search",
    description: "Przeszukaj baze wiedzy i internet",
    icon: Search,
    prefix: "Przeszukaj baze wiedzy: ",
    category: "core",
  },
  {
    command: "/debate",
    label: "Debate",
    description: "Uruchom multi-agent debate (wiele perspektyw)",
    icon: Swords,
    prefix: "Przeprowadz debate na temat: ",
    category: "core",
  },
  {
    command: "/skill",
    label: "Skill",
    description: "Uruchom lub zainstaluj skill",
    icon: Sparkles,
    prefix: "Uruchom skill: ",
    category: "core",
  },
  // ── Communication ──
  {
    command: "/email",
    label: "Email",
    description: "Przeszukaj, podsumuj lub wyslij emaile",
    icon: Mail,
    prefix: "Podsumuj emaile: ",
    category: "communication",
  },
  {
    command: "/call",
    label: "Call",
    description: "Zadzwon lub sprawdz rozmowy",
    icon: Phone,
    prefix: "Zadzwon do: ",
    category: "communication",
  },
  {
    command: "/voice",
    label: "Voice",
    description: "Zmien glos AI (11Labs Voice ID)",
    icon: AudioWaveform,
    prefix: "Zmien glos na: ",
    category: "communication",
  },
  // ── Creation ──
  {
    command: "/document",
    label: "Document",
    description: "Wygeneruj dokument (Word, PDF, prezentacja)",
    icon: FileText,
    prefix: "Wygeneruj dokument: ",
    category: "creation",
  },
  {
    command: "/web",
    label: "Web",
    description: "Przeszukaj lub pobierz strone internetowa",
    icon: Globe,
    prefix: "Przeszukaj internet: ",
    category: "creation",
  },
  // ── System ──
  {
    command: "/status",
    label: "Status",
    description: "Status systemu, integracji i zadan",
    icon: Activity,
    prefix: "Pokaz status: ",
    category: "system",
  },
  {
    command: "/priority",
    label: "Priority",
    description: "Ustaw priorytet zadania",
    icon: AlertTriangle,
    prefix: "Ustaw priorytet: ",
    category: "system",
  },
  {
    command: "/settings",
    label: "Settings",
    description: "Zmien ustawienia systemu",
    icon: Settings,
    prefix: "Zmien ustawienia: ",
    category: "system",
  },
  {
    command: "/health",
    label: "Health",
    description: "Dane zdrowotne i samopoczucie",
    icon: Heart,
    prefix: "Pokaz dane zdrowotne: ",
    category: "system",
  },
  {
    command: "/diagnostics",
    label: "Diagnostics",
    description: "Diagnostyka systemu ExoSkull",
    icon: Cpu,
    prefix: "Uruchom diagnostyke: ",
    category: "system",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  core: "Glowne",
  communication: "Komunikacja",
  creation: "Tworzenie",
  system: "System",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const UPLOAD_ACCEPT =
  ".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.pptx,.ppt,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov";

interface VoiceInputBarProps {
  onSendText: (text: string) => void;
  onSendVoice: (transcript: string) => void;
  onFileUpload?: (file: File) => void;
  isLoading: boolean;
  /** Controlled TTS state from UnifiedStream */
  ttsEnabled?: boolean;
  isSpeaking?: boolean;
  onToggleTTS?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VoiceInputBar({
  onSendText,
  onSendVoice,
  onFileUpload,
  isLoading,
  ttsEnabled = false,
  isSpeaking = false,
  onToggleTTS,
}: VoiceInputBarProps) {
  const [input, setInput] = useState("");
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashHighlight, setSlashHighlight] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dictation hook (MediaRecorder + Whisper)
  const { isListening, isSupported, interimTranscript, toggleListening } =
    useDictation({
      onFinalTranscript: (text) => {
        setDictationError(null);
        onSendVoice(text);
      },
      onError: (err) => {
        setDictationError(err);
        setTimeout(() => setDictationError(null), 4000);
      },
    });

  // ---------------------------------------------------------------------------
  // Slash command filtering (with category grouping)
  // ---------------------------------------------------------------------------

  const slashQuery = useMemo(() => {
    if (!input.startsWith("/")) return null;
    // Only show menu when typing slash command (no space yet = still picking command)
    const spaceIdx = input.indexOf(" ");
    if (spaceIdx > 0) return null; // Command already selected, user is typing args
    return input.toLowerCase();
  }, [input]);

  const filteredCommands = useMemo(() => {
    if (!slashQuery) return [];
    return SLASH_COMMANDS.filter((c) => c.command.startsWith(slashQuery));
  }, [slashQuery]);

  // Group filtered commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, SlashCommand[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  // Flat list for keyboard navigation
  const flatFilteredCommands = filteredCommands;

  // Open/close slash menu based on matches
  useEffect(() => {
    if (flatFilteredCommands.length > 0 && slashQuery) {
      setSlashMenuOpen(true);
      setSlashHighlight(0);
    } else {
      setSlashMenuOpen(false);
    }
  }, [flatFilteredCommands.length, slashQuery]);

  const selectSlashCommand = useCallback((cmd: SlashCommand) => {
    setInput(cmd.prefix);
    setSlashMenuOpen(false);
    textareaRef.current?.focus();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  // Handle send
  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    onSendText(input.trim());
    setInput("");
    setSlashMenuOpen(false);
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, isLoading, onSendText]);

  // Handle key down
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Slash menu keyboard navigation
      if (slashMenuOpen && flatFilteredCommands.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashHighlight((h) => (h + 1) % flatFilteredCommands.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashHighlight(
            (h) =>
              (h - 1 + flatFilteredCommands.length) %
              flatFilteredCommands.length,
          );
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          selectSlashCommand(flatFilteredCommands[slashHighlight]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlashMenuOpen(false);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [
      handleSend,
      slashMenuOpen,
      flatFilteredCommands,
      slashHighlight,
      selectSlashCommand,
    ],
  );

  // File picker handler
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      for (let i = 0; i < files.length; i++) {
        onFileUpload?.(files[i]);
      }
      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [onFileUpload],
  );

  // Voice recording waveform bars
  const WaveformBars = () => (
    <div className="flex items-center gap-0.5 h-6">
      {[0, 100, 200, 150, 50].map((delay, i) => (
        <div
          key={i}
          className="w-1 bg-destructive rounded-full animate-wave-bar"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );

  // Track flat index for grouped rendering
  let flatIdx = 0;

  return (
    <div className="border-t bg-card relative">
      {/* Slash command autocomplete popup — grouped by category */}
      {slashMenuOpen && flatFilteredCommands.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50 max-h-[300px] overflow-y-auto">
          <div className="px-3 py-1.5 border-b border-border/50 flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Komendy
            </span>
            <span className="text-[9px] text-muted-foreground/40">
              Tab/Enter = wybierz · Esc = zamknij
            </span>
          </div>

          {Object.entries(groupedCommands).map(([category, cmds]) => (
            <div key={category}>
              {/* Category header */}
              <div className="px-3 pt-2 pb-1">
                <span className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-wider">
                  {CATEGORY_LABELS[category] || category}
                </span>
              </div>

              {/* Commands in category */}
              {cmds.map((cmd) => {
                const Icon = cmd.icon;
                const currentIdx = flatIdx;
                flatIdx++;
                return (
                  <button
                    key={cmd.command}
                    onClick={() => selectSlashCommand(cmd)}
                    onMouseEnter={() => setSlashHighlight(currentIdx)}
                    className={cn(
                      "flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors",
                      currentIdx === slashHighlight
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    <div
                      className={cn(
                        "p-1 rounded-md flex-shrink-0",
                        currentIdx === slashHighlight
                          ? "bg-primary/10"
                          : "bg-muted/50",
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium font-mono">
                          {cmd.command}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50">
                          {cmd.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground/60 block truncate">
                        {cmd.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Interim transcript / error display */}
      {(interimTranscript || dictationError) && (
        <div className="px-4 py-2 border-b bg-muted/30">
          <p
            className={cn(
              "text-xs",
              dictationError
                ? "text-destructive"
                : "text-muted-foreground italic",
            )}
          >
            {dictationError || interimTranscript}
          </p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        onChange={handleFileChange}
        className="hidden"
        data-voice-upload="true"
      />

      {/* Input bar */}
      <div className="p-3">
        <div className="flex items-end gap-2">
          {/* Channel selector */}
          <ChannelSelector />

          {/* File upload */}
          {onFileUpload && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="p-2.5 rounded-full transition-colors shrink-0 bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Wgraj plik do bazy wiedzy"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          )}

          {/* TTS toggle */}
          <button
            onClick={onToggleTTS}
            className={cn(
              "p-2.5 rounded-full transition-colors shrink-0",
              isSpeaking
                ? "bg-primary text-primary-foreground animate-pulse"
                : ttsEnabled
                  ? "bg-muted text-foreground hover:bg-accent"
                  : "bg-muted text-muted-foreground hover:bg-accent",
            )}
            title={
              isSpeaking
                ? "Zatrzymaj czytanie"
                : ttsEnabled
                  ? "Wylacz czytanie na glos"
                  : "Wlacz czytanie na glos"
            }
          >
            {ttsEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>

          {/* Text input / waveform */}
          {isListening ? (
            <div className="flex-1 flex items-center justify-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-2.5 min-h-[42px]">
              <WaveformBars />
              <span className="text-sm text-destructive font-medium">
                Nagrywam...
              </span>
              <WaveformBars />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Napisz wiadomosc... (/ = komendy)"
              className="flex-1 bg-muted border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-sm resize-none min-h-[42px] max-h-[120px]"
              disabled={isLoading}
              rows={1}
            />
          )}

          {/* Mic button */}
          {isSupported && (
            <button
              onClick={toggleListening}
              disabled={isLoading}
              className={cn(
                "p-2.5 rounded-full transition-colors shrink-0",
                isListening
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              title={isListening ? "Zatrzymaj nagrywanie" : "Mow"}
            >
              {isListening ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-2.5 bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground rounded-full transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
