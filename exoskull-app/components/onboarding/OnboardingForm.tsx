"use client";

import { useState } from "react";
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
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface OnboardingFormProps {
  onComplete: () => void;
}

interface OnboardingData {
  preferred_name: string;
  primary_goal: string;
  secondary_goals: string[];
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

interface QuestionConfig {
  id: keyof OnboardingData;
  title: string;
  subtitle?: string;
  type: "text" | "select" | "multiselect" | "textarea" | "time" | "toggle";
  options?: { value: string; label: string; icon?: string }[];
  placeholder?: string;
  required?: boolean;
  icon: React.ReactNode;
}

// ============================================================================
// QUESTIONS CONFIG
// ============================================================================

const QUESTIONS: QuestionConfig[] = [
  {
    id: "preferred_name",
    title: "Jak mam się do Ciebie zwracać?",
    subtitle: "Imię, pseudonim, cokolwiek - jak wolisz.",
    type: "text",
    placeholder: "np. Tomek, Kasia, Boss...",
    required: true,
    icon: <User className="w-6 h-6" />,
  },
  {
    id: "primary_goal",
    title: "Co jest Twoim głównym celem?",
    subtitle: "Wybierz to, co teraz jest najważniejsze.",
    type: "select",
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
  {
    id: "secondary_goals",
    title: "Które obszary chcesz ogarnąć?",
    subtitle: "Wybierz wszystkie, które Cię interesują.",
    type: "multiselect",
    options: [
      { value: "health", label: "Zdrowie" },
      { value: "work", label: "Praca" },
      { value: "finance", label: "Finanse" },
      { value: "relationships", label: "Relacje" },
      { value: "habits", label: "Nawyki" },
      { value: "sleep", label: "Sen" },
      { value: "sport", label: "Sport" },
      { value: "learning", label: "Nauka" },
    ],
    icon: <Sparkles className="w-6 h-6" />,
  },
  {
    id: "challenge",
    title: "Największe wyzwanie?",
    subtitle: "Co najbardziej Ci teraz przeszkadza? Napisz swoimi słowami.",
    type: "textarea",
    placeholder:
      'np. "Nie mogę się skupić", "Za dużo na głowie", "Nie śpię dobrze"...',
    icon: <Target className="w-6 h-6" />,
  },
  {
    id: "communication_style",
    title: "Jak mam z Tobą rozmawiać?",
    subtitle: "Każdy styl działa inaczej.",
    type: "select",
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
    type: "select",
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
    type: "time",
    placeholder: "07:00",
    icon: <Clock className="w-6 h-6" />,
  },
  {
    id: "evening_checkin_time",
    title: "Wieczorny check-in",
    subtitle: "O której mam zapytać jak minął dzień?",
    type: "time",
    placeholder: "21:00",
    icon: <Clock className="w-6 h-6" />,
  },
  {
    id: "quiet_hours_start",
    title: "Godziny ciszy - początek",
    subtitle: "Od której mam nie przeszkadzać?",
    type: "time",
    placeholder: "22:00",
    icon: <Clock className="w-6 h-6" />,
  },
  {
    id: "quiet_hours_end",
    title: "Godziny ciszy - koniec",
    subtitle: "Od której mogę się odezwać?",
    type: "time",
    placeholder: "07:00",
    icon: <Clock className="w-6 h-6" />,
  },
  {
    id: "devices",
    title: "Jakich urządzeń używasz?",
    subtitle: "Pomaga mi dopasować integracje.",
    type: "multiselect",
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
    type: "select",
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
    type: "select",
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
    type: "toggle",
    icon: <Clock className="w-6 h-6" />,
  },
  {
    id: "notes",
    title: "Cokolwiek jeszcze?",
    subtitle: "Opcjonalne. Coś co powinienem wiedzieć?",
    type: "textarea",
    placeholder: 'np. "Mam ADHD", "Pracuję nocami", "Lubię żarty"...',
    icon: <Sparkles className="w-6 h-6" />,
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function OnboardingForm({ onComplete }: OnboardingFormProps) {
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    preferred_name: "",
    primary_goal: "",
    secondary_goals: [],
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

  const question = QUESTIONS[step];
  const totalSteps = QUESTIONS.length;
  const progress = ((step + 1) / totalSteps) * 100;

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

  const canProceed = () => {
    if (!question.required) return true;
    const value = data[question.id];
    if (Array.isArray(value)) return value.length > 0;
    return !!value;
  };

  const nextStep = () => {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const prevStep = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Save profile data
      const response = await fetch("/api/onboarding/save-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        console.error("[OnboardingForm] save-profile failed:", {
          status: response.status,
          body: errorBody,
        });
        throw new Error(errorBody.error || `Save failed (${response.status})`);
      }

      // Mark onboarding as complete
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
  // RENDER HELPERS
  // ============================================================================

  const renderInput = () => {
    const value = data[question.id];

    switch (question.type) {
      case "text":
        return (
          <input
            type="text"
            value={(value as string) || ""}
            onChange={(e) => updateField(question.id, e.target.value)}
            placeholder={question.placeholder}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && canProceed() && nextStep()}
          />
        );

      case "textarea":
        return (
          <textarea
            value={(value as string) || ""}
            onChange={(e) => updateField(question.id, e.target.value)}
            placeholder={question.placeholder}
            rows={3}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg resize-none"
            autoFocus
          />
        );

      case "select":
        return (
          <div className="grid grid-cols-1 gap-3">
            {question.options?.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  updateField(question.id, option.value);
                  // Auto-advance on select
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
            {question.options?.map((option) => {
              const selected = ((value as string[]) || []).includes(
                option.value,
              );
              return (
                <button
                  key={option.value}
                  onClick={() => toggleMultiSelect(question.id, option.value)}
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
            value={(value as string) || question.placeholder || ""}
            onChange={(e) => updateField(question.id, e.target.value)}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
          />
        );

      case "toggle":
        return (
          <div className="flex gap-4">
            <button
              onClick={() => {
                updateField(question.id, true);
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
                updateField(question.id, false);
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
                {step + 1} / {totalSteps}
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

          {/* Question icon */}
          <div className="flex items-center gap-3 mb-2 text-blue-400">
            {question.icon}
          </div>

          {/* Question title */}
          <h2 className="text-2xl font-semibold text-white mb-1">
            {question.title}
          </h2>

          {question.subtitle && (
            <p className="text-slate-400 mb-6">{question.subtitle}</p>
          )}

          {/* Input */}
          <div className="mb-8">{renderInput()}</div>

          {/* Navigation */}
          <div className="flex justify-between">
            <Button
              onClick={prevStep}
              variant="ghost"
              className="text-slate-400 hover:text-white"
              disabled={step === 0}
            >
              <ChevronLeft className="w-5 h-5 mr-1" />
              Wstecz
            </Button>

            {question.type !== "select" && question.type !== "toggle" && (
              <Button
                onClick={nextStep}
                disabled={question.required && !canProceed()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {step === totalSteps - 1 ? (
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

            {/* Skip button for optional questions */}
            {!question.required &&
              question.type !== "select" &&
              question.type !== "toggle" && (
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
