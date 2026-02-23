# ExoSkull Voice Avatar Chat UI -- Design System

> Comprehensive design specification for the particle-face voice avatar interface.
> Built on ExoSkull's existing theme system (Dark Ops, Neural, XO Minimal, Gemini Hybrid),
> Three.js/R3F stack, shadcn/ui components, and Tailwind CSS utilities.

---

## Table of Contents

1. [Color Palette](#color-palette)
2. [Typography](#typography)
3. [Text Styles](#text-styles)
4. [Component Styles](#component-styles)
5. [Spacing System](#spacing-system)
6. [Animations & Motion](#animations--motion)
7. [Dark Mode (Primary)](#dark-mode-primary)
8. [Light Mode Variant](#light-mode-variant)
9. [Emotion Color Mapping](#emotion-color-mapping)
10. [Accessibility](#accessibility)
11. [Responsive Breakpoints](#responsive-breakpoints)

---

## Color Palette

The voice avatar UI operates as a full-screen overlay. It inherits from the active ExoSkull
theme via CSS custom properties (`hsl(var(--primary))`, etc.) but defines additional
avatar-specific tokens. The canonical reference for base theme tokens is
`/exoskull-app/app/globals.css`.

### Primary Colors

| Token | Dark Ops (default) | Neural | Purpose |
|---|---|---|---|
| `--primary` | `191 100% 50%` (#00D4FF cyan) | `263 70% 66%` (#9B6DFF violet) | CTAs, active states, ring focus |
| `--primary-foreground` | `0 0% 0%` | `0 0% 100%` | Text on primary |

### Secondary Colors

| Token | Dark Ops | Neural | Purpose |
|---|---|---|---|
| `--secondary` | `215 25% 17%` | `260 47% 17%` | Inactive controls, muted surfaces |
| `--secondary-foreground` | `0 0% 98%` | `0 0% 98%` | Text on secondary |

### Accent Colors

| Token | Dark Ops | Neural | Purpose |
|---|---|---|---|
| `--accent` | `38 100% 50%` (#FFB800 gold) | `187 92% 43%` (#0EBFAD teal) | Warnings, highlights, progress indicators |
| `--accent-voice` | `263 70% 50%` | `263 70% 50%` | Voice-specific UI (waveforms, recording states) |
| `--glow-color` | `191 100% 50%` | `263 70% 66%` | Theme glow (used on avatar halo, canvas border) |

### Functional Colors

| Token | Value (all themes) | Purpose |
|---|---|---|
| `--success` | `142 76% 36%` (#22C55E) | Call connected, transcription complete |
| `--destructive` | `354 100% 64%` (Dark Ops) / `347 77% 60%` (Neural) | End call, error states |
| `--warning` | `38 92% 50%` (#F59E0B) | Low connection quality, mic muted |
| `--info` | `213 94% 52%` (#2563EB) | Processing, thinking indicator |

### Background Colors

| Token | Dark Ops | Neural | Purpose |
|---|---|---|---|
| `--background` | `220 20% 14%` (#1C2332) | `270 65% 7%` (#120B1D) | Page background behind overlay |
| `--bg-void` | `220 30% 15%` | `263 60% 5%` | 3D canvas background (always dark) |
| `--card` | `220 18% 20%` | `270 50% 11%` | Transcript panel, control cards |
| `--overlay-backdrop` | `0 0% 0% / 0.7` | `270 80% 3% / 0.8` | Full-screen voice overlay background |

### Avatar-Specific Colors

These are NOT theme-token-dependent. They are constant across themes to ensure consistent
biometric/emotional readability on the particle face.

| Token | Hex | HSL | Purpose |
|---|---|---|---|
| `--avatar-particle-base` | `#E8E8F0` | `240 17% 93%` | Default particle color (neutral face) |
| `--avatar-particle-core` | `#FFFFFF` | `0 0% 100%` | High-density core particles (eyes, mouth contour) |
| `--avatar-glow-inner` | `#B8A0FF` | `260 100% 81%` | Inner halo around formed face |
| `--avatar-glow-outer` | `#6B3FA0` | `270 44% 44%` | Outer diffuse glow |
| `--avatar-chaos-particle` | `#5A5A70` | `240 10% 40%` | Particles in chaotic/unformed state |
| `--avatar-connection-line` | `#7861FA` | `250 94% 68%` | Thin lines connecting face-mesh triangles |
| `--avatar-soundwave-stroke` | `#00D4FF` | `191 100% 50%` | Soundwave visualization (speaking) |
| `--avatar-soundwave-fill` | `#00D4FF20` | -- | Soundwave fill (20% opacity) |

### Emotion-Mapped Particle Colors

Each emotion shifts both the particle tint and the glow aura around the avatar.

| Emotion | Particle Tint | Glow Color | Glow Opacity | Notes |
|---|---|---|---|---|
| `neutral` | `#E8E8F0` | `#B8A0FF` | 0.3 | Default. Cool, calm white-lavender. |
| `happy` | `#FFE566` | `#FFB800` | 0.5 | Warm gold. Particles slightly expand. |
| `sad` | `#7BA3CC` | `#4A7FB5` | 0.25 | Cool desaturated blue. Particles drift downward. |
| `angry` | `#FF6B6B` | `#E31E24` | 0.6 | Hot red. Particles vibrate faster. |
| `surprised` | `#7DF9FF` | `#00D4FF` | 0.55 | Electric cyan. Particles scatter outward briefly. |
| `fearful` | `#9B7FD4` | `#6B3FA0` | 0.35 | Deep violet. Particles contract inward. |
| `disgusted` | `#8FBC8F` | `#5A8A5A` | 0.3 | Olive green. Particles become irregular. |

---

## Typography

### Font Families

Already loaded in `/exoskull-app/app/layout.tsx`:

| Var | Font | Stack | Usage |
|---|---|---|---|
| `--font-body` | Inter | `system-ui, sans-serif` | All body text, transcript messages, controls |
| `--font-heading` | Space Grotesk | `system-ui, sans-serif` | Overlay title, status labels, timer |
| `--font-mono` | JetBrains Mono | `monospace` | Timestamps, debug info, speech metrics |

### Font Weights

| Weight | Token | Usage |
|---|---|---|
| 400 | `font-normal` | Body text, transcript messages |
| 500 | `font-medium` | Control labels, emotion tags |
| 600 | `font-semibold` | Status text, call timer, headings |
| 700 | `font-bold` | Avatar name, overlay title |

---

## Text Styles

### Headings

| Style | Font | Size | Weight | Line Height | Letter Spacing | Usage |
|---|---|---|---|---|---|---|
| `h-overlay-title` | Space Grotesk | 24px / `text-2xl` | 700 | 1.2 | `-0.02em` | "Voice Call" overlay title |
| `h-panel-title` | Space Grotesk | 18px / `text-lg` | 600 | 1.3 | `-0.01em` | "Transcript" panel heading |
| `h-status` | Space Grotesk | 14px / `text-sm` | 600 | 1.4 | `0.05em` (uppercase) | "LISTENING", "SPEAKING", "THINKING" |

### Body Text

| Style | Font | Size | Weight | Line Height | Usage |
|---|---|---|---|---|---|
| `body-message` | Inter | 15px / `text-[15px]` | 400 | 1.6 | Transcript messages |
| `body-message-ai` | Inter | 15px / `text-[15px]` | 400 | 1.6 | AI responses (identical size, different bubble) |
| `body-small` | Inter | 13px / `text-xs` | 400 | 1.5 | Emotion labels, secondary info |
| `body-caption` | Inter | 11px / `text-[11px]` | 500 | 1.4 | Timestamps, metadata |

### Special Text

| Style | Font | Size | Weight | Usage |
|---|---|---|---|---|
| `timer-display` | JetBrains Mono | 20px / `text-xl` | 600 | Call duration timer `00:12:34` |
| `metric-value` | JetBrains Mono | 13px / `text-xs` | 500 | Speech rate, confidence scores |
| `emotion-tag` | Inter | 11px / `text-[11px]` | 600 | Pill badge inside transcript (e.g., "happy 82%") |
| `avatar-label` | Space Grotesk | 16px / `text-base` | 600 | Name below avatar ("ExoSkull") |
| `gradient-text` | Space Grotesk | varies | 700 | Neural theme gradient (violet to teal) |

---

## Component Styles

### Buttons

All buttons extend the existing `buttonVariants` from `/exoskull-app/components/ui/button.tsx`.

#### Primary Button

```
bg-primary text-primary-foreground hover:bg-primary/90
h-10 px-4 py-2 rounded-md text-sm font-medium
transition-colors duration-150
```

Usage: "Start Call", "Resume".

#### Secondary Button

```
bg-secondary text-secondary-foreground hover:bg-secondary/80
h-10 px-4 py-2 rounded-md text-sm font-medium
```

Usage: "View Transcript", "Settings".

#### Ghost Button

```
hover:bg-accent/10 hover:text-accent-foreground
h-10 px-4 py-2 rounded-md text-sm font-medium
```

Usage: Minimize overlay, close panels.

#### Destructive Button

```
bg-destructive text-destructive-foreground hover:bg-destructive/90
h-10 px-4 py-2 rounded-md text-sm font-medium
```

Usage: "End Call".

#### Voice FAB (Floating Action Button)

The primary call-to-action. A large circular button that initiates or ends a voice call.

```
States:
  idle:      w-16 h-16 rounded-full bg-primary text-primary-foreground
             shadow-[0_0_20px_hsl(var(--glow-color)/0.3)]
             hover:shadow-[0_0_30px_hsl(var(--glow-color)/0.5)]
             hover:scale-105
             transition-all duration-200

  active:    w-16 h-16 rounded-full bg-destructive text-destructive-foreground
             shadow-[0_0_20px_hsl(var(--destructive)/0.3)]
             animate-pulse (slow, 3s)

  disabled:  w-16 h-16 rounded-full bg-muted text-muted-foreground opacity-50
             cursor-not-allowed
```

Icon: `Mic` (idle) / `PhoneOff` (active) / `Loader2 animate-spin` (connecting) from `lucide-react`.

#### Control Pill Buttons (in-call toolbar)

```
h-10 w-10 rounded-full bg-card/80 backdrop-blur-sm
border border-border/50
text-foreground hover:bg-card hover:border-primary/30
transition-all duration-150

active (toggled):
  bg-primary/20 border-primary/50 text-primary
```

Usage: Mute, Speaker, Transcript toggle, Camera toggle.

### Cards

#### Transcript Panel

```
Container:
  bg-card/95 backdrop-blur-md
  border border-border/50
  rounded-2xl
  shadow-xl shadow-black/20
  overflow-hidden

Header:
  px-4 py-3
  border-b border-border/30
  flex items-center justify-between

Body:
  px-4 py-3
  overflow-y-auto
  max-h-[60vh]
  chat-scroll (custom scrollbar from globals.css)
```

#### User Message Bubble

```
max-w-[80%] ml-auto
bg-primary/15 border border-primary/20
rounded-2xl rounded-br-md
px-4 py-2.5
text-foreground
```

#### AI Message Bubble

```
max-w-[80%] mr-auto
bg-card border border-border/30
rounded-2xl rounded-bl-md
px-4 py-2.5
text-foreground
```

#### Emotion Tag (inside bubble)

```
inline-flex items-center gap-1
px-2 py-0.5
rounded-full
text-[11px] font-semibold
bg-[emotion-color]/15
text-[emotion-color]
border border-[emotion-color]/20
```

Where `[emotion-color]` maps to the Emotion-Mapped Particle Colors table above.

#### Status Card (call info)

```
bg-card/80 backdrop-blur-sm
border border-border/30
rounded-xl
px-4 py-3
flex items-center gap-3
```

Usage: Connection quality, call duration, speech metrics.

### Inputs

#### Chat Text Input (fallback text mode)

```
Container:
  flex items-center gap-2
  bg-card/80 backdrop-blur-sm
  border border-border/50
  rounded-2xl
  px-4 py-2
  focus-within:border-primary/50
  focus-within:shadow-[0_0_12px_hsl(var(--glow-color)/0.1)]
  transition-all duration-200

Input:
  bg-transparent
  text-foreground placeholder:text-muted-foreground
  text-[15px]
  flex-1
  outline-none

Send Button:
  h-8 w-8 rounded-full
  bg-primary text-primary-foreground
  hover:bg-primary/90
  disabled:opacity-30
  transition-colors duration-150
```

#### Voice Control (record button embedded in input)

```
h-8 w-8 rounded-full
bg-destructive/20 text-destructive
border border-destructive/30

recording:
  bg-destructive text-destructive-foreground
  animate-pulse
  shadow-[0_0_16px_hsl(var(--destructive)/0.4)]
```

### Icons

All icons from `lucide-react` (already a dependency).

| Context | Icon | Size | Color |
|---|---|---|---|
| Start call | `Phone` | 24px | `text-primary-foreground` |
| End call | `PhoneOff` | 24px | `text-destructive-foreground` |
| Mute | `MicOff` | 20px | `text-foreground` |
| Unmute | `Mic` | 20px | `text-foreground` |
| Speaker | `Volume2` | 20px | `text-foreground` |
| Speaker off | `VolumeX` | 20px | `text-foreground` |
| Camera on | `Video` | 20px | `text-foreground` |
| Camera off | `VideoOff` | 20px | `text-foreground` |
| Transcript | `MessageSquare` | 20px | `text-foreground` |
| Settings | `Settings2` | 20px | `text-foreground` |
| Close | `X` | 20px | `text-muted-foreground` |
| Minimize | `Minimize2` | 20px | `text-muted-foreground` |
| Connecting | `Loader2` (spinning) | 20px | `text-primary` |
| Emotion | `Heart` / `Frown` / etc. | 12px | `text-[emotion-color]` |

### Avatar Component

The core visual element. Renders inside an R3F `<Canvas>` (matching existing pattern in
`/exoskull-app/components/3d/CyberpunkSceneInner.tsx`).

#### Canvas Container

```
Position: absolute, centered in voice overlay
Size: min(70vw, 70vh) square (maintains 1:1 aspect)
Mobile: min(90vw, 50vh)

CSS:
  aspect-ratio: 1/1
  rounded-full (circular mask via CSS clip-path or border-radius with overflow-hidden)
  background: radial-gradient(
    circle at 50% 50%,
    hsl(var(--bg-void)) 0%,
    hsl(var(--bg-void)) 70%,
    transparent 100%
  )
```

#### R3F Canvas Config

```tsx
<Canvas
  camera={{ fov: 50, near: 0.1, far: 100, position: [0, 0, 4] }}
  gl={{
    antialias: true,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.5,
    alpha: true,    // transparent background (composited with CSS)
  }}
  dpr={[1, 2]}     // retina support
/>
```

#### Particle System Properties

| Property | Value | Description |
|---|---|---|
| Particle count | 3,000 - 5,000 | Dense enough to form recognizable face |
| Particle size | 0.015 - 0.04 (world units) | Varies: core features (eyes, lips) = larger; periphery = smaller |
| Particle shape | Point sprite (circle) | `THREE.PointsMaterial` with `sizeAttenuation: true` |
| Face mesh vertices | 468 landmarks (MediaPipe) | Standard face mesh from `@mediapipe/face_mesh` |
| Target positions | Mapped from 468 landmarks to 3D | Each particle assigned to nearest landmark with offset jitter |
| Chaos positions | Random sphere distribution | `r = random(0.5, 2.0)`, uniform spherical distribution |
| Transition speed | 0.02 per frame (lerp factor) | Particles lerp from chaos to face positions |
| Color attribute | Per-particle `Float32Array` (RGB) | Updates based on emotion state |
| Opacity attribute | Per-particle `Float32Array` | Core features higher (0.8-1.0), periphery lower (0.3-0.6) |

#### Face Mesh Overlay

When camera is active and face is detected:

```
MediaPipe Face Mesh → 468 landmarks (normalized 0-1)
→ Map to 3D space: x = (landmark.x - 0.5) * 2, y = -(landmark.y - 0.5) * 2, z = landmark.z
→ Assign particles to landmark neighborhoods
→ Connection lines between triangle edges (Delaunay from mesh topology)
  - Line color: --avatar-connection-line at 15% opacity
  - Line width: 1px (THREE.LineSegments)
  - Only visible when face coherence > 60%
```

#### Emotion States (Avatar Visual Response)

| State | Particle Behavior | Glow | Additional |
|---|---|---|---|
| `neutral` | Stable, gentle float (sin wave, amplitude 0.005) | Inner: `#B8A0FF` @ 0.3 | Slow breathing scale (0.98-1.02, 4s cycle) |
| `happy` | Slight expansion, upward drift bias | Inner: `#FFB800` @ 0.5 | Particles near mouth region arc upward |
| `sad` | Contract inward, downward drift bias | Inner: `#4A7FB5` @ 0.25 | Reduced particle brightness by 20% |
| `angry` | High-frequency jitter (noise), expansion | Inner: `#E31E24` @ 0.6 | Particle size increases 15%, sharper edges |
| `surprised` | Brief scatter burst, then reform faster | Inner: `#00D4FF` @ 0.55 | Eye region particles widen spacing |
| `fearful` | Contract tight, reduced movement | Inner: `#6B3FA0` @ 0.35 | Particle opacity drops 15%, tremor |
| `disgusted` | Asymmetric drift, irregular spacing | Inner: `#5A8A5A` @ 0.3 | Nose region particles shift laterally |

#### Avatar Variants

##### 1. Ultimate Emotion (Default)

Full face mesh with emotion-reactive particles. Camera required.

##### 2. Flocking Face

Boid simulation: particles flock toward face landmarks using separation/alignment/cohesion rules.
No hard target positions; emergent face shape. More organic, less precise.

```
Boid params:
  separation: 0.05
  alignment: 0.03
  cohesion: 0.04
  target_attraction: 0.02
  max_speed: 0.03
```

##### 3. Soundwave Face

Face outline only (68 key landmarks from face contour, eyes, nose, mouth).
Connected by animated lines whose amplitude modulates with voice volume.

```
Line rendering: THREE.Line2 (fat lines) with MeshLineMaterial
Line width: 2-4px based on audio amplitude
Color: --avatar-soundwave-stroke
Animation: perpendicular displacement = audioLevel * 0.3 * sin(t * 10 + i * 0.5)
```

##### 4. Speaking Avatar (No Camera)

Abstract orb with soundwave rings. Used when camera is off.

```
Central sphere: radius 0.5, emissive with --glow-color
Orbiting rings: 3 concentric, radius 0.8 / 1.2 / 1.6
Ring deformation: audio amplitude drives vertex displacement
Ring opacity: 0.3 / 0.2 / 0.1 (innermost = brightest)
Ring color: --avatar-soundwave-stroke
Idle: slow rotation (rings orbit at different speeds)
Speaking: ring amplitude 0.1-0.5 based on volume
```

### Voice Call Overlay

Full-screen overlay that appears when a voice call is active.

#### Layout

```
Full screen: fixed inset-0 z-50
Background: --overlay-backdrop (black/dark with 70-80% opacity)

Structure (mobile-first):
  ┌─────────────────────────────┐
  │  [Minimize]    Timer   [X]  │  ← Top bar (h-14)
  │                             │
  │                             │
  │      ┌───────────────┐      │
  │      │               │      │
  │      │   AVATAR       │      │  ← Center (flex-1)
  │      │   CANVAS       │      │
  │      │               │      │
  │      └───────────────┘      │
  │      "ExoSkull"             │  ← Avatar label
  │      "LISTENING..."         │  ← Status
  │                             │
  │  ┌─┐ ┌─┐ ┌───┐ ┌─┐ ┌─┐   │  ← Controls (h-20)
  │  │🔇│ │🔊│ │ 📞│ │📝│ │📷│   │
  │  └─┘ └─┘ └───┘ └─┘ └─┘   │
  └─────────────────────────────┘

Desktop (>768px) with transcript:
  ┌──────────────────────────────────────────┐
  │  [Min]         Timer            [X]      │
  │                                          │
  │   ┌──────────────┐   ┌───────────────┐   │
  │   │              │   │  Transcript   │   │
  │   │   AVATAR     │   │  Panel        │   │
  │   │   CANVAS     │   │  (scrollable) │   │
  │   │              │   │               │   │
  │   │              │   │               │   │
  │   └──────────────┘   └───────────────┘   │
  │                                          │
  │   ┌─┐ ┌─┐ ┌───┐ ┌─┐ ┌─┐               │
  │   │🔇│ │🔊│ │ 📞│ │📝│ │📷│               │
  │   └─┘ └─┘ └───┘ └─┘ └─┘               │
  └──────────────────────────────────────────┘
```

#### Controls Bar

```
Container:
  flex items-center justify-center gap-3
  px-6 py-4
  bg-gradient-to-t from-black/30 to-transparent

Layout:
  [Mute] [Speaker] [END CALL] [Transcript] [Camera]

  Small pills: h-10 w-10 (see Control Pill Buttons above)
  End Call FAB: h-14 w-14 (larger, centered, destructive)
```

#### Waveform Display

Shown at the bottom of the avatar canvas or as a separate bar below the avatar.

```
Type: Real-time audio waveform (bars or line)
Width: matches avatar canvas width
Height: 40px (mobile) / 48px (desktop)

Bar variant:
  5-9 bars, each 4px wide, rounded-full
  gap: 3px
  color: hsl(var(--primary))
  animation: wave-bar (already defined in globals.css)
  bar heights driven by audio frequency bands

Line variant:
  SVG path, stroke: --avatar-soundwave-stroke
  stroke-width: 2px
  fill: --avatar-soundwave-fill
  Points: 64 samples, smoothed with cubic bezier
  Update: requestAnimationFrame synced to AudioAnalyser
```

### Transcript Panel

#### Container

```
Mobile: slide-up sheet (bottom 60% of screen)
Desktop: side panel (right 35%, min 320px, max 420px)

bg-card/95 backdrop-blur-md
border-l border-border/30 (desktop) or border-t (mobile)
rounded-t-2xl (mobile) or rounded-l-2xl (desktop)

Transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1)
  hidden: translateX(100%) (desktop) or translateY(100%) (mobile)
  visible: translateX(0) or translateY(0)
```

#### Message Layout

```
Each message:
  flex flex-col gap-1
  py-2

  ┌──────────────────────────────┐
  │ [Avatar] Name       12:34 PM │  ← Header row
  │                              │
  │ Message text here that can   │  ← Body
  │ wrap to multiple lines.      │
  │                              │
  │ [😊 happy 82%]              │  ← Emotion tag (optional)
  └──────────────────────────────┘

User messages: aligned right, primary-tinted bubble
AI messages: aligned left, card-colored bubble
System messages: centered, muted text, no bubble
```

#### Emotion Labels in Transcript

```
Inline after message text:
  mt-1.5
  flex items-center gap-1.5

  Dot indicator:
    w-2 h-2 rounded-full
    bg-[emotion-color]

  Label:
    text-[11px] font-medium text-muted-foreground
    "happy" | "sad" | "neutral" etc.

  Confidence:
    text-[11px] font-mono text-muted-foreground/60
    "82%"
```

#### Timestamps

```
text-[11px] font-mono text-muted-foreground/50
Relative format: "just now", "2m ago", "12:34"
Position: top-right of message header
```

---

## Spacing System

Follows Tailwind's default 4px base scale. Additional voice-UI-specific spacing:

| Token | Value | Usage |
|---|---|---|
| `space-xs` | 4px (`p-1`) | Between icon and label inside pill buttons |
| `space-sm` | 8px (`p-2`) | Inside emotion tags, between waveform bars |
| `space-md` | 12px (`p-3`) | Between transcript messages |
| `space-lg` | 16px (`p-4`) | Panel padding, control group margins |
| `space-xl` | 24px (`p-6`) | Section separation (avatar to controls) |
| `space-2xl` | 32px (`p-8`) | Overlay edge padding (desktop) |
| `space-3xl` | 48px (`p-12`) | Avatar top margin from header |

### Avatar Specific Spacing

| Property | Mobile | Desktop |
|---|---|---|
| Avatar canvas size | `min(90vw, 50vh)` | `min(50vw, 60vh)` |
| Avatar to status text | 16px | 20px |
| Status to controls | 24px | 32px |
| Controls pill gap | 12px | 16px |
| Transcript panel width | 100% (sheet) | 35% (sidebar), min 320px |

### Border Radius

Inherits from `--radius: 0.625rem` (10px) in globals.css.

| Element | Radius |
|---|---|
| Avatar canvas mask | `rounded-full` (50%) |
| Overlay container | `rounded-none` (full screen) |
| Transcript panel | `rounded-t-2xl` (mobile), `rounded-l-2xl` (desktop) |
| Message bubbles | `rounded-2xl` (16px), with `rounded-br-md` / `rounded-bl-md` tail |
| Control pills | `rounded-full` |
| Voice FAB | `rounded-full` |
| Emotion tags | `rounded-full` |
| Status cards | `rounded-xl` (12px) |

---

## Animations & Motion

### Standard Transitions

| Property | Duration | Easing | Usage |
|---|---|---|---|
| Color/opacity | 200ms | `ease` | Button hover, theme switch |
| Transform (scale) | 200ms | `cubic-bezier(0.16, 1, 0.3, 1)` (`ease-out-expo`) | Button press, FAB hover |
| Panel slide | 300ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Transcript open/close |
| Background blur | 300ms | `ease` | Overlay appear/disappear |
| Opacity (fade) | 150ms | `ease` | Tooltip, emotion tag appear |

### Avatar-Specific Animations

#### Particle Chaos (Initial State)

```
Name: avatar-chaos
Type: Continuous, per-particle noise

Each particle:
  position += noise3D(position * 0.5, time * 0.3) * 0.02
  opacity: random(0.1, 0.4)
  color: --avatar-chaos-particle

Visual: drifting cloud of dim particles, no recognizable shape
Duration: until face detection starts or call connects
```

#### Face Formation (Chaos → Face)

```
Name: avatar-form
Type: Transition, triggered on face detection

Lerp factor: starts at 0.0, increments by 0.001 per frame
  → ~3 seconds for 50% formation
  → ~8 seconds for 90% formation
  → asymptotic approach to 1.0

Per particle:
  targetPos = faceLandmark[assignedIndex] + jitterOffset
  currentPos = lerp(chaosPos, targetPos, formationProgress)
  opacity = lerp(chaosOpacity, targetOpacity, formationProgress)
  color = lerp(chaosColor, emotionColor, formationProgress)

Easing: linear lerp per frame (organic feel from noise in chaos position)
```

#### Emotion Transitions

```
Name: avatar-emotion-shift
Type: Smooth transition between emotion states
Duration: 800ms
Easing: cubic-bezier(0.4, 0, 0.2, 1)

Per particle:
  color: lerp(currentColor, newEmotionColor, t)
  glow: lerp(currentGlow, newGlow, t)
  behavior: blend between old and new movement patterns

Glow aura transition:
  inner glow color + opacity: 800ms ease
  outer glow radius: 600ms ease-out
```

#### Idle Breathing

```
Name: avatar-breathe
Type: Continuous loop
Duration: 4s per cycle

Global scale oscillation:
  scale = 1.0 + sin(time * PI / 2) * 0.02
  (range: 0.98 to 1.02)

Per-particle micro-drift:
  offset.y += sin(time * 0.5 + particleIndex * 0.1) * 0.003
  offset.x += cos(time * 0.3 + particleIndex * 0.2) * 0.002
```

#### Speaking Sync

```
Name: avatar-speak
Type: Continuous while AI or user is speaking

Audio-reactive:
  volume = AudioAnalyser.getByteFrequencyData() normalized to 0-1

Mouth region particles (landmarks 61-68, 78-95):
  displacement = volume * 0.15 (vertical, opening mouth)
  speed: real-time (per frame)

All particles:
  micro-vibration amplitude = volume * 0.005
  (adds "alive" quality during speech)

Soundwave rings (Speaking Avatar variant):
  ring[i].scale = 1.0 + volume * 0.3 * (1 - i * 0.2)
  ring[i].opacity = 0.3 * volume
```

#### Soundwave Visualization

```
Name: avatar-soundwave
Type: Continuous during active audio

Bar variant (CSS):
  @keyframes wave-bar {
    0%, 100% { height: 8px }
    50% { height: var(--bar-height) }  // driven by frequency band
  }
  animation-duration: 0.6-1.2s (varies per bar)
  animation-delay: staggered 0.05s per bar

Line variant (Canvas/SVG):
  path: cubic bezier through 64 frequency samples
  update: every frame via requestAnimationFrame
  smoothing: exponential moving average (alpha = 0.3)
```

#### Face Dissolution (Call End)

```
Name: avatar-dissolve
Type: Transition, triggered on call end
Duration: 2s

Reverse of formation:
  formationProgress decreases by 0.008 per frame
  Particles drift back toward random positions
  opacity fades to 0 over last 500ms
  glow fades out over 1s

Post-dissolution: canvas fades to black over 500ms
```

### Voice UI Animations

#### Recording Indicator

```
Name: recording-pulse
Type: Continuous while recording

Outer ring:
  @keyframes recording-ring {
    0% { transform: scale(1); opacity: 0.4 }
    50% { transform: scale(1.5); opacity: 0 }
    100% { transform: scale(1); opacity: 0.4 }
  }
  duration: 1.5s
  color: --destructive

Inner dot:
  w-3 h-3 rounded-full bg-destructive
  static (no animation) — the ring animates around it
```

#### Call Status Transitions

```
Connecting:
  Loader2 icon spinning (animate-spin, 1s linear infinite)
  Status text pulses opacity (0.5 → 1.0 → 0.5, 2s)
  Avatar particles in chaos state

Connected:
  Brief flash of --glow-color (200ms, opacity 0 → 0.3 → 0)
  Status changes to "LISTENING"
  Avatar begins formation

Disconnecting:
  Avatar dissolves (avatar-dissolve)
  Controls fade out (300ms)
  Overlay backdrop fades out (500ms)
```

#### Waveform (Real-time)

```
AudioContext → AnalyserNode → getByteFrequencyData()
  fftSize: 256 (128 frequency bins)
  smoothingTimeConstant: 0.8

Visual:
  Select 7 bands (low to high frequency)
  Normalize each band to 0-1
  Map to bar height: minH + band * (maxH - minH)
  Update: every requestAnimationFrame

Idle (no audio):
  All bars at minH (8px)
  Subtle breathing animation (2px oscillation, 3s cycle)
```

---

## Dark Mode (Primary)

The voice avatar UI is **dark-mode-first**. It always renders with a dark backdrop regardless
of the app theme, because:

1. Particle visibility requires dark backgrounds
2. Focus/immersion demands low ambient light
3. The 3D canvas (`--bg-void`) is always dark even in light themes

### Dark Ops Voice Overlay

```css
.dark-ops .voice-overlay, .dark .voice-overlay {
  --overlay-backdrop: 0 0% 0% / 0.75;
  --voice-surface: 220 18% 18%;
  --voice-border: 220 15% 28%;
  --voice-glow: 191 100% 50%;        /* cyan */
  --voice-text: 220 10% 92%;
  --voice-text-muted: 220 8% 55%;
}
```

### Neural Voice Overlay

```css
.neural .voice-overlay {
  --overlay-backdrop: 270 80% 3% / 0.80;
  --voice-surface: 270 50% 11%;
  --voice-border: 263 45% 22%;
  --voice-glow: 263 70% 66%;         /* violet */
  --voice-text: 213 31% 91%;
  --voice-text-muted: 215 16% 55%;
}
```

Glassmorphism is active in Neural:
```css
.neural .voice-panel {
  backdrop-filter: blur(12px);
  background: hsl(var(--voice-surface) / 0.6);
  border: 1px solid hsl(var(--voice-border) / 0.5);
}
```

---

## Light Mode Variant

For XO Minimal and Gemini Hybrid themes, the overlay still uses a dark canvas for the avatar
but the transcript panel and controls adapt to the light theme.

### XO Minimal Voice Overlay

```css
.xo-minimal .voice-overlay {
  --overlay-backdrop: 0 0% 0% / 0.65;           /* slightly transparent */
  --voice-surface: 0 0% 100%;                    /* white panels */
  --voice-border: 240 6% 90%;
  --voice-glow: 0 0% 20%;                        /* subtle dark glow */
  --voice-text: 0 0% 3.5%;
  --voice-text-muted: 240 4% 46%;
}
```

Controls and transcript panel use light backgrounds.
Avatar canvas still uses `--bg-void: 240 5% 8%` (dark).

### Gemini Hybrid Voice Overlay

```css
.gemini-hybrid .voice-overlay {
  --overlay-backdrop: 0 0% 0% / 0.60;
  --voice-surface: 0 0% 100%;
  --voice-border: 220 13% 87%;
  --voice-glow: 213 94% 52%;                     /* blue */
  --voice-text: 220 13% 13%;
  --voice-text-muted: 220 9% 46%;
}
```

Transcript message bubbles use white cards with subtle shadows:
```css
.gemini-hybrid .voice-message-ai {
  background: hsl(0 0% 100%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  border: 1px solid hsl(220 13% 90%);
}
```

---

## Emotion Color Mapping

Complete mapping from ExoSkull's `PrimaryEmotion` type
(`/exoskull-app/lib/emotion/types.ts`) to visual parameters.

| Emotion | Particle Tint | Glow Inner | Glow Outer | Glow Opacity | Movement | Particle Size Modifier | Sound |
|---|---|---|---|---|---|---|---|
| `happy` | `#FFE566` | `#FFB800` | `#FF8C00` | 0.50 | Expand + upward drift | 1.05x | Warm tone |
| `sad` | `#7BA3CC` | `#4A7FB5` | `#2C5F8A` | 0.25 | Contract + downward drift | 0.95x | Low tone |
| `angry` | `#FF6B6B` | `#E31E24` | `#B71C1C` | 0.60 | Jitter + expand | 1.15x | Sharp pulse |
| `surprised` | `#7DF9FF` | `#00D4FF` | `#0097B2` | 0.55 | Scatter burst + quick reform | 1.10x | High spike |
| `fearful` | `#9B7FD4` | `#6B3FA0` | `#4A2C70` | 0.35 | Contract tight + tremor | 0.90x | Tremolo |
| `disgusted` | `#8FBC8F` | `#5A8A5A` | `#3D6B3D` | 0.30 | Asymmetric drift | 1.00x | Dissonant |
| `neutral` | `#E8E8F0` | `#B8A0FF` | `#6B3FA0` | 0.30 | Gentle float | 1.00x | None |

### Transition Rules

- Emotion changes apply over 800ms (ease-in-out)
- If new emotion is detected within 200ms of previous change, queue it (debounce)
- Intensity (0-100 from EmotionState) modulates:
  - Glow opacity: `baseOpacity * (0.5 + intensity / 200)` (range: 50% to 100% of table value)
  - Movement amplitude: `baseAmplitude * (0.3 + intensity / 143)` (range: 30% to 100%)
  - Particle tint saturation: `baseSaturation * (0.4 + intensity / 167)` (range: 40% to 100%)
- If confidence < 0.5, reduce visual intensity by 50% (subtle changes only)

### VAD (Valence-Arousal-Dominance) Modifiers

The dimensional model from `EmotionState` provides additional nuance:

| Dimension | Range | Visual Effect |
|---|---|---|
| Valence | -1 to +1 | Shifts color temperature: negative = cooler blue, positive = warmer gold |
| Arousal | 0 to 1 | Particle movement speed: low = slow float, high = rapid vibration |
| Dominance | 0 to 1 | Particle spread: low = contracted, high = expanded (confident) |

---

## Accessibility

### Motion Sensitivity

Respects `prefers-reduced-motion` (already in globals.css):

```css
@media (prefers-reduced-motion: reduce) {
  /* Avatar particles: static positions, no animation */
  /* Emotion transitions: instant color change, no lerp */
  /* Waveform: static bar heights representing volume level */
  /* Glow: static, no pulse */
  /* Panel transitions: instant show/hide */
}
```

### Focus Management

- Voice overlay traps focus when open (`focus-trap` or manual management)
- Tab order: Minimize > End Call > Mute > Speaker > Transcript > Camera > Close
- All controls have `aria-label` descriptions
- Status updates announced via `aria-live="polite"` region
- Emotion changes announced via `aria-live="off"` (visual-only, not disruptive)

### Screen Reader

```html
<div role="dialog" aria-modal="true" aria-label="Voice call with ExoSkull">
  <div aria-live="polite" aria-atomic="true">
    <!-- "Connected", "Listening", "ExoSkull is speaking" -->
  </div>
  <div role="log" aria-label="Conversation transcript">
    <!-- Messages -->
  </div>
</div>
```

### Color Contrast

All text meets WCAG 2.1 AA (4.5:1 for body, 3:1 for large text):

| Element | Foreground | Background | Ratio |
|---|---|---|---|
| Body text (dark) | `#EAEAF2` | `#1C2332` | 11.2:1 |
| Muted text (dark) | `#8890A0` | `#1C2332` | 4.8:1 |
| Body text (light) | `#1C2332` | `#FFFFFF` | 14.1:1 |
| Emotion tag text | `[emotion-color]` | `[emotion-color]/15` | varies, min 4.5:1 |

### Touch Targets

All interactive controls meet 44x44px minimum (enforced by existing globals.css rule for
`@media (pointer: coarse)`).

---

## Responsive Breakpoints

| Breakpoint | Width | Layout Changes |
|---|---|---|
| `xs` | < 640px | Avatar 90vw, transcript as bottom sheet, stacked controls |
| `sm` | 640px | Avatar 80vw, slightly larger controls |
| `md` | 768px | Transcript becomes side panel (right), avatar 60vw |
| `lg` | 1024px | Avatar 50vw, wider transcript panel (380px) |
| `xl` | 1280px | Avatar max 500px, transcript 420px, generous spacing |
| `2xl` | 1536px | Avatar max 600px, additional metrics panel possible |

### Mobile-Specific Adaptations

- Transcript: swipe-up gesture to reveal (bottom sheet pattern)
- Controls: larger touch targets (h-12 w-12 for pills, h-16 w-16 for FAB)
- Avatar: fills more of screen height, positioned higher
- Status text: larger (16px vs 14px)
- Waveform: below avatar, full width

### Landscape Mode (Mobile)

```
┌─────────────────────────────────────────┐
│  ┌──────────┐  ┌──────────────────────┐ │
│  │  AVATAR   │  │    Transcript        │ │
│  │  (square) │  │    (scrollable)      │ │
│  └──────────┘  └──────────────────────┘ │
│  [Controls centered below avatar]       │
└─────────────────────────────────────────┘
```

Avatar size: `min(45vw, 90vh)` in landscape.

---

## Implementation Notes

### File Structure (Suggested)

```
exoskull-app/
  components/
    voice/
      VoiceOverlay.tsx          ← Full-screen overlay container
      VoiceControls.tsx         ← Mute, speaker, end call, camera, transcript toggle
      VoiceStatus.tsx           ← "LISTENING" / "SPEAKING" / timer
      VoiceWaveform.tsx         ← Audio waveform visualization (bar or line)
      TranscriptPanel.tsx       ← Side panel / bottom sheet with messages
      TranscriptMessage.tsx     ← Individual message bubble with emotion tag
      EmotionTag.tsx            ← Colored pill badge for emotion display
    avatar/
      AvatarCanvas.tsx          ← R3F Canvas wrapper (dynamic import, no SSR)
      ParticleSystem.tsx        ← Core particle geometry + material
      FaceMeshTarget.tsx        ← MediaPipe face mesh → 3D landmark mapping
      EmotionController.tsx     ← Drives particle colors/behavior from EmotionState
      SoundwaveRings.tsx        ← Speaking Avatar variant (no camera)
      AvatarGlow.tsx            ← Inner/outer glow meshes
      AvatarPostProcessing.tsx  ← Bloom, vignette for avatar scene
    hooks/
      useVoiceCall.ts           ← WebRTC / audio stream management
      useAudioAnalyser.ts       ← AudioContext + AnalyserNode
      useFaceMesh.ts            ← MediaPipe face detection
      useEmotionState.ts        ← Subscribe to emotion updates
      useParticlePositions.ts   ← Compute particle target positions from face mesh
```

### Performance Targets

| Metric | Target | Strategy |
|---|---|---|
| Particle render | 60fps at 5,000 particles | `THREE.Points` with `BufferGeometry`, GPU instancing |
| Face mesh | 30fps detection | MediaPipe WASM, offload to Web Worker if possible |
| Audio analysis | 60fps | `AnalyserNode` runs on audio thread, read in rAF |
| Memory | < 50MB for avatar scene | Reuse geometry, dispose on unmount |
| Canvas DPR | 1-2 (adaptive) | Match device pixel ratio, cap at 2 |
| First meaningful render | < 500ms | Preload chaos particles, lazy-load face mesh |

### Integration Points

| System | Integration |
|---|---|
| Emotion engine | Import `EmotionState` from `/lib/emotion/types.ts` |
| Voice analyzer | Import `VoiceFeatures` from `/lib/emotion/types.ts` |
| Theme system | Read `--glow-color`, `--bg-void`, etc. from CSS variables |
| Chat stream | Connect to `/api/chat/stream` for real-time transcript |
| Audio | ElevenLabs TTS output → AudioContext → AnalyserNode |
| Camera | MediaPipe FaceMesh → landmark positions → particle targets |

---

*Design System v1.0 -- ExoSkull Voice Avatar Chat UI*
*Generated 2026-02-23*
