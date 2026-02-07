"use client";

import { useState } from "react";
import { BirthChat } from "@/components/onboarding/BirthChat";
import { BirthVoice } from "@/components/onboarding/BirthVoice";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, MessageSquare } from "lucide-react";

type OnboardingMode = "choice" | "voice" | "chat";

export default function OnboardingPage() {
  const [mode, setMode] = useState<OnboardingMode>("choice");

  if (mode === "voice") {
    return <BirthVoice onBack={() => setMode("choice")} />;
  }

  if (mode === "chat") {
    return <BirthChat onBack={() => setMode("choice")} />;
  }

  return (
    <div className="w-full max-w-2xl space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold text-white">Witaj w ExoSkull</h1>
        <p className="text-slate-400 text-lg">
          Jak chcesz się poznać? Wybierz sposób, który Ci bardziej odpowiada.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Voice option */}
        <button onClick={() => setMode("voice")} className="text-left">
          <Card className="bg-slate-800/50 border-slate-700 hover:border-blue-500 transition-colors cursor-pointer h-full">
            <CardContent className="p-6 space-y-4">
              <div className="w-12 h-12 rounded-lg bg-blue-600/20 flex items-center justify-center">
                <Mic className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Porozmawiaj głosem
                </h2>
                <p className="text-slate-400 mt-1 text-sm">
                  Mów do mikrofonu. IORS odpowie głosem — jak rozmowa z
                  przyjacielem.
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
                <h2 className="text-xl font-semibold text-white">Napisz</h2>
                <p className="text-slate-400 mt-1 text-sm">
                  Napisz do IORS. Opowiedz o sobie w naturalny sposób, a system
                  sam wyciągnie wnioski.
                </p>
              </div>
            </CardContent>
          </Card>
        </button>
      </div>
    </div>
  );
}
