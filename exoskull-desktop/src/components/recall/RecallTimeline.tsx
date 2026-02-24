import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Calendar, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

interface RecallEntry {
  id: number;
  timestamp: string;
  app_name: string | null;
  window_title: string | null;
  ocr_text: string | null;
  image_path: string;
  thumbnail_path: string | null;
  synced: boolean;
}

export default function RecallTimeline() {
  const [entries, setEntries] = useState<RecallEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [selectedEntry, setSelectedEntry] = useState<RecallEntry | null>(null);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const data = await invoke<RecallEntry[]>("get_recall_timeline", {
        date: selectedDate,
        limit: 200,
        offset: 0,
      });
      setEntries(data || []);
    } catch (err) {
      console.error("Failed to load timeline:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, [selectedDate]);

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  // Group entries by hour
  const grouped = entries.reduce<Record<string, RecallEntry[]>>(
    (acc, entry) => {
      const hour = new Date(entry.timestamp).getHours().toString().padStart(2, "0") + ":00";
      if (!acc[hour]) acc[hour] = [];
      acc[hour].push(entry);
      return acc;
    },
    {}
  );

  return (
    <div>
      {/* Date selector */}
      <div className="mb-4 flex items-center gap-4">
        <button
          onClick={() => changeDate(-1)}
          className="rounded-lg p-2 hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={() => changeDate(1)}
          className="rounded-lg p-2 hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="text-sm text-muted-foreground">
          {entries.length} captures
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Calendar className="mb-2 h-12 w-12" />
          <p>No captures for this date</p>
          <p className="mt-1 text-xs">Enable Recall to start capturing</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([hour, hourEntries]) => (
              <div key={hour}>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  {hour}
                </h3>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                  {hourEntries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className={`group relative aspect-video overflow-hidden rounded-lg border transition-all hover:ring-2 hover:ring-primary ${
                        selectedEntry?.id === entry.id
                          ? "border-primary ring-2 ring-primary"
                          : "border-border"
                      }`}
                    >
                      <div className="flex h-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </div>
                      {entry.app_name && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[9px] text-white truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {entry.app_name}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Detail panel */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-lg border border-border bg-card p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-medium">
                  {new Date(selectedEntry.timestamp).toLocaleString()}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedEntry.app_name} — {selectedEntry.window_title}
                </p>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="rounded-lg px-3 py-1 text-sm hover:bg-muted"
              >
                Close
              </button>
            </div>
            <div className="rounded-lg bg-muted p-8 text-center text-sm text-muted-foreground">
              Screenshot: {selectedEntry.image_path}
            </div>
            {selectedEntry.ocr_text && (
              <div className="mt-3">
                <h4 className="mb-1 text-sm font-medium">Extracted Text</h4>
                <pre className="max-h-40 overflow-y-auto rounded-lg bg-muted p-3 text-xs">
                  {selectedEntry.ocr_text}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
