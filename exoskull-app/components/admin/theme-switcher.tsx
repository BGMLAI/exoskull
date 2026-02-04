"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sparkles } from "lucide-react";
import { EXOSKULL_THEMES } from "@/components/providers/ThemeProvider";

const THEME_ICONS: Record<string, React.ReactNode> = {
  "dark-ops": <Moon className="h-3.5 w-3.5" />,
  "xo-minimal": <Monitor className="h-3.5 w-3.5" />,
  neural: <Sparkles className="h-3.5 w-3.5" />,
};

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
        {EXOSKULL_THEMES.map((t) => (
          <div
            key={t.id}
            className="flex-1 h-8 rounded-md bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1">
        Theme
      </p>
      <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
        {EXOSKULL_THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`
              flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium
              transition-all duration-150
              ${
                theme === t.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }
            `}
            title={t.description}
          >
            {THEME_ICONS[t.id]}
            <span className="hidden xl:inline">{t.label.split(" ")[0]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
