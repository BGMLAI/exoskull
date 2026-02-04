# ExoSkull Visual Brandbook

## 1. Logo

### Primary Logo

The ExoSkull logo is a stylized skull silhouette with **XO** letters forming the face.

- **X** = left eye (crossing paths, discovery, the unknown)
- **O** = right eye (wholeness, completeness, the cycle)
- **Skull** = mortality, urgency, rebellion against mediocrity
- **XO together** = hugs & kisses / death & love duality = "friendly danger"

### Logo Files

| File                   | Use Case                        |
| ---------------------- | ------------------------------- |
| `public/logo.svg`      | Black logo on light backgrounds |
| `public/logo-dark.svg` | White logo on dark backgrounds  |
| `public/favicon.svg`   | Browser tab favicon             |

### Usage Rules

- **Minimum size:** 24px height (favicon), 32px for UI placement
- **Safe space:** Minimum 25% of logo height on all sides
- **Never:** Rotate, stretch, add effects, change colors outside brand palette
- **Always:** Use provided SVG files, maintain aspect ratio

---

## 2. Color Palette

### Brand Core (shared across all themes)

| Name          | Hex       | HSL          | Usage                       |
| ------------- | --------- | ------------ | --------------------------- |
| XO Black      | `#000000` | 0 0% 0%      | Logo, primary text          |
| XO White      | `#FFFFFF` | 0 0% 100%    | Logo inverted, backgrounds  |
| Danger Red    | `#FF4757` | 354 100% 64% | Errors, destructive actions |
| Success Green | `#2ED573` | 147 63% 57%  | Success states, health      |
| Warning Amber | `#FFA502` | 39 100% 50%  | Warnings, caution           |
| Info Blue     | `#3742FA` | 237 95% 60%  | Information, links          |

### Theme A: "Dark Ops"

| Token                  | Hex       | Usage                         |
| ---------------------- | --------- | ----------------------------- |
| `--background`         | `#0A0A0A` | Page background               |
| `--foreground`         | `#E4E4E7` | Primary text                  |
| `--card`               | `#18181B` | Card backgrounds              |
| `--card-foreground`    | `#FAFAFA` | Card text                     |
| `--primary`            | `#00D4FF` | Electric Cyan - CTAs, accents |
| `--primary-foreground` | `#000000` | Text on primary               |
| `--secondary`          | `#1E293B` | Secondary surfaces            |
| `--muted`              | `#27272A` | Muted backgrounds             |
| `--muted-foreground`   | `#A1A1AA` | Muted text                    |
| `--accent`             | `#F59E0B` | Amber accent                  |
| `--border`             | `#27272A` | Borders                       |
| `--ring`               | `#00D4FF` | Focus rings                   |
| `--destructive`        | `#FF4757` | Error states                  |

**Character:** Mission control, hacker command center. Dense data, monospace accents, cyan glow effects. Inspired by Linear, Vercel.

### Theme B: "XO Minimal"

| Token                  | Hex       | Usage                 |
| ---------------------- | --------- | --------------------- |
| `--background`         | `#FFFFFF` | Page background       |
| `--foreground`         | `#09090B` | Primary text          |
| `--card`               | `#FFFFFF` | Card backgrounds      |
| `--card-foreground`    | `#09090B` | Card text             |
| `--primary`            | `#09090B` | Black primary         |
| `--primary-foreground` | `#FAFAFA` | Text on primary       |
| `--secondary`          | `#F4F4F5` | Light gray surfaces   |
| `--muted`              | `#F4F4F5` | Muted backgrounds     |
| `--muted-foreground`   | `#71717A` | Muted text            |
| `--accent`             | `#FF4757` | Coral accent for CTAs |
| `--border`             | `#E4E4E7` | Subtle borders        |
| `--ring`               | `#09090B` | Focus rings           |
| `--destructive`        | `#DC2626` | Error states          |

**Character:** Swiss minimalism, premium clean. Maximum whitespace, bold typography, flat design. Inspired by Notion, Stripe.

### Theme C: "Neural"

| Token                  | Hex       | Usage                 |
| ---------------------- | --------- | --------------------- |
| `--background`         | `#0F0520` | Deep purple-black     |
| `--foreground`         | `#E2E8F0` | Light text            |
| `--card`               | `#1A0A2E` | Purple card bg        |
| `--card-foreground`    | `#F1F5F9` | Card text             |
| `--primary`            | `#8B5CF6` | Violet primary        |
| `--primary-foreground` | `#FFFFFF` | Text on primary       |
| `--secondary`          | `#1E1145` | Deep purple secondary |
| `--muted`              | `#1E1145` | Muted backgrounds     |
| `--muted-foreground`   | `#94A3B8` | Muted text            |
| `--accent`             | `#06B6D4` | Cyan accent           |
| `--border`             | `#2D1B69` | Purple borders        |
| `--ring`               | `#8B5CF6` | Focus rings           |
| `--destructive`        | `#F43F5E` | Rose error            |

**Character:** Futuristic AI brain. Glassmorphism, gradient effects, neural network aesthetic. Inspired by Raycast, GitHub Copilot.

---

## 3. Typography

### Font Stack

| Role      | Font               | Weight  | Fallback              |
| --------- | ------------------ | ------- | --------------------- |
| Headings  | **Space Grotesk**  | 600-700 | system-ui, sans-serif |
| Body      | **Inter**          | 400-500 | system-ui, sans-serif |
| Code/Data | **JetBrains Mono** | 400     | monospace             |

### Type Scale

| Name    | Size            | Line Height | Use              |
| ------- | --------------- | ----------- | ---------------- |
| Display | 36px / 2.25rem  | 1.1         | Page titles      |
| H1      | 30px / 1.875rem | 1.2         | Section headers  |
| H2      | 24px / 1.5rem   | 1.3         | Card titles      |
| H3      | 20px / 1.25rem  | 1.4         | Sub-headers      |
| Body    | 14px / 0.875rem | 1.5         | Default text     |
| Small   | 12px / 0.75rem  | 1.5         | Labels, captions |
| Micro   | 10px / 0.625rem | 1.4         | Badges, tags     |

### Rules

- Headings: Space Grotesk, semibold/bold, tight tracking (-0.02em)
- Body: Inter, regular/medium, normal tracking
- Data: JetBrains Mono, tabular numbers, slightly smaller
- Never mix more than 2 fonts in a single view

---

## 4. Design Tokens

### Spacing

4px base grid: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96

### Border Radius

| Name            | Value  | Use                       |
| --------------- | ------ | ------------------------- |
| `--radius-sm`   | 6px    | Small elements (badges)   |
| `--radius`      | 10px   | Default (inputs, buttons) |
| `--radius-lg`   | 14px   | Cards, panels             |
| `--radius-xl`   | 20px   | Modals, large containers  |
| `--radius-full` | 9999px | Pills, avatars            |

### Shadows (per theme)

**Dark Ops:** Minimal shadows, use border-glow instead (`0 0 10px rgba(0,212,255,0.15)`)
**XO Minimal:** Subtle layered (`0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)`)
**Neural:** Glow shadows (`0 4px 20px rgba(139,92,246,0.15)`)

### Transitions

- Default: `150ms ease`
- Hover effects: `200ms ease-in-out`
- Page transitions: `300ms ease`
- Theme switch: `200ms ease` (with `disableTransitionOnChange` off)

---

## 5. Component Guidelines

### Cards

- Border radius: `--radius-lg` (14px)
- Padding: 24px (CardContent), 20px 24px (CardHeader)
- Border: 1px solid `--border`
- Dark Ops: Add `hover:border-[--primary]/30` for cyan glow on hover
- Neural: Add `backdrop-blur-sm bg-[--card]/80` for glassmorphism

### Buttons

- Primary: `bg-primary text-primary-foreground`
- Height: 36px (sm), 40px (default), 44px (lg)
- Border radius: `--radius` (10px)
- Font: Inter Medium, 14px

### Stat Cards

- Number: Space Grotesk Bold, 28px
- Label: Inter, 12px, muted-foreground
- Icon: 16px, muted-foreground
- Trend indicator: Green up / Red down, 12px

### Status Badges

- Height: 22px, border-radius: full
- Font: 11px, semibold
- Colors: Success (green), Warning (amber), Error (red), Info (blue)

### Sidebar (Admin)

- Width: 240px (desktop), collapsible
- Logo: 32px height, top of sidebar
- Nav items: 36px height, 12px font, 8px gap icon-to-text
- Active: `bg-primary/10 text-primary font-medium`
- Hover: `bg-muted`

---

## 6. Iconography

- **System:** Lucide React (consistent line icons)
- **Size:** 16px (inline), 20px (nav), 24px (headers), 32px (empty states)
- **Stroke:** 1.5px (default Lucide)
- **Color:** `--muted-foreground` default, `--foreground` on hover/active

---

## 7. Theme-Specific Enhancements

### Dark Ops

- Monospace accents for data values (JetBrains Mono)
- Subtle grid pattern background (optional)
- Cyan border-glow on focused/hovered cards
- Status indicators: Pulsing dot animations

### XO Minimal

- Maximum whitespace - 32px gaps between sections
- Bold black headings, light gray body
- Coral accent ONLY for primary CTAs (use sparingly)
- No shadows on cards - borders only

### Neural

- Background gradient: `linear-gradient(180deg, #0F0520 0%, #050208 100%)`
- Glassmorphism: `backdrop-blur-md bg-card/60 border border-border/50`
- Subtle animated dots/particles in background (optional CSS)
- Gradient text for headings: `bg-gradient-to-r from-violet-400 to-cyan-400`

---

## Version

v1.0 - 2026-02-04
