"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChevronRight,
  ChevronLeft,
  Loader2,
  Check,
  User,
  Target,
  MessageSquare,
  Clock,
  Globe,
  Sparkles,
  Plus,
  X,
  Repeat,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface OnboardingFormProps {
  onComplete: () => void;
}

interface LoopSelection {
  slug: string;
  name: string;
  icon: string;
  color: string;
  isCustom: boolean;
  aspects: [string, string, string];
}

interface OnboardingData {
  preferred_name: string;
  primary_goal: string;
  selected_loops: LoopSelection[];
  challenge: string;
  communication_style: string;
  preferred_channel: string;
  morning_checkin_time: string;
  evening_checkin_time: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  devices: string[];
  autonomy_level: string;
  language: string;
  timezone: string;
  weekend_checkins: boolean;
  notes: string;
}

// Step types: "question" = standard question, "loops" = loop picker, "aspects" = per-loop aspects
type StepType = "question" | "loops" | "aspects";

interface Step {
  type: StepType;
  // For "question" steps:
  questionId?: keyof OnboardingData;
  title: string;
  subtitle?: string;
  inputType?:
    | "text"
    | "select"
    | "multiselect"
    | "textarea"
    | "time"
    | "toggle";
  options?: { value: string; label: string; icon?: string }[];
  placeholder?: string;
  required?: boolean;
  icon: React.ReactNode;
  // For "aspects" steps:
  loopIndex?: number;
}

// ============================================================================
// PREDEFINED LOOPS
// ============================================================================

interface LoopOption {
  slug: string;
  name: string;
  icon: string;
  color: string;
}

const PREDEFINED_LOOPS: LoopOption[] = [
  { slug: "health", name: "Zdrowie", icon: "💪", color: "#10B981" },
  { slug: "work", name: "Praca", icon: "💼", color: "#3B82F6" },
  { slug: "relationships", name: "Relacje", icon: "👥", color: "#EC4899" },
  { slug: "finance", name: "Finanse", icon: "💰", color: "#F59E0B" },
  { slug: "growth", name: "Rozwój", icon: "🌱", color: "#8B5CF6" },
  { slug: "creativity", name: "Kreatywność", icon: "🎨", color: "#F472B6" },
  { slug: "fun", name: "Rozrywka", icon: "🎮", color: "#22D3EE" },
  { slug: "habits", name: "Nawyki", icon: "🔄", color: "#A78BFA" },
  { slug: "sleep", name: "Sen", icon: "😴", color: "#6366F1" },
  { slug: "sport", name: "Sport", icon: "⚽", color: "#EF4444" },
  { slug: "learning", name: "Nauka", icon: "📚", color: "#14B8A6" },
];

// Suggested aspect placeholders per loop slug
const ASPECT_HINTS: Record<string, string[]> = {
  health: ["np. jakość snu", "np. regularność ćwiczeń", "np. dieta"],
  work: ["np. produktywność", "np. zarządzanie czasem", "np. relacje w pracy"],
  relationships: ["np. czas z rodziną", "np. znajomi", "np. partner/ka"],
  finance: ["np. oszczędności", "np. inwestycje", "np. budżet miesięczny"],
  growth: ["np. czytanie", "np. medytacja", "np. nowe umiejętności"],
  creativity: ["np. pisanie", "np. muzyka", "np. rysowanie"],
  fun: ["np. gry", "np. filmy", "np. podróże"],
  habits: [
    "np. poranna rutyna",
    "np. nawyki zdrowotne",
    "np. nawyki produktywne",
  ],
  sleep: ["np. pora zasypiania", "np. jakość snu", "np. rutyna wieczorna"],
  sport: ["np. bieganie", "np. siłownia", "np. rozciąganie"],
  learning: ["np. kursy online", "np. języki obce", "np. książki"],
};

const DEFAULT_HINTS = ["np. aspekt 1", "np. aspekt 2", "np. aspekt 3"];

// ============================================================================
// STATIC QUESTIONS (before and after loops)
// ============================================================================

interface QuestionDef {
  id: keyof OnboardingData;
  title: string;
  subtitle?: string;
  inputType: "text" | "select" | "multiselect" | "textarea" | "time" | "toggle";
  options?: { value: string; label: string; icon?: string }[];
  placeholder?: string;
  required?: boolean;
  icon: React.ReactNode;
}

const QUESTIONS_BEFORE_LOOPS: QuestionDef[] = [
  {
    id: "preferred_name",
    title: "Jak mam się do Ciebie zwracać?",
    subtitle: "Imię, pseudonim, cokolwiek - jak wolisz.",
    inputType: "text",
    placeholder: "np. Tomek, Kasia, Boss...",
    required: true,
    icon: <User className="w-6 h-6" />,
  },
  {
    id: "primary_goal",
    title: "Co jest Twoim głównym celem?",
    subtitle: "Wybierz to, co teraz jest najważniejsze.",
    inputType: "select",
    options: [
      { value: "productivity", label: "Produktywność", icon: "🎯" },
      { value: "health", label: "Zdrowie", icon: "💪" },
      { value: "growth", label: "Rozwój osobisty", icon: "📈" },
      { value: "work_life", label: "Work-life balance", icon: "⚖️" },
      { value: "other", label: "Inne", icon: "✨" },
    ],
    required: true,
    icon: <Target className="w-6 h-6" />,
  },
];

const QUESTIONS_AFTER_LOOPS: QuestionDef[] = [
  {
    id: "challenge",
    title: "Największe wyzwanie?",
    subtitle: "Co najbardziej Ci teraz przeszkadza? Napisz swoimi słowami.",
    inputType: "textarea",
    placeholder:
      'np. "Nie mogę się skupić", "Za dużo na głowie", "Nie śpię dobrze"...',
    icon: <Target className="w-6 h-6" />,
  },
  {
    id: "communication_style",
    title: "Jak mam z Tobą rozmawiać?",
    subtitle: "Każdy styl działa inaczej.",
    inputType: "select",
    options: [
      { value: "direct", label: "Bezpośrednio", icon: "⚡" },
      { value: "warm", label: "Ciepło", icon: "🤗" },
      { value: "coaching", label: "Coaching", icon: "🧠" },
    ],
    required: true,
    icon: <MessageSquare className="w-6 h-6" />,
  },
  {
    id: "preferred_channel",
    title: "Głos czy tekst?",
    subtitle: "Jak wolisz się ze mną kontaktować?",
    inputType: "select",
    options: [
      { value: "voice", label: "Głos", icon: "🎙️" },
      { value: "sms", label: "Tekst/SMS", icon: "💬" },
      { value: "both", label: "Oba", icon: "🔄" },
    ],
    icon: <MessageSquare className="w-6 h-6" />,
  },
  {
    id: "morning_checkin_time",
    title: "Poranny check-in",
    subtitle: "O której mam się odezwać rano?",
    inputType: "time",
    placeholder: "07:00",
    icon: <Clock className="w-6 h-6" />,
  },
  {
    id: "evening_checkin_time",
    title: "Wieczorny check-in",
    subtitle: "O której mam zapytać jak minął dzień?",
    inputType: "time",
    placeholder: "21:00",
    icon: <Clock className="w-6 h-6" />,
  },
  {
    id: "quiet_hours_start",
    title: "Godziny ciszy - początek",
    subtitle: "Od której mam nie przeszkadzać?",
    inputType: "time",
    placeholder: "22:00",
    icon: <Clock className="w-6 h-6" />,
  },
  {
    id: "quiet_hours_end",
    title: "Godziny ciszy - koniec",
    subtitle: "Od której mogę się odezwać?",
    inputType: "time",
    placeholder: "07:00",
    icon: <Clock className="w-6 h-6" />,
  },
  {
    id: "devices",
    title: "Jakich urządzeń używasz?",
    subtitle: "Pomaga mi dopasować integracje.",
    inputType: "multiselect",
    options: [
      { value: "android", label: "Android" },
      { value: "iphone", label: "iPhone" },
      { value: "smartwatch", label: "Smartwatch" },
      { value: "oura", label: "Oura Ring" },
      { value: "laptop", label: "Laptop" },
      { value: "tablet", label: "Tablet" },
    ],
    icon: <Globe className="w-6 h-6" />,
  },
  {
    id: "autonomy_level",
    title: "Ile autonomii mi dajesz?",
    subtitle: "Jak bardzo mogę działać sam?",
    inputType: "select",
    options: [
      { value: "ask", label: "Pytaj o wszystko", icon: "🔒" },
      { value: "minor", label: "Drobnostki sam, reszta pytaj", icon: "🔓" },
      { value: "full", label: "Pełna autonomia", icon: "🚀" },
    ],
    icon: <Sparkles className="w-6 h-6" />,
  },
  {
    id: "language",
    title: "Język",
    subtitle: "W jakim języku mam mówić?",
    inputType: "select",
    options: [
      { value: "pl", label: "Polski", icon: "🇵🇱" },
      { value: "en", label: "English", icon: "🇬🇧" },
    ],
    required: true,
    icon: <Globe className="w-6 h-6" />,
  },
  {
    id: "weekend_checkins",
    title: "Check-iny w weekendy?",
    subtitle: "Czy mam się odzywać też w sobotę i niedzielę?",
    inputType: "toggle",
    icon: <Clock className="w-6 h-6" />,
  },
  {
    id: "notes",
    title: "Cokolwiek jeszcze?",
    subtitle: "Opcjonalne. Coś co powinienem wiedzieć?",
    inputType: "textarea",
    placeholder: 'np. "Mam ADHD", "Pracuję nocami", "Lubię żarty"...',
    icon: <Sparkles className="w-6 h-6" />,
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function OnboardingForm({ onComplete }: OnboardingFormProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [customLoopName, setCustomLoopName] = useState("");

  const [data, setData] = useState<OnboardingData>({
    preferred_name: "",
    primary_goal: "",
    selected_loops: [],
    challenge: "",
    communication_style: "direct",
    preferred_channel: "voice",
    morning_checkin_time: "07:00",
    evening_checkin_time: "21:00",
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
    devices: [],
    autonomy_level: "minor",
    language: "pl",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    weekend_checkins: false,
    notes: "",
  });

  // ============================================================================
  // BUILD DYNAMIC STEPS
  // ============================================================================

  const steps: Step[] = useMemo(() => {
    const result: Step[] = [];

    // Pre-loop questions
    for (const q of QUESTIONS_BEFORE_LOOPS) {
      result.push({
        type: "question",
        questionId: q.id,
        title: q.title,
        subtitle: q.subtitle,
        inputType: q.inputType,
        options: q.options,
        placeholder: q.placeholder,
        required: q.required,
        icon: q.icon,
      });
    }

    // Loops selection step
    result.push({
      type: "loops",
      title: "Które obszary życia chcesz śledzić?",
      subtitle: "Wybierz swoje Loops - możesz też dodać własne.",
      required: true,
      icon: <Repeat className="w-6 h-6" />,
    });

    // Dynamic aspect steps (one per selected loop)
    for (let i = 0; i < data.selected_loops.length; i++) {
      const loop = data.selected_loops[i];
      result.push({
        type: "aspects",
        loopIndex: i,
        title: `${loop.icon} ${loop.name} - co dokładnie?`,
        subtitle: "Podaj 3 konkretne aspekty, które chcesz śledzić.",
        required: true,
        icon: <Target className="w-6 h-6" />,
      });
    }

    // Post-loop questions
    for (const q of QUESTIONS_AFTER_LOOPS) {
      result.push({
        type: "question",
        questionId: q.id,
        title: q.title,
        subtitle: q.subtitle,
        inputType: q.inputType,
        options: q.options,
        placeholder: q.placeholder,
        required: q.required,
        icon: q.icon,
      });
    }

    return result;
  }, [data.selected_loops]);

  const currentStep = steps[stepIndex];
  const totalSteps = steps.length;
  const progress = ((stepIndex + 1) / totalSteps) * 100;

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const updateField = (field: keyof OnboardingData, value: any) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleMultiSelect = (field: keyof OnboardingData, value: string) => {
    const current = (data[field] as string[]) || [];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateField(field, updated);
  };

  const toggleLoop = (loopOpt: LoopOption) => {
    setData((prev) => {
      const exists = prev.selected_loops.find((l) => l.slug === loopOpt.slug);
      if (exists) {
        return {
          ...prev,
          selected_loops: prev.selected_loops.filter(
            (l) => l.slug !== loopOpt.slug,
          ),
        };
      }
      return {
        ...prev,
        selected_loops: [
          ...prev.selected_loops,
          {
            slug: loopOpt.slug,
            name: loopOpt.name,
            icon: loopOpt.icon,
            color: loopOpt.color,
            isCustom: false,
            aspects: ["", "", ""],
          },
        ],
      };
    });
  };

  const addCustomLoop = () => {
    const name = customLoopName.trim();
    if (!name) return;
    const slug = name
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    if (data.selected_loops.find((l) => l.slug === slug)) return;

    setData((prev) => ({
      ...prev,
      selected_loops: [
        ...prev.selected_loops,
        {
          slug,
          name,
          icon: "✨",
          color: "#94A3B8",
          isCustom: true,
          aspects: ["", "", ""],
        },
      ],
    }));
    setCustomLoopName("");
  };

  const updateAspect = (
    loopIndex: number,
    aspectIndex: number,
    value: string,
  ) => {
    setData((prev) => {
      const loops = [...prev.selected_loops];
      const aspects = [...loops[loopIndex].aspects] as [string, string, string];
      aspects[aspectIndex] = value;
      loops[loopIndex] = { ...loops[loopIndex], aspects };
      return { ...prev, selected_loops: loops };
    });
  };

  const canProceed = (): boolean => {
    if (!currentStep) return false;

    if (currentStep.type === "loops") {
      return data.selected_loops.length > 0;
    }

    if (currentStep.type === "aspects") {
      const loop = data.selected_loops[currentStep.loopIndex!];
      return loop.aspects.every((a) => a.trim().length > 0);
    }

    // Standard question
    if (!currentStep.required) return true;
    const value = data[currentStep.questionId!];
    if (Array.isArray(value)) return value.length > 0;
    return !!value;
  };

  const nextStep = () => {
    if (stepIndex < totalSteps - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      handleSubmit();
    }
  };

  const prevStep = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        ...data,
        // Backward compat: secondary_goals = slugs of selected loops
        secondary_goals: data.selected_loops.map((l) => l.slug),
      };

      const response = await fetch("/api/onboarding/save-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        console.error("[OnboardingForm] save-profile failed:", {
          status: response.status,
          body: errorBody,
        });
        throw new Error(errorBody.error || `Save failed (${response.status})`);
      }

      const completeResponse = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "form" }),
      });

      if (!completeResponse.ok) {
        const errorBody = await completeResponse.json().catch(() => ({}));
        console.error("[OnboardingForm] complete failed:", {
          status: completeResponse.status,
          body: errorBody,
        });
        throw new Error(
          errorBody.error || `Complete failed (${completeResponse.status})`,
        );
      }

      onComplete();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nieznany blad";
      console.error("[OnboardingForm] Submit error:", message);
      setRetryCount((prev) => prev + 1);
      setSubmitError(
        retryCount >= 2
          ? `Nie udalo sie zapisac (${message}). Sprobuj wylogowac sie i zalogowac ponownie.`
          : `Cos poszlo nie tak (${message}). Sprobuj ponownie.`,
      );
      setIsSubmitting(false);
    }
  };

  // ============================================================================
  // RENDER: LOOPS PICKER
  // ============================================================================

  const renderLoopsPicker = () => {
    const selectedSlugs = data.selected_loops.map((l) => l.slug);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {PREDEFINED_LOOPS.map((loop) => {
            const selected = selectedSlugs.includes(loop.slug);
            return (
              <button
                key={loop.slug}
                onClick={() => toggleLoop(loop)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all text-left ${
                  selected
                    ? "bg-blue-600/30 border-blue-500 text-white"
                    : "bg-slate-700/30 border-slate-600 text-slate-300 hover:bg-slate-700/60"
                }`}
              >
                <span className="text-lg">{loop.icon}</span>
                <span className="text-base">{loop.name}</span>
                {selected && (
                  <Check className="w-4 h-4 ml-auto text-blue-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Custom loops already added */}
        {data.selected_loops
          .filter((l) => l.isCustom)
          .map((loop) => (
            <div
              key={loop.slug}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border bg-blue-600/30 border-blue-500 text-white"
            >
              <span className="text-lg">{loop.icon}</span>
              <span className="text-base">{loop.name}</span>
              <button
                onClick={() =>
                  setData((prev) => ({
                    ...prev,
                    selected_loops: prev.selected_loops.filter(
                      (l) => l.slug !== loop.slug,
                    ),
                  }))
                }
                className="ml-auto text-slate-400 hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

        {/* Add custom loop */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customLoopName}
            onChange={(e) => setCustomLoopName(e.target.value)}
            placeholder="Dodaj własny loop..."
            className="flex-1 bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyDown={(e) => e.key === "Enter" && addCustomLoop()}
          />
          <Button
            onClick={addCustomLoop}
            disabled={!customLoopName.trim()}
            className="bg-slate-600 hover:bg-slate-500 text-white px-4"
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>
      </div>
    );
  };

  // ============================================================================
  // RENDER: ASPECTS INPUT
  // ============================================================================

  const renderAspectsInput = (loopIndex: number) => {
    const loop = data.selected_loops[loopIndex];
    if (!loop) return null;

    const hints = ASPECT_HINTS[loop.slug] || DEFAULT_HINTS;

    return (
      <div className="space-y-4">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
          style={{ backgroundColor: `${loop.color}20`, color: loop.color }}
        >
          <span className="text-lg">{loop.icon}</span>
          <span className="font-medium">{loop.name}</span>
        </div>

        {[0, 1, 2].map((i) => (
          <div key={i}>
            <label className="block text-sm text-slate-400 mb-1">
              Aspekt {i + 1}
            </label>
            <input
              type="text"
              value={loop.aspects[i] || ""}
              onChange={(e) => updateAspect(loopIndex, i, e.target.value)}
              placeholder={hints[i] || `Aspekt ${i + 1}`}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              autoFocus={i === 0}
              onKeyDown={(e) => {
                if (e.key === "Enter" && i === 2 && canProceed()) {
                  nextStep();
                }
              }}
            />
          </div>
        ))}
      </div>
    );
  };

  // ============================================================================
  // RENDER: STANDARD QUESTION INPUT
  // ============================================================================

  const renderQuestionInput = () => {
    if (!currentStep || currentStep.type !== "question") return null;
    const value = data[currentStep.questionId!];

    switch (currentStep.inputType) {
      case "text":
        return (
          <input
            type="text"
            value={(value as string) || ""}
            onChange={(e) =>
              updateField(currentStep.questionId!, e.target.value)
            }
            placeholder={currentStep.placeholder}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && canProceed() && nextStep()}
          />
        );

      case "textarea":
        return (
          <textarea
            value={(value as string) || ""}
            onChange={(e) =>
              updateField(currentStep.questionId!, e.target.value)
            }
            placeholder={currentStep.placeholder}
            rows={3}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg resize-none"
            autoFocus
          />
        );

      case "select":
        return (
          <div className="grid grid-cols-1 gap-3">
            {currentStep.options?.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  updateField(currentStep.questionId!, option.value);
                  setTimeout(() => nextStep(), 300);
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                  value === option.value
                    ? "bg-blue-600/30 border-blue-500 text-white"
                    : "bg-slate-700/30 border-slate-600 text-slate-300 hover:bg-slate-700/60 hover:border-slate-500"
                }`}
              >
                {option.icon && <span className="text-xl">{option.icon}</span>}
                <span className="text-lg">{option.label}</span>
                {value === option.value && (
                  <Check className="w-5 h-5 ml-auto text-blue-400" />
                )}
              </button>
            ))}
          </div>
        );

      case "multiselect":
        return (
          <div className="grid grid-cols-2 gap-3">
            {currentStep.options?.map((option) => {
              const selected = ((value as string[]) || []).includes(
                option.value,
              );
              return (
                <button
                  key={option.value}
                  onClick={() =>
                    toggleMultiSelect(currentStep.questionId!, option.value)
                  }
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                    selected
                      ? "bg-blue-600/30 border-blue-500 text-white"
                      : "bg-slate-700/30 border-slate-600 text-slate-300 hover:bg-slate-700/60"
                  }`}
                >
                  <span className="text-base">{option.label}</span>
                  {selected && (
                    <Check className="w-4 h-4 ml-auto text-blue-400" />
                  )}
                </button>
              );
            })}
          </div>
        );

      case "time":
        return (
          <input
            type="time"
            value={(value as string) || currentStep.placeholder || ""}
            onChange={(e) =>
              updateField(currentStep.questionId!, e.target.value)
            }
            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
          />
        );

      case "toggle":
        return (
          <div className="flex gap-4">
            <button
              onClick={() => {
                updateField(currentStep.questionId!, true);
                setTimeout(() => nextStep(), 300);
              }}
              className={`flex-1 px-6 py-4 rounded-xl border text-lg transition-all ${
                value === true
                  ? "bg-blue-600/30 border-blue-500 text-white"
                  : "bg-slate-700/30 border-slate-600 text-slate-300 hover:bg-slate-700/60"
              }`}
            >
              Tak
            </button>
            <button
              onClick={() => {
                updateField(currentStep.questionId!, false);
                setTimeout(() => nextStep(), 300);
              }}
              className={`flex-1 px-6 py-4 rounded-xl border text-lg transition-all ${
                value === false
                  ? "bg-blue-600/30 border-blue-500 text-white"
                  : "bg-slate-700/30 border-slate-600 text-slate-300 hover:bg-slate-700/60"
              }`}
            >
              Nie
            </button>
          </div>
        );
    }
  };

  // ============================================================================
  // RENDER: STEP CONTENT
  // ============================================================================

  const renderStepContent = () => {
    if (!currentStep) return null;

    if (currentStep.type === "loops") {
      return renderLoopsPicker();
    }

    if (currentStep.type === "aspects") {
      return renderAspectsInput(currentStep.loopIndex!);
    }

    return renderQuestionInput();
  };

  // Should we hide the "Dalej" button? (select and toggle auto-advance)
  const isAutoAdvance =
    currentStep?.type === "question" &&
    (currentStep.inputType === "select" || currentStep.inputType === "toggle");

  // Is this step skippable?
  const isSkippable =
    !currentStep?.required && !isAutoAdvance && currentStep?.type !== "aspects";

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isSubmitting) {
    return (
      <Card className="w-full max-w-lg bg-slate-800/50 border-slate-700">
        <CardContent className="p-12 text-center">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-6" />
          <h2 className="text-2xl font-semibold text-white mb-2">
            Przygotowuję Twojego IORSa...
          </h2>
          <p className="text-slate-400">
            Konfiguruję system na podstawie Twoich preferencji.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {submitError && (
        <div className="w-full max-w-lg mb-4 p-4 bg-red-900/30 border border-red-700/50 rounded-xl text-red-300 text-sm">
          <p>{submitError}</p>
          <button
            onClick={handleSubmit}
            className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
          >
            Sprobuj ponownie
          </button>
        </div>
      )}
      <Card className="w-full max-w-lg bg-slate-800/50 border-slate-700">
        <CardContent className="p-8">
          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex justify-between text-sm text-slate-500 mb-2">
              <span>
                {stepIndex + 1} / {totalSteps}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Step icon */}
          <div className="flex items-center gap-3 mb-2 text-blue-400">
            {currentStep?.icon}
          </div>

          {/* Step title */}
          <h2 className="text-2xl font-semibold text-white mb-1">
            {currentStep?.title}
          </h2>

          {currentStep?.subtitle && (
            <p className="text-slate-400 mb-6">{currentStep.subtitle}</p>
          )}

          {/* Step content */}
          <div className="mb-8">{renderStepContent()}</div>

          {/* Navigation */}
          <div className="flex justify-between">
            <Button
              onClick={prevStep}
              variant="ghost"
              className="text-slate-400 hover:text-white"
              disabled={stepIndex === 0}
            >
              <ChevronLeft className="w-5 h-5 mr-1" />
              Wstecz
            </Button>

            {!isAutoAdvance && (
              <Button
                onClick={nextStep}
                disabled={currentStep?.required && !canProceed()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {stepIndex === totalSteps - 1 ? (
                  <>
                    Gotowe
                    <Check className="w-5 h-5 ml-1" />
                  </>
                ) : (
                  <>
                    Dalej
                    <ChevronRight className="w-5 h-5 ml-1" />
                  </>
                )}
              </Button>
            )}

            {isSkippable && (
              <Button
                onClick={nextStep}
                variant="ghost"
                className="text-slate-500 hover:text-slate-300"
              >
                Pomiń
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
