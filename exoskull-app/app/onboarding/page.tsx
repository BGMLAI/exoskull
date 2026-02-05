"use client";

import { useState } from "react";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { DiscoveryChat } from "@/components/onboarding/DiscoveryChat";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, MessageSquare } from "lucide-react";

type OnboardingMode = "choice" | "form" | "chat";

export default function OnboardingPage() {
  const [mode, setMode] = useState<OnboardingMode>("choice");

  const handleComplete = () => {
    window.location.href = "/dashboard";
  };

  const handleChatComplete = (_conversationId: string) => {
    window.location.href = "/dashboard";
  };

  if (mode === "form") {
    return <OnboardingForm onComplete={handleComplete} />;
  }

  if (mode === "chat") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <DiscoveryChat
          onComplete={handleChatComplete}
          onBack={() => setMode("choice")}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-white">Witaj w ExoSkull</h1>
          <p className="text-slate-400 text-lg">
            Jak chcesz rozpoczac? Wybierz sposob, ktory Ci bardziej odpowiada.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Form option */}
          <button onClick={() => setMode("form")} className="text-left">
            <Card className="bg-slate-800/50 border-slate-700 hover:border-blue-500 transition-colors cursor-pointer h-full">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 rounded-lg bg-blue-600/20 flex items-center justify-center">
                  <ClipboardList className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Formularz
                  </h2>
                  <p className="text-slate-400 mt-1 text-sm">
                    Szybki formularz krok po kroku. Wypelnij podstawowe
                    informacje o sobie w kilka minut.
                  </p>
                </div>
              </CardContent>
            </Card>
          </button>

          {/* Chat option */}
          <button onClick={() => setMode("chat")} className="text-left">
            <Card className="bg-slate-800/50 border-slate-700 hover:border-blue-500 transition-colors cursor-pointer h-full">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 rounded-lg bg-blue-600/20 flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Rozmowa</h2>
                  <p className="text-slate-400 mt-1 text-sm">
                    Porozmawiaj z AI. Opowiedz o sobie w naturalny sposob, a
                    system sam wyciagnie wnioski.
                  </p>
                </div>
              </CardContent>
            </Card>
          </button>
        </div>
      </div>
    </div>
  );
}
