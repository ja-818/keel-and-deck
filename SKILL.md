---
name: deck-ui
description: Deck UI (@deck-ui/*) — React component library for AI agent desktop apps. Teaches your coding agent how to use kanban boards, chat panels, event feeds, memory browsers, and 40+ components with correct props, patterns, and code examples.
---

# Deck UI — Component Skill

> Install with `npx skills add` or drop this file into your project to teach any coding agent how to use Deck UI.

## What This Is

Deck UI (`@deck-ui/*`) is a React component library for building AI agent desktop apps. It provides chat panels, kanban boards, event feeds, memory browsers, routine management, and a full design system — all props-driven, no store dependencies.

## Install

```bash
pnpm add @deck-ui/core @deck-ui/board @deck-ui/chat @deck-ui/layout
```

Apps must import the CSS:
```tsx
import "@deck-ui/core/src/globals.css"
```

## Key Rules

1. **Props over stores** — Components accept data and callbacks via props. Never import Zustand, Redux, or any state library inside Deck UI components.
2. **Generic types** — Use `KanbanItem`, `FeedItem`, `ChatMessage`, etc. Map your app's domain types at the app level.
3. **No `@/` path aliases** — Use relative imports within packages, package imports (`@deck-ui/core`) between packages.
4. **Tailwind CSS 4** — No config file. All tokens are CSS custom properties in `globals.css`. Uses `@tailwindcss/vite` plugin.
5. **Monochrome design** — Near-black primary (`#0d0d0d`), white background, color only for status indicators.

---

## @deck-ui/core

Design system foundation. shadcn/ui components (New York style, Stone base), utilities, and design tokens.

### Button

Interactive button with multiple variants and sizes.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| variant | `"default" \| "destructive" \| "outline" \| "secondary" \| "ghost" \| "link"` | `"default"` | Visual style |
| size | `"default" \| "xs" \| "sm" \| "lg" \| "icon" \| "icon-xs" \| "icon-sm" \| "icon-lg"` | `"default"` | Size preset |
| asChild | `boolean` | `false` | Render as child element via Radix Slot |

```tsx
import { Button } from "@deck-ui/core"

<Button variant="secondary" size="sm" onClick={handleClick}>
  Save Changes
</Button>
```

### Badge

Small label for status or categorization.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| variant | `"default" \| "secondary" \| "destructive" \| "outline"` | `"default"` | Visual style |

```tsx
import { Badge } from "@deck-ui/core"

<Badge variant="secondary">Active</Badge>
```

### Card

Compound container for grouped content.

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@deck-ui/core"

<Card>
  <CardHeader>
    <CardTitle>Project Settings</CardTitle>
    <CardDescription>Configure your project</CardDescription>
  </CardHeader>
  <CardContent>
    {/* form fields */}
  </CardContent>
  <CardFooter>
    <Button>Save</Button>
  </CardFooter>
</Card>
```

### Dialog

Modal dialog built on Radix UI.

| Prop (Dialog) | Type | Default | Description |
|------|------|---------|-------------|
| open | `boolean` | — | Controlled open state |
| onOpenChange | `(open: boolean) => void` | — | Called when open state changes |

```tsx
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@deck-ui/core"

<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm</DialogTitle>
      <DialogDescription>Are you sure?</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Input

Text input field.

```tsx
import { Input } from "@deck-ui/core"

<Input placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} />
```

### Empty

Empty state placeholder. Compound component.

```tsx
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@deck-ui/core"

<Empty>
  <EmptyHeader>
    <EmptyTitle>No messages</EmptyTitle>
    <EmptyDescription>Your inbox is empty.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>Get started</Button>
  </EmptyContent>
</Empty>
```

### DropdownMenu

Dropdown menu built on Radix UI.

```tsx
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@deck-ui/core"

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon-sm">⋮</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={handleEdit}>Edit</DropdownMenuItem>
    <DropdownMenuItem variant="destructive" onClick={handleDelete}>Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Other Core Components

All shadcn/ui components are available: `Accordion`, `Alert`, `AlertDialog`, `Avatar`, `Collapsible`, `Command`, `HoverCard`, `Popover`, `Progress`, `ScrollArea`, `Select`, `Separator`, `Sheet`, `Skeleton`, `Spinner`, `Switch`, `Tabs`, `Textarea`, `Toast`, `ToastContainer`, `Tooltip`.

Import from `@deck-ui/core`. All follow standard shadcn/ui APIs.

### Utilities

```tsx
import { cn } from "@deck-ui/core"     // clsx + tailwind-merge
import { useMobile } from "@deck-ui/core" // mobile viewport hook
```

---

## @deck-ui/board

Kanban board with animated cards that glow when AI agents are running.

### KanbanBoard

Top-level board component. Groups items into columns by status.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| columns | `KanbanColumnConfig[]` | — | Column definitions mapping statuses to visual columns |
| items | `KanbanItem[]` | — | Items to display across columns |
| selectedId | `string \| null` | `null` | ID of currently selected item |
| onSelect | `(item: KanbanItem) => void` | — | Called when a card is clicked |
| onDelete | `(item: KanbanItem) => void` | — | Called when delete is confirmed |
| onApprove | `(item: KanbanItem) => void` | — | Called when approve button is clicked |
| emptyState | `ReactNode` | — | Shown when items is empty |
| renderCard | `(item: KanbanItem) => ReactNode` | — | Custom card renderer |
| runningStatuses | `string[]` | `["running"]` | Statuses that trigger running glow |
| approveStatuses | `string[]` | `["needs_you"]` | Statuses that show approve button |
| actions | `(item: KanbanItem) => ReactNode` | — | Custom action buttons per card |
| avatar | `ReactNode` | — | Avatar shown on all cards |

```tsx
import { useState } from "react"
import { KanbanBoard } from "@deck-ui/board"
import type { KanbanItem, KanbanColumnConfig } from "@deck-ui/board"

const columns: KanbanColumnConfig[] = [
  { id: "active", label: "Active", statuses: ["running"] },
  { id: "review", label: "Review", statuses: ["needs_you"] },
  { id: "done", label: "Done", statuses: ["done"] },
]

function MyBoard({ items }: { items: KanbanItem[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <KanbanBoard
      columns={columns}
      items={items}
      selectedId={selectedId}
      onSelect={(item) => setSelectedId(item.id)}
      onApprove={(item) => approveItem(item.id)}
      runningStatuses={["running"]}
      approveStatuses={["needs_you"]}
    />
  )
}
```

### KanbanDetailPanel

Independent side panel for displaying selected item details.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | `string` | — | Primary text in header |
| subtitle | `string` | — | Secondary text |
| status | `string` | — | Looked up in statusLabels |
| onClose | `() => void` | — | Back button callback |
| children | `ReactNode` | — | Panel body content |
| actions | `ReactNode` | — | Header action buttons |
| runningStatuses | `string[]` | `["running"]` | Statuses that show spinner |
| statusLabels | `Record<string, string>` | built-in map | Maps status to display text |

```tsx
import { KanbanDetailPanel } from "@deck-ui/board"

<KanbanDetailPanel
  title="Deploy v2.0"
  subtitle="Production deployment"
  status="running"
  onClose={() => setSelectedId(null)}
  runningStatuses={["running"]}
>
  <ChatPanel sessionKey={selectedId} ... />
</KanbanDetailPanel>
```

### Board Types

```typescript
interface KanbanItem {
  id: string
  title: string
  subtitle?: string
  status: string
  updatedAt: string
  icon?: React.ReactNode
  metadata?: Record<string, unknown>
}

interface KanbanColumnConfig {
  id: string
  label: string
  statuses: string[]
}
```

---

## @deck-ui/chat

Chat experience for AI agent sessions. Renders messages, tool calls, thinking blocks, streaming markdown, and input.

### ChatPanel

Top-level entry point. Pass FeedItems and callbacks.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| sessionKey | `string` | — | Unique key for the session |
| feedItems | `FeedItem[]` | — | Flat array of feed events |
| onSend | `(text: string) => void` | — | Called when user sends a message |
| onStop | `() => void` | — | Called when user clicks stop |
| onBack | `() => void` | — | Shows back button if provided |
| isLoading | `boolean` | — | Whether the session is loading |
| placeholder | `string` | `"Type a message..."` | Input placeholder |
| emptyState | `ReactNode` | — | Shown when no messages |
| status | `"ready" \| "streaming" \| "submitted"` | auto-derived | Override status |
| thinkingIndicator | `ReactNode` | Shimmer "Thinking..." | Custom loading indicator |
| transformContent | `(content: string) => { content: string; extra?: ReactNode }` | — | Transform assistant messages |
| toolLabels | `Record<string, string>` | — | Custom labels for tool names |
| isSpecialTool | `(name: string) => boolean` | — | Mark tools for special rendering |
| renderToolResult | `(tool: ToolCall) => ReactNode` | — | Custom tool result renderer |

```tsx
import { ChatPanel } from "@deck-ui/chat"
import type { FeedItem } from "@deck-ui/chat"

function MyChat({ items }: { items: FeedItem[] }) {
  return (
    <ChatPanel
      sessionKey="session-1"
      feedItems={items}
      onSend={(text) => sendToAgent(text)}
      isLoading={isStreaming}
      status="streaming"
    />
  )
}
```

### ChatInput

Standalone input bar with send/stop states.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| onSend | `(text: string) => void` | — | Called on submit |
| onStop | `() => void` | — | Called when stop clicked |
| status | `"ready" \| "streaming" \| "submitted"` | — | Controls send/stop button |
| placeholder | `string` | — | Input placeholder |

```tsx
import { ChatInput } from "@deck-ui/chat"

<ChatInput
  onSend={(text) => sendMessage(text)}
  onStop={() => cancelStream()}
  status="ready"
  placeholder="Ask anything..."
/>
```

### ToolActivity

Collapsing tool call list with spinners and elapsed time.

```tsx
import { ToolActivity } from "@deck-ui/chat"

<ToolActivity
  tools={[
    { name: "Read", input: { path: "src/index.ts" } },
    { name: "Bash", input: { command: "npm test" }, result: { content: "OK", is_error: false } },
  ]}
  isStreaming={true}
  toolLabels={{ custom_tool: "Running custom tool" }}
/>
```

### Chat Types

```typescript
interface FeedItem {
  feed_type: "user_message" | "assistant_text" | "assistant_text_streaming"
    | "thinking" | "thinking_streaming" | "tool_call" | "tool_result"
  data: string | { name: string; input: Record<string, unknown> }
    | { content: string; is_error: boolean }
}
```

---

## @deck-ui/layout

App shell components: sidebar, tabs, split view.

### AppSidebar

Navigation sidebar with item list, add/delete actions.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| items | `SidebarItem[]` | — | Navigation items |
| selectedId | `string \| null` | — | Active item ID |
| onSelect | `(id: string) => void` | — | Called when item clicked |
| onAdd | `() => void` | — | Shows add button if provided |
| onDelete | `(id: string) => void` | — | Shows delete on items if provided |
| header | `ReactNode` | — | Header content above items |
| footer | `ReactNode` | — | Footer content below items |

```tsx
import { AppSidebar } from "@deck-ui/layout"

<AppSidebar
  items={projects}
  selectedId={activeProject}
  onSelect={(id) => setActiveProject(id)}
  onAdd={() => createProject()}
  onDelete={(id) => deleteProject(id)}
/>
```

### TabBar

Tab navigation bar with badges and action slots.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| tabs | `Tab[]` | — | Tab definitions |
| activeTab | `string` | — | Active tab ID |
| onTabChange | `(id: string) => void` | — | Called when tab clicked |
| actions | `ReactNode` | — | Right-side action buttons |
| menu | `ReactNode` | — | Settings dropdown |

```tsx
import { TabBar } from "@deck-ui/layout"

<TabBar
  tabs={[
    { id: "board", label: "Board" },
    { id: "chat", label: "Chat", badge: 3 },
    { id: "events", label: "Events" },
  ]}
  activeTab={activeTab}
  onTabChange={setActiveTab}
  actions={<Button size="sm">New Task</Button>}
/>
```

### SplitView

Resizable two-panel layout.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| left | `ReactNode` | — | Left panel content |
| right | `ReactNode` | — | Right panel content |
| defaultSize | `number` | `55` | Left panel default % |
| minSize | `number` | `30` | Minimum panel % |

```tsx
import { SplitView } from "@deck-ui/layout"

<SplitView
  left={<Board ... />}
  right={<ChatPanel ... />}
  defaultSize={55}
/>
```

---

## @deck-ui/events

Event feed and timeline for agent activity.

### EventFeed

Filterable event log.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| events | `EventEntry[]` | — | Events to display |
| filter | `EventType \| "all"` | `"all"` | Active filter |
| onFilterChange | `(filter: EventType \| "all") => void` | — | Filter change callback |
| onEventClick | `(event: EventEntry) => void` | — | Event click callback |

```tsx
import { EventFeed } from "@deck-ui/events"
import type { EventEntry } from "@deck-ui/events"

<EventFeed
  events={events}
  filter={activeFilter}
  onFilterChange={setActiveFilter}
  onEventClick={(event) => openDetail(event)}
/>
```

### Event Types

```typescript
interface EventEntry {
  id: string
  type: EventType    // "heartbeat" | "message" | "cron" | "webhook" | "system"
  status: EventStatus // "success" | "error" | "pending" | "skipped"
  source: EventSource // "agent" | "user" | "system" | "schedule"
  title: string
  description?: string
  timestamp: string
  metadata?: Record<string, unknown>
}
```

---

## @deck-ui/memory

Memory/knowledge base browser for agent memory.

### MemoryBrowser

Full memory browser with search, category filter, and detail view.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| memories | `Memory[]` | — | Memory items |
| onSelect | `(memory: Memory) => void` | — | Memory click callback |
| onDelete | `(id: string) => void` | — | Delete callback |
| onSearch | `(query: string) => void` | — | Search callback |
| onCategoryChange | `(category: MemoryCategory \| "all") => void` | — | Filter callback |
| selectedId | `string \| null` | — | Active memory ID |

```tsx
import { MemoryBrowser } from "@deck-ui/memory"
import type { Memory } from "@deck-ui/memory"

<MemoryBrowser
  memories={memories}
  onSelect={(memory) => setSelected(memory)}
  onSearch={(query) => filterMemories(query)}
  onCategoryChange={(cat) => setCategory(cat)}
/>
```

### Memory Types

```typescript
interface Memory {
  id: string
  title: string
  content: string
  category: MemoryCategory  // "preference" | "fact" | "context" | "instruction" | "learning"
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}
```

---

## @deck-ui/routines

Routine management — grids, scheduling, heartbeat configuration.

### RoutinesGrid

Grid of routine cards.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| routines | `Routine[]` | — | Routines to display |
| onSelect | `(routine: Routine) => void` | — | Card click callback |
| onToggle | `(routine: Routine) => void` | — | Pause/resume callback |
| onCreate | `() => void` | — | Shows create button |

```tsx
import { RoutinesGrid } from "@deck-ui/routines"

<RoutinesGrid
  routines={routines}
  onSelect={(routine) => openDetail(routine)}
  onToggle={(routine) => toggleRoutine(routine)}
  onCreate={() => openCreateForm()}
/>
```

### HeartbeatConfigPanel

Configure polling/heartbeat intervals.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| config | `HeartbeatConfig` | — | Current configuration |
| onChange | `(config: HeartbeatConfig) => void` | — | Config change callback |

```tsx
import { HeartbeatConfigPanel } from "@deck-ui/routines"

<HeartbeatConfigPanel config={heartbeat} onChange={setHeartbeat} />
```

### ScheduleBuilder

Visual cron schedule builder.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| value | `string` | — | Cron expression |
| onChange | `(cron: string) => void` | — | Cron change callback |
| presets | `SchedulePreset[]` | built-in | Schedule presets |

```tsx
import { ScheduleBuilder } from "@deck-ui/routines"

<ScheduleBuilder value={cron} onChange={setCron} />
```

---

## @deck-ui/connections

Integration and connection management.

### ConnectionsView

Main connections dashboard showing connected apps and channels.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| connections | `Connection[]` | — | Connected services |
| channels | `ChannelConnection[]` | — | Channel integrations |
| onConnect | `(type: string) => void` | — | Connect new service |
| onDisconnect | `(id: string) => void` | — | Disconnect service |
| onChannelSetup | `(type: ChannelType) => void` | — | Set up channel |

```tsx
import { ConnectionsView } from "@deck-ui/connections"

<ConnectionsView
  connections={connections}
  channels={channels}
  onConnect={(type) => startOAuth(type)}
  onDisconnect={(id) => revokeConnection(id)}
/>
```

### ChannelSetupForm

Form to configure a channel integration (Slack, Telegram, etc.).

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| channelType | `ChannelType` | — | Type of channel |
| onSubmit | `(config: Record<string, string>) => void` | — | Form submit callback |
| onCancel | `() => void` | — | Cancel callback |
| error | `string` | — | Error message to display |

```tsx
import { ChannelSetupForm } from "@deck-ui/connections"

<ChannelSetupForm
  channelType="slack"
  onSubmit={(config) => saveChannel(config)}
  onCancel={() => goBack()}
/>
```

---

## Common Patterns

### App Shell

```tsx
import { AppSidebar } from "@deck-ui/layout"
import { TabBar } from "@deck-ui/layout"
import { SplitView } from "@deck-ui/layout"
import { KanbanBoard } from "@deck-ui/board"
import { ChatPanel } from "@deck-ui/chat"

function App() {
  return (
    <div className="flex h-screen">
      <AppSidebar items={projects} selectedId={activeId} onSelect={setActiveId} />
      <div className="flex-1 flex flex-col">
        <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        <SplitView
          left={<KanbanBoard columns={columns} items={items} onSelect={setSelected} />}
          right={<ChatPanel sessionKey={selectedId} feedItems={feed} onSend={send} isLoading={loading} />}
        />
      </div>
    </div>
  )
}
```

### Connecting Stores to Components

Components are props-driven. Connect your state at the app level:

```tsx
// Your app maps domain types to Deck UI types
const kanbanItems: KanbanItem[] = issues.map((issue) => ({
  id: issue.id,
  title: issue.title,
  subtitle: issue.description,
  status: issue.status,
  updatedAt: issue.updated_at,
}))

<KanbanBoard columns={columns} items={kanbanItems} ... />
```

### CSS Setup

```tsx
// main.tsx or App.tsx
import "@deck-ui/core/src/globals.css"

// If using ChatPanel with markdown rendering:
import "streamdown/styles.css"
```

### Tailwind 4 Configuration

No `tailwind.config.ts` needed. Use `@tailwindcss/vite` plugin:

```ts
// vite.config.ts
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

In your CSS, add `@source` directives for Deck UI packages:

```css
@import "tailwindcss";
@import "@deck-ui/core/src/globals.css";

@source "../node_modules/@deck-ui/core/src";
@source "../node_modules/@deck-ui/board/src";
@source "../node_modules/@deck-ui/chat/src";
@source "../node_modules/@deck-ui/layout/src";
```
