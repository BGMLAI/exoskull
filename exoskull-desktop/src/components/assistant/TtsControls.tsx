import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Volume2, VolumeX, Loader2 } from "lucide-react";

interface Props {
  isSpeaking: boolean;
}

export default function TtsControls({ isSpeaking }: Props) {
  const [stopping, setStopping] = useState(false);

  const handleStop = async () => {
    setStopping(true);
    try {
      await invoke("stop_speaking");
    } catch (err) {
      console.error("Failed to stop TTS:", err);
    } finally {
      setStopping(false);
    }
  };

  if (!isSpeaking) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="flex items-center gap-3 rounded-full bg-primary px-5 py-2.5 text-primary-foreground shadow-lg">
        <Volume2 className="h-4 w-4 animate-pulse" />
        <span className="text-sm font-medium">Speaking...</span>
        <button
          onClick={handleStop}
          disabled={stopping}
          className="rounded-full bg-white/20 p-1.5 hover:bg-white/30"
        >
          {stopping ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <VolumeX className="h-3 w-3" />
          )}
        </button>
      </div>
    </div>
  );
}
