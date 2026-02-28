"use client";

import { useEffect, useState } from "react";

/**
 * DjinAvatar — 3 animated dots representing the Dżin's state.
 *
 * States:
 * - idle: soft white/blue pulse
 * - thinking: fast pulse + orbital rotation
 * - listening: wave animation (mic active)
 * - joy: green glow
 * - alert: red pulse
 * - speaking: rhythmic bounce
 */

export type AvatarState =
  | "idle"
  | "thinking"
  | "listening"
  | "joy"
  | "alert"
  | "speaking";

interface DjinAvatarProps {
  state?: AvatarState;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = { sm: 32, md: 56, lg: 80 };

const STATE_COLORS: Record<AvatarState, string> = {
  idle: "#94a3b8", // slate-400
  thinking: "#60a5fa", // blue-400
  listening: "#a78bfa", // violet-400
  joy: "#4ade80", // green-400
  alert: "#f87171", // red-400
  speaking: "#38bdf8", // sky-400
};

export function DjinAvatar({
  state = "idle",
  size = "md",
  className = "",
}: DjinAvatarProps) {
  const px = SIZE_MAP[size];
  const dotSize = px * 0.2;
  const gap = px * 0.12;
  const color = STATE_COLORS[state];

  // Glow intensity cycles for idle breathing
  const [breath, setBreath] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(function loop(t) {
      setBreath(Math.sin(t / 800) * 0.5 + 0.5);
      requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const baseStyle = (i: number): React.CSSProperties => ({
    width: dotSize,
    height: dotSize,
    borderRadius: "50%",
    backgroundColor: color,
    transition: "background-color 0.4s ease",
  });

  const animClass = (i: number) => {
    switch (state) {
      case "thinking":
        return `animate-djin-think delay-${i}`;
      case "listening":
        return `animate-djin-wave delay-${i}`;
      case "speaking":
        return `animate-djin-speak delay-${i}`;
      case "alert":
        return "animate-djin-alert";
      case "joy":
        return "animate-djin-joy";
      default:
        return "";
    }
  };

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ width: px, height: px }}
      role="img"
      aria-label={`Dżin: ${state}`}
    >
      <style>{avatarKeyframes}</style>
      <div className="flex items-center" style={{ gap }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={animClass(i)}
            style={{
              ...baseStyle(i),
              boxShadow: `0 0 ${8 + breath * 6}px ${color}${state === "idle" ? "66" : "aa"}`,
              animationDelay: `${i * 150}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

const avatarKeyframes = `
@keyframes djin-think {
  0%, 100% { transform: scale(1) translateY(0); opacity: 0.7; }
  50% { transform: scale(1.3) translateY(-4px); opacity: 1; }
}
@keyframes djin-wave {
  0%, 100% { transform: translateY(0); }
  25% { transform: translateY(-6px); }
  75% { transform: translateY(6px); }
}
@keyframes djin-speak {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(1.6); }
}
@keyframes djin-alert {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(0.8); }
}
@keyframes djin-joy {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}
.animate-djin-think { animation: djin-think 0.8s ease-in-out infinite; }
.animate-djin-wave { animation: djin-wave 0.6s ease-in-out infinite; }
.animate-djin-speak { animation: djin-speak 0.4s ease-in-out infinite; }
.animate-djin-alert { animation: djin-alert 0.5s ease-in-out infinite; }
.animate-djin-joy { animation: djin-joy 1.2s ease-in-out infinite; }
`;
