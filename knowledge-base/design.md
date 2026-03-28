# Keel & Deck — Design System

## Origin

The design system is extracted from Houston, which follows ChatGPT's visual language: near-black primary, monochrome palette, clean typography, minimal chrome.

---

## Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#ffffff` | App background |
| `--foreground` | `#0d0d0d` | Primary text |
| `--secondary` | `#f9f9f9` | Sidebar, card backgrounds |
| `--muted-foreground` | `#5d5d5d` | Secondary text |
| `--border` | `#e5e5e5` | Borders, dividers |
| `--ring` | `#0d0d0d` | Focus rings |
| `--accent` | `#f5f5f5` | Hover backgrounds |

**Rule:** Monochrome first. Color is reserved for status indicators (running = blue glow, error = red).

---

## Typography

- System font stack (no custom fonts)
- Body: 14px
- Headings: weight 600, no oversized text
- Monospace for code: system monospace stack

---

## Component Patterns

### Cards
- White background, subtle border (`border-black/5`)
- Rounded corners (`rounded-xl`)
- Hover: slight shadow elevation
- Running state: `card-running-glow` animation border

### Buttons
- Primary: black background, white text
- Secondary: transparent, subtle hover
- Ghost: no border, opacity hover
- All: `rounded-lg`, compact padding

### Badges
- Active: black bg, white text (pill shape)
- Inactive: gray bg, gray text
- Small, `rounded-full`

### Input Fields
- Minimal border
- Focus: ring outline
- Auto-expand textareas where appropriate

---

## Animations

### card-running-glow
The signature animation. Rotating conic-gradient border on active AI agent cards.
- Colors: transparent → blue (#3b82f6) → indigo (#818cf8) → orange (#f97316) → yellow
- Duration: 2.5s infinite
- Creates a "comet tail" effect around the card border

### Framer Motion (Board)
- Card enter: `opacity: 0, y: 8` → `opacity: 1, y: 0`
- Card exit: `opacity: 0, y: -8`
- Duration: 0.2s, easing: `[0.25, 0.1, 0.25, 1]`
- AnimatePresence with `popLayout` mode

### typing-bounce
3-dot typing indicator with vertical translation + opacity cycling.

### tool-pulse
Pulsing dot (scale + opacity) for active tool calls. 1s duration.

---

## Layout

### App Shell
```
┌─────────────────────────────────────────────┐
│ Sidebar │ Tab Bar              │ Right Panel │
│ (200px) │──────────────────────│ (optional)  │
│         │ Main Content         │             │
│         │                      │             │
│         │                      │             │
└─────────────────────────────────────────────┘
```

- Sidebar: 200px fixed, `#f5f5f5` background
- Tab bar: full width, underline active indicator
- Right panel: 45% width, 380px min (for detail/chat)
- Split view: resizable, default 55/45

---

## Rules

1. **No emoji as icons.** Use Lucide React icons or real logos with initial-letter fallback.
2. **No hover-only affordances.** All interactive elements must be visible without hovering.
3. **Monochrome by default.** Color only for status and emphasis.
4. **Compact, not cramped.** Generous whitespace but no wasted space.
5. **Animations serve purpose.** Running glow = feedback. Card transitions = spatial orientation. No decorative animation.
