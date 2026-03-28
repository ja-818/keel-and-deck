# Keel & Deck — Frameworks & Patterns

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| UI framework | React | 19 |
| Language | TypeScript | 5+ |
| Styling | Tailwind CSS | 4 (Vite plugin, no PostCSS config) |
| Components | shadcn/ui (New York style, Stone base) | Latest |
| Animation | Framer Motion | 12 |
| Icons | Lucide React | Latest |
| Build | pnpm workspaces | — |

---

## Package Architecture

### Workspace Layout
This is a pnpm monorepo. Each package under `packages/` is a self-contained npm package.

```
packages/
├── core/     → @deck-ui/core     (peer dep of all others)
├── chat/     → @deck-ui/chat     (depends on core)
├── board/    → @deck-ui/board    (depends on core)
└── layout/   → @deck-ui/layout   (depends on core)
```

### Dependency Rules
- `@deck-ui/core` has NO internal package dependencies
- All other packages peer-depend on `@deck-ui/core`
- No package depends on another non-core package
- React is always a peer dependency, never a direct dependency

### Import Patterns
Within a package, use **relative imports**:
```typescript
import { cn } from "../utils"
import { Button } from "./button"
```

Between packages, use **package imports**:
```typescript
import { cn, Button } from "@deck-ui/core"
```

**Never use `@/` path aliases.** They don't work in published libraries.

---

## Component Patterns

### Props over stores
Every component is props-driven. No Zustand, no global state, no context providers (except internal component state like collapsible/dialog).

**Why:** These components are consumed by apps that have their own state management. We don't dictate how data flows — we just render what we're given.

### Render props for extensibility
When a component needs customizable rendering (e.g., ChatPanel's tool results), use render props:
```typescript
interface ChatPanelProps {
  renderToolResult?: (tool: ToolCall) => ReactNode
  isSpecialTool?: (name: string) => boolean
}
```

### Slots for composition
When a component has optional regions, use children or named ReactNode props:
```typescript
interface TabBarProps {
  actions?: ReactNode   // right-side action buttons
  menu?: ReactNode      // settings dropdown
}
```

---

## shadcn/ui Patterns

### All components follow shadcn conventions:
- `data-slot` attributes on every element for CSS targeting
- `cn()` utility for class composition (clsx + tailwind-merge)
- Radix UI primitives as headless base for complex components
- CVA (class-variance-authority) for variant management
- `asChild` pattern via Radix `Slot` for component composition

### Adding new shadcn components:
1. Check Houston first — it may already have the component
2. Use `npx shadcn@latest add <component>` in a scratch project
3. Copy to `packages/core/src/components/`
4. Update imports: `@/lib/utils` → `../utils`, `@/components/ui/X` → `./X`
5. Export from `packages/core/src/index.ts`

---

## Tailwind CSS 4

Tailwind 4 uses the Vite plugin (`@tailwindcss/vite`), NOT PostCSS. There is:
- No `tailwind.config.ts`
- No `postcss.config.js`
- Configuration is in `globals.css` via `@theme` blocks

### CSS Custom Properties
All design tokens are CSS custom properties defined in `globals.css`. Apps consuming these packages must import the CSS:
```typescript
import "@deck-ui/core/src/globals.css"
```

---

## Framer Motion Patterns

### Board card animations
```typescript
<AnimatePresence mode="popLayout">
  <motion.div
    key={item.id}
    layout
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
  />
</AnimatePresence>
```

### Key rules:
- Always use `layout` prop for items that reorder
- Use `AnimatePresence` with `mode="popLayout"` for lists
- Keep transitions under 0.3s — snappy, not slow
- Exit animations go upward (y: -8), enter from below (y: 8)

---

## Type Patterns

### Generic interfaces
Board and chat components use minimal, generic interfaces:

```typescript
// Board
interface BoardItem {
  id: string
  title: string
  subtitle?: string
  status: string
  updatedAt: string
}

// Chat
interface FeedItem {
  type: "user_message" | "assistant_text" | "thinking" | "tool_call" | ...
  content: string
  timestamp?: string
}
```

### No Houston types
These packages must NEVER import Houston-specific types (Issue, Skill, Routine, etc.). If a Houston type needs to be used with a Deck component, Houston maps it to the generic type at the app level.

---

## Gotchas

1. **Tailwind v4 has no config file.** Don't create `tailwind.config.ts`. All config is in CSS.
2. **No `@/` aliases in library code.** They work in apps but break in published packages. Use relative imports.
3. **`motion` vs `framer-motion`:** Both packages exist in deps. `motion` is the newer name. Import from `motion` for the `Motion.create()` API, `framer-motion` for `AnimatePresence`, `motion.div`, etc.
4. **streamdown CSS:** ChatPanel needs `streamdown/styles.css` imported by the consuming app, not by the library.
5. **Toast container is props-driven.** Unlike Houston where it reads from UIStore, Deck's ToastContainer accepts `toasts` and `onDismiss` as props.
