import { Mic, MicOff } from "lucide-react";

interface Props {
  isRecording: boolean;
  onStop: () => void;
}

export default function DictationOverlay({ isRecording, onStop }: Props) {
  if (!isRecording) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full bg-red-500 px-6 py-3 text-white shadow-lg">
        <div className="relative">
          <Mic className="h-5 w-5" />
          <span className="absolute -right-1 -top-1 h-2 w-2 animate-ping rounded-full bg-white" />
        </div>
        <span className="text-sm font-medium">Listening...</span>
        <button
          onClick={onStop}
          className="rounded-full bg-white/20 p-1.5 hover:bg-white/30"
        >
          <MicOff className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
