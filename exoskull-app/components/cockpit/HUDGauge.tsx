"use client";

interface HUDGaugeProps {
  /** 0–100 */
  value: number;
  label: string;
  color: string;
  size?: number;
}

const SEGMENTS = 12;
const GAP_ANGLE = 4; // degrees between segments
const ARC_START = 135; // degrees (bottom-left)
const ARC_SPAN = 270; // degrees total arc

/**
 * HUDGauge — SVG segmented arc gauge for the cockpit bottom bar.
 * Displays a 0–100% value with 12 segments, center percentage, micro label.
 */
export function HUDGauge({ value, label, color, size = 44 }: HUDGaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const filledSegments = Math.round((clamped / 100) * SEGMENTS);
  const r = (size - 6) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const segmentAngle = (ARC_SPAN - GAP_ANGLE * SEGMENTS) / SEGMENTS;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const startAngle = ARC_START + i * (segmentAngle + GAP_ANGLE);
          const endAngle = startAngle + segmentAngle;
          const isFilled = i < filledSegments;

          const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180);
          const y1 = cy + r * Math.sin((startAngle * Math.PI) / 180);
          const x2 = cx + r * Math.cos((endAngle * Math.PI) / 180);
          const y2 = cy + r * Math.sin((endAngle * Math.PI) / 180);

          return (
            <path
              key={i}
              d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
              fill="none"
              stroke={isFilled ? color : "rgba(255,255,255,0.08)"}
              strokeWidth={2.5}
              strokeLinecap="round"
              style={{
                opacity: isFilled ? 1 : 0.4,
                transition: "stroke 0.3s, opacity 0.3s",
                filter: isFilled ? `drop-shadow(0 0 3px ${color}40)` : "none",
              }}
            />
          );
        })}

        {/* Center percentage */}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            fill: "rgba(255,255,255,0.7)",
          }}
        >
          {clamped}
        </text>
      </svg>

      {/* Micro label */}
      <span
        style={{
          fontSize: 8,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--hud-text-muted)",
          textAlign: "center",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </div>
  );
}
