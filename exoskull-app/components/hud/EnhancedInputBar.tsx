"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
  Target,
  BookOpen,
  Puzzle,
  Link,
} from "lucide-react";
import { useDictation } from "@/lib/hooks/useDictation";
import { cn } from "@/lib/utils";
import type { UseChatEngineReturn } from "@/lib/hooks/useChatEngine";

// ---------------------------------------------------------------------------
// Slash commands — extended with navigation
// ---------------------------------------------------------------------------

interface SlashCommand {
  command: string;
  label: string;
  description: string;
  icon: React.ElementType;
  prefix: string;
  category: "core" | "communication" | "creation" | "system" | "navigation";
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
    description: "Uruchom multi-agent debate",
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
    description: "Zmien glos AI",
    icon: AudioWaveform,
    prefix: "Zmien glos na: ",
    category: "communication",
  },
  // ── Creation ──
  {
    command: "/document",
    label: "Document",
    description: "Wygeneruj dokument",
    icon: FileText,
    prefix: "Wygeneruj dokument: ",
    category: "creation",
  },
  {
    command: "/web",
    label: "Web",
    description: "Przeszukaj internet",
    icon: Globe,
    prefix: "Przeszukaj internet: ",
    category: "creation",
  },
  // ── System ──
  {
    command: "/status",
    label: "Status",
    description: "Status systemu i zadan",
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
    command: "/health",
    label: "Health",
    description: "Dane zdrowotne",
    icon: Heart,
    prefix: "Pokaz dane zdrowotne: ",
    category: "system",
  },
  {
    command: "/diagnostics",
    label: "Diagnostics",
    description: "Diagnostyka systemu",
    icon: Cpu,
    prefix: "Uruchom diagnostyke: ",
    category: "system",
  },
  // ── Navigation (new) ──
  {
    command: "/goals",
    label: "Goals",
    description: "Pokaz cele",
    icon: Target,
    prefix: "Pokaz moje cele: ",
    category: "navigation",
  },
  {
    command: "/apps",
    label: "Apps",
    description: "Pokaz aplikacje",
    icon: Puzzle,
    prefix: "Pokaz moje aplikacje: ",
    category: "navigation",
  },
  {
    command: "/knowledge",
    label: "Knowledge",
    description: "Pokaz baze wiedzy",
    icon: BookOpen,
    prefix: "Pokaz baze wiedzy: ",
    category: "navigation",
  },
  {
    command: "/settings",
    label: "Settings",
    description: "Ustawienia systemu",
    icon: Settings,
    prefix: "Pokaz ustawienia: ",
    category: "navigation",
  },
  {
    command: "/integrations",
    label: "Integrations",
    description: "Pokaz integracje",
    icon: Link,
    prefix: "Pokaz integracje: ",
    category: "navigation",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  core: "Glowne",
  communication: "Komunikacja",
  creation: "Tworzenie",
  system: "System",
  navigation: "Nawigacja",
};

const UPLOAD_ACCEPT =
  ".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.pptx,.ppt,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EnhancedInputBarProps {
  engine: UseChatEngineReturn;
}

export function EnhancedInputBar({ engine }: EnhancedInputBarProps) {
  const [input, setInput] = useState("");
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashHighlight, setSlashHighlight] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isListening, isSupported, interimTranscript, toggleListening } =
    useDictation({
      onFinalTranscript: (text) => {
        setDictationError(null);
        engine.sendMessage(text, "voice_transcript");
      },
      onError: (err) => {
        setDictationError(err);
        setTimeout(() => setDictationError(null), 4000);
      },
    });

  // ── Slash command filtering ──

  const slashQuery = useMemo(() => {
    if (!input.startsWith("/")) return null;
    const spaceIdx = input.indexOf(" ");
    if (spaceIdx > 0) return null;
    return input.toLowerCase();
  }, [input]);

  const filteredCommands = useMemo(() => {
    if (!slashQuery) return [];
    return SLASH_COMMANDS.filter((c) => c.command.startsWith(slashQuery));
  }, [slashQuery]);

  const groupedCommands = useMemo(() => {
    const groups: Record<string, SlashCommand[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  useEffect(() => {
    if (filteredCommands.length > 0 && slashQuery) {
      setSlashMenuOpen(true);
      setSlashHighlight(0);
    } else {
      setSlashMenuOpen(false);
    }
  }, [filteredCommands.length, slashQuery]);

  const selectSlashCommand = useCallback((cmd: SlashCommand) => {
    setInput(cmd.prefix);
    setSlashMenuOpen(false);
    textareaRef.current?.focus();
  }, []);

  // Auto-resize
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const handleSend = useCallback(() => {
    if (!input.trim() || engine.isLoading) return;
    engine.sendMessage(input.trim(), "text");
    setInput("");
    setSlashMenuOpen(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, engine]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (slashMenuOpen && filteredCommands.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashHighlight((h) => (h + 1) % filteredCommands.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashHighlight(
            (h) => (h - 1 + filteredCommands.length) % filteredCommands.length,
          );
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          selectSlashCommand(filteredCommands[slashHighlight]);
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
      filteredCommands,
      slashHighlight,
      selectSlashCommand,
    ],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      for (let i = 0; i < files.length; i++) {
        engine.handleFileUpload(files[i]);
      }
      e.target.value = "";
    },
    [engine],
  );

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

  let flatIdx = 0;

  return (
    <div className="relative">
      {/* Slash command popup */}
      {slashMenuOpen && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-card/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-[300px] overflow-y-auto">
          <div className="px-3 py-1.5 border-b border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Komendy
            </span>
            <span className="text-[9px] text-muted-foreground/40">
              Tab/Enter = wybierz
            </span>
          </div>

          {Object.entries(groupedCommands).map(([category, cmds]) => (
            <div key={category}>
              <div className="px-3 pt-2 pb-1">
                <span className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-wider">
                  {CATEGORY_LABELS[category] || category}
                </span>
              </div>
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

      {/* Interim transcript / error */}
      {(interimTranscript || dictationError) && (
        <div className="px-4 py-2 mb-1 rounded-lg bg-card/60 backdrop-blur-xl border border-white/5">
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
      />

      {/* Glass-morphism input bar */}
      <div className="rounded-2xl bg-card/70 backdrop-blur-xl border border-white/10 shadow-2xl p-3">
        <div className="flex items-end gap-2">
          {/* File upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={engine.isLoading}
            className="p-2.5 rounded-full transition-colors shrink-0 bg-muted/50 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Wgraj plik"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* TTS toggle */}
          <button
            onClick={engine.toggleTTS}
            className={cn(
              "p-2.5 rounded-full transition-colors shrink-0",
              engine.isSpeaking
                ? "bg-primary text-primary-foreground animate-pulse"
                : engine.ttsEnabled
                  ? "bg-muted/50 text-foreground hover:bg-accent"
                  : "bg-muted/50 text-muted-foreground hover:bg-accent",
            )}
            title={engine.ttsEnabled ? "Wylacz TTS" : "Wlacz TTS"}
          >
            {engine.ttsEnabled ? (
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
              className="flex-1 bg-transparent border-0 rounded-xl px-3 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none text-sm resize-none min-h-[42px] max-h-[120px]"
              disabled={engine.isLoading}
              rows={1}
            />
          )}

          {/* Mic button */}
          {isSupported && (
            <button
              onClick={toggleListening}
              disabled={engine.isLoading}
              className={cn(
                "p-2.5 rounded-full transition-colors shrink-0",
                isListening
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "bg-muted/50 text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              title={isListening ? "Zatrzymaj" : "Mow"}
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
            disabled={!input.trim() || engine.isLoading}
            className="p-2.5 bg-primary hover:bg-primary/90 disabled:bg-muted/50 disabled:text-muted-foreground text-primary-foreground rounded-full transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
